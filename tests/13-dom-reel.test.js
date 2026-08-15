/**
 * Extraction sur une reproduction du DOM réellement observé.
 *
 * Deux enseignements de la capture d'écran :
 *  - sous « Toutes les réponses », le premier message est celui du Product Expert,
 *    pas la question — supposer le contraire désignait le PE comme demandeur ;
 *  - le forum marque la personne ayant posé la question du badge « Auteur d'origine »,
 *    repère bien plus fiable que la position dans la liste.
 */
const fs = require('fs'), vm = require('vm');

// Reproduction simplifiée de la structure observée
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

const carteFabrice = faireElement('div', null, [
  faireElement('a', 'Fabrice_Fx', [], '/s/community/user/111'),
  faireElement('span', 'Expert Produit niveau Diamant'),
  faireElement('span', 'il y a 2 h'),
  faireElement('div', "Without your password and without access to both your recovery email and phone number, recovering this Google account is not possible."),
  faireElement('button', 'Recommander')
]);

const carteDemandeur = faireElement('div', null, [
  faireElement('a', 'User 16095068134704039798', [], '/s/community/user/222'),
  faireElement('span', "Auteur d'origine"),
  faireElement('span', 'il y a 23 min'),
  faireElement('div', "How is that possible ?i cant get the number because i lost the phone and i can't remember the password ....but other information is available"),
  faireElement('button', 'Recommander'),
  faireElement('a', 'Ajouter un commentaire')
]);

// Carte de question, en tête de page — elle porte elle aussi un lien de profil
const carteQuestion = faireElement('div', null, [
  faireElement('a', 'User 16095068134704039798', [], '/s/community/user/222'),
  faireElement('span', "Auteur d'origine"),
  faireElement('span', 'il y a 2 h'),
  faireElement('span', '25 vues'),
  faireElement('span', '1 réponse'),
  faireElement('div', "i can't open my gmail because i forgot my google account password"),
  faireElement('div', "i no longer have access to ot recovery email abd phone number"),
  faireElement('span', 'Verrouillé partiellement'),
  faireElement('span', 'Cette question est partiellement verrouillée. Seuls les Experts Produit et l\'auteur d\'origine peuvent y répondre.'),
  faireElement('button', 'Répondre'),
  faireElement('button', "J'ai la même question (0)"),
  faireElement('button', 'Se désabonner')
]);

const racine = faireElement('div', null, [carteQuestion, carteFabrice, carteDemandeur]);

const noop = () => {};
const sandbox = {
  console: { log: noop, warn: noop, error: noop },
  document: {
    addEventListener: noop, getElementById: () => null, querySelector: () => null,
    querySelectorAll: (sel) => (sel.indexOf('user') !== -1 || sel.indexOf('profile') !== -1)
      ? racine.querySelectorAll('user') : [],
    createElement: () => ({ style: {}, addEventListener: noop }),
    body: { appendChild: noop }, evaluate: () => ({ singleNodeValue: null }), title: ''
  },
  window: { location: { pathname: '/x', href: 'https://x' }, getComputedStyle: () => ({}) },
  chrome: { storage: { local: { get: noop }, sync: { get: noop } }, runtime: { sendMessage: noop } },
  MutationObserver: class { observe() {} },
  setTimeout: noop, clearTimeout: noop,
  navigator: { clipboard: { writeText: noop } },
  Date: Date, XPathResult: { FIRST_ORDERED_NODE_TYPE: 9 }
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync('extension/content.js', 'utf8'), sandbox);

const { extraireFilStructure, trouverDemandeur, isolerRelanceStructuree, formaterRelance, nettoyerCorpsMessage } = sandbox;

let fails = 0;
const check = (n, a, p) => { const ok = p(a); if (!ok) fails++; console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n); if (!ok) console.log('        obtenu : ' + JSON.stringify(a).slice(0, 240)); };

console.log('\nLecture du fil sans dépendre des noms de classes');
const messages = extraireFilStructure();
check('trois cartes détectées (question + 2 réponses)', messages.length, n => n === 3);
check('la question vient en premier', messages[0] && messages[0].author, v => v === 'User 16095068134704039798');
check('la réponse du PE ensuite', messages[1] && messages[1].author, v => v === 'Fabrice_Fx');
check('la relance en dernier', messages[2] && messages[2].author, v => v === 'User 16095068134704039798');

console.log('\nBruit d\'interface de la carte de question');
const q = messages[0].text;
check('« Verrouillé partiellement » retiré', q, t => !t.includes('Verrouillé partiellement'));
check('avertissement de verrouillage retiré', q, t => !t.includes('partiellement verrouillée'));
check('bouton Répondre retiré', q, t => !/^Répondre$/m.test(t));
check('« J\'ai la même question » retiré', q, t => !t.includes("J'ai la même question"));
check('« Se désabonner » retiré', q, t => !t.includes('Se désabonner'));
check('compteurs de vues retirés', q, t => !t.includes('25 vues'));
check('la question elle-même est conservée', q, t => t.includes('i forgot my google account password'));

console.log('\nNettoyage des éléments d\'interface');
const corps = messages[1] ? messages[1].text : '';
check('badge d\'expertise retiré', corps, t => !t.includes('Expert Produit'));
check('horodatage retiré',         corps, t => !t.includes('il y a 2 h'));
check('bouton Recommander retiré', corps, t => !t.includes('Recommander'));
check('nom de l\'auteur retiré',   corps, t => !t.includes('Fabrice_Fx'));
check('le message est conservé',   corps, t => t.includes('recovering this Google account is not possible'));
check('« Ajouter un commentaire » retiré', messages[1].text, t => !t.includes('Ajouter un commentaire'));

console.log('\nIdentification du demandeur par le badge');
check('badge repéré sur la relance', messages[2].isOriginalPoster, v => v === true);
check('badge repéré sur la question',  messages[0].isOriginalPoster, v => v === true);
check('le Product Expert n\'est pas marqué', messages[1].isOriginalPoster, v => v === false);
check('demandeur correctement identifié', trouverDemandeur(messages), v => v === 'User 16095068134704039798');

console.log('\nLe badge reste la source de vérité, quelle que soit la mise en page');
check('demandeur identifié malgré deux cartes à son nom', trouverDemandeur(messages), v => v === 'User 16095068134704039798');
check('le Product Expert n\'est jamais pris pour le demandeur', trouverDemandeur(messages), v => v !== 'Fabrice_Fx');

console.log('\nIsolement de la relance');
const r = isolerRelanceStructuree(messages, 'Fabrice_Fx', '');
check('méthode fiable retenue', r.fiable, v => v === true);
check('un seul message postérieur', r.messages.length, n => n === 1);
check('c\'est bien la relance du demandeur', r.messages[0].text, t => t.includes('i lost the phone'));

const formate = formaterRelance(r.messages, trouverDemandeur(messages));
check('rôle correctement étiqueté', formate, t => t.includes('(auteur de la question)'));

console.log('\n' + (fails === 0 ? 'Tous les tests passent.' : fails + ' test(s) en echec.'));
process.exit(fails ? 1 : 0);
