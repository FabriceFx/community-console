/**
 * Cas réel rencontré sur un fil « Fiche d'établissement Google ».
 *
 * Le diagnostic affichait :
 *   demandeur : Ornella PASSAAuteur d'origine
 *   2. JEROME G-GH — JEROME G-GH (Expert Produit niveau Diamant) a recommandé cec…
 *   3. JEROME G-GH — JEROME G-GH (Expert Produit niveau Diamant) a recommandé cec…
 *
 * Deux défauts : le badge imbriqué dans le lien de profil polluait le nom de l'auteur,
 * et les notifications de recommandation étaient comptées comme des messages du fil.
 */
const fs = require('fs'), vm = require('vm');

function faireElement(tag, texte, enfants, href) {
  const el = {
    tagName: tag.toUpperCase(),
    _texte: texte || '',
    _enfants: enfants || [],
    href: href || null,
    parentElement: null,
    get innerText() {
      if (this._enfants.length) return this._enfants.map(e => e.innerText).join('\n');
      return this._texte;
    },
    querySelectorAll(sel) {
      const res = [];
      const visite = (n) => {
        if (n !== el && n.tagName === 'A' && n.href && sel.indexOf('user') !== -1) res.push(n);
        n._enfants.forEach(visite);
      };
      visite(el);
      return res;
    }
  };
  el._enfants.forEach(e => { e.parentElement = el; });
  return el;
}

// Le badge est imbriqué DANS le lien de profil, comme observé
const carteQuestion = faireElement('div', null, [
  faireElement('a', null, [
    faireElement('span', 'Ornella PASSA'),
    faireElement('span', "Auteur d'origine")
  ], '/s/community/user/111'),
  faireElement('div', "Fiche d'établissement Google Ornella PASSA Reprise d'un établissement déjà référencé, je ne parviens pas à récupérer la fiche."),
  faireElement('span', 'Verrouillé partiellement')
]);

// Notifications de recommandation : un lien de profil, mais pas un message
const notif1 = faireElement('div', null, [
  faireElement('a', 'JEROME G-GH', [], '/s/community/user/222'),
  faireElement('span', 'JEROME G-GH (Expert Produit niveau Diamant) a recommandé ceci')
]);
const notif2 = faireElement('div', null, [
  faireElement('a', 'JEROME G-GH', [], '/s/community/user/333'),
  faireElement('span', 'JEROME G-GH (Expert Produit niveau Diamant) a recommandé ceci')
]);

const racine = faireElement('div', null, [carteQuestion, notif1, notif2]);

const noop = () => {};
const sandbox = {
  console: { log: noop, warn: noop, error: noop },
  document: {
    addEventListener: noop, getElementById: () => null, querySelector: () => null,
    querySelectorAll: (sel) => (sel.indexOf('user') !== -1 || sel.indexOf('profile') !== -1) ? racine.querySelectorAll('user') : [],
    createElement: () => ({ style: {}, addEventListener: noop }),
    body: { appendChild: noop, innerText: 'Verrouillé partiellement' },
    evaluate: () => ({ singleNodeValue: null }), title: ''
  },
  window: { location: { pathname: '/x', href: 'https://x' }, getComputedStyle: () => ({}) },
  chrome: { storage: { local: { get: noop }, sync: { get: noop } }, runtime: { sendMessage: noop, getManifest: () => ({ version: 't' }) } },
  MutationObserver: class { observe() {} }, setTimeout: noop, clearTimeout: noop,
  navigator: { clipboard: { writeText: noop } }, Date: Date, XPathResult: { FIRST_ORDERED_NODE_TYPE: 9 }
};
sandbox.window = sandbox; sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync('extension/content.js', 'utf8'), sandbox);

const { extraireFilStructure, trouverDemandeur, nettoyerNomAuteur, doitAfficherRelance } = sandbox;

let fails = 0;
const check = (n, a, p) => { const ok = p(a); if (!ok) fails++; console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n); if (!ok) console.log('        obtenu : ' + JSON.stringify(a)); };

console.log('\nNom d\'auteur débarrassé du badge imbriqué');
check('badge retiré du nom',            nettoyerNomAuteur("Ornella PASSA\nAuteur d'origine"), v => v === 'Ornella PASSA');
check('niveau d\'expertise retiré',     nettoyerNomAuteur("JEROME G-GH\nExpert Produit niveau Diamant"), v => v === 'JEROME G-GH');
check('parenthèses d\'expertise gérées', nettoyerNomAuteur("JEROME G-GH\n(Expert Produit niveau Diamant)"), v => v === 'JEROME G-GH');
check('horodatage retiré',              nettoyerNomAuteur("Ornella PASSA\nil y a 2 h"), v => v === 'Ornella PASSA');
check('nom simple inchangé',            nettoyerNomAuteur('Fabrice_Fx'), v => v === 'Fabrice_Fx');
check('valeur vide tolérée',            nettoyerNomAuteur(''), v => v === '');

console.log('\nNotifications de recommandation écartées du fil');
const messages = extraireFilStructure();
check('seule la question est retenue',   messages.length, n => n === 1);
check('aucune notification comptée',     messages.map(m => m.text).join(), t => !t.includes('a recommandé'));
check('la question est bien conservée',  messages[0] && messages[0].text, t => t && t.includes("Reprise d'un établissement"));

console.log('\nDemandeur correctement nommé');
check('plus de nom concaténé', trouverDemandeur(messages), v => v === 'Ornella PASSA');
check('badge détecté malgré l\'imbrication', messages[0].isOriginalPoster, v => v === true);

console.log('\nConséquence sur le bouton');
check('aucune réponse réelle → bouton masqué', doitAfficherRelance(messages, 'Fabrice_Fx'), v => v === false);

console.log('\nUne vraie réponse citant le mot « recommandé » n\'est pas écartée');
const vraieReponse = faireElement('div', null, [
  faireElement('a', 'Fabrice_Fx', [], '/s/community/user/444'),
  faireElement('div', "Pour reprendre la fiche, la procédure de revendication est la seule voie. Je vous la recommande car elle déclenche une vérification par Google, contrairement aux autres options que vous auriez pu voir circuler.")
]);
const racine2 = faireElement('div', null, [carteQuestion, vraieReponse]);
sandbox.document.querySelectorAll = (sel) => (sel.indexOf('user') !== -1 || sel.indexOf('profile') !== -1) ? racine2.querySelectorAll('user') : [];
const messages2 = extraireFilStructure();
check('la réponse est conservée', messages2.length, n => n === 2);
check('son contenu est intact',   messages2[1] && messages2[1].text, t => t && t.includes('procédure de revendication'));

if (fails) { console.log('\n' + fails + ' test(s) en echec.'); process.exit(1); }

// ---------------------------------------------------------------------------
// Robustesse du diagnostic : la Community Console rend son contenu après coup,
// et un content script qui inspecte le DOM trop tôt le trouve vide. Ce constat
// ne doit ni être définitif, ni être consigné comme une erreur d'extension.
// ---------------------------------------------------------------------------
const src = fs.readFileSync('extension/content.js', 'utf8');

let fails3 = 0;
const check3 = (n, a, p) => { const ok = p(a); if (!ok) fails3++; console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n); };

console.log('\nEspaces insécables de l\'interface');
const NBSP = '\u00a0';
check3('compteur « 2<nbsp>vues » filtré',
  sandbox.nettoyerCorpsMessage('Titre du fil\n2' + NBSP + 'vues\nCorps du message réellement utile.', ''),
  t => !t.includes('vues'));
check3('compteur « 2 vues 1 réponse » filtré',
  sandbox.nettoyerCorpsMessage('Titre\n2 vues 1 réponse\nCorps du message réellement utile.', ''),
  t => !t.includes('vues'));
check3('horodatage anglais filtré',
  sandbox.nettoyerCorpsMessage('Titre\n23 minutes\nCorps du message réellement utile.', ''),
  t => !t.includes('minutes'));
check3('le corps est préservé',
  sandbox.nettoyerCorpsMessage('Titre\n2' + NBSP + 'vues\nCorps du message réellement utile.', ''),
  t => t.includes('réellement utile'));
check3('un nombre en début de phrase utile est conservé',
  sandbox.nettoyerCorpsMessage("2 fichiers ne se synchronisent plus depuis hier matin.", ''),
  t => t.includes('fichiers'));

console.log('\nLe diagnostic tolère un rendu différé');
check3('un plafond de tentatives est défini',   src, t => t.includes('MAX_TENTATIVES_DIAGNOSTIC'));
check3('les essais infructueux sont comptés',   src, t => t.includes('tentativesDiagnostic++'));
check3('sortie discrète tant que le quota tient', src, t => t.includes('if (tentativesDiagnostic < MAX_TENTATIVES_DIAGNOSTIC) return;'));
check3('des reprises différées sont programmées', src, t => t.includes('setTimeout(initTracker, 4000)') && t.includes('setTimeout(initTracker, 9000)'));

console.log('\nLes messages d\'information ne polluent pas la page d\'erreurs');
check3('constat final en console.log',          src, t => t.includes('"%c[PE Tracker] Aucun message lu après "'));
check3('nom manquant en console.log',           src, t => t.includes("%c[PE Tracker] Nom d'affichage non renseigné"));
check3('aucun console.warn dans le diagnostic', src.slice(src.indexOf('function diagnostiquerUneFois'), src.indexOf('window.__peTrackerDiagnostic')), t => !/console\.warn\(/.test(t));

if (fails3) { console.log('\n' + fails3 + ' test(s) en echec.'); process.exit(1); }
console.log('\nTous les tests passent.');
