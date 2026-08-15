/**
 * Extraction structurée d'un fil de discussion.
 *
 * Un fil réel contient la question, la réponse du Product Expert, parfois celle
 * d'un autre bénévole, puis la relance du demandeur. Sans attribution des auteurs,
 * impossible de distinguer une relance à traiter d'un message de collègue.
 */
const fs = require('fs'), vm = require('vm');

const noop = () => {};
const sandbox = {
  console: { log: noop, warn: noop, error: noop },
  document: { addEventListener: noop, getElementById: () => null, querySelector: () => null,
    querySelectorAll: () => [], createElement: () => ({ style: {}, addEventListener: noop }),
    body: { appendChild: noop }, evaluate: () => ({ singleNodeValue: null }), title: '' },
  window: { location: { pathname: '/x', href: 'https://x' }, getComputedStyle: () => ({}) },
  chrome: { storage: { local: { get: noop }, sync: { get: noop } }, runtime: { sendMessage: noop } },
  MutationObserver: class { observe() {} },
  setTimeout: noop, clearTimeout: noop,
  navigator: { clipboard: { writeText: noop } },
  Date: Date, XPathResult: { FIRST_ORDERED_NODE_TYPE: 9 }
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync('extension/content.js', 'utf8'), sandbox);

const { isolerRelanceStructuree, formaterRelance, memeAuteur } = sandbox;

let fails = 0;
const check = (n, a, p) => { const ok = p(a); if (!ok) fails++; console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n); if (!ok) console.log('        obtenu : ' + JSON.stringify(a).slice(0, 260)); };

// Fil réaliste : question, réponse du PE, autre PE, relance du demandeur
const FIL = [
  { author: 'Fleur bleue', text: "Bonjour, je n'arrive plus à partager mes fichiers Drive depuis hier." },
  { author: 'Fabrice_Fx', text: "Le partage externe est bloqué par une règle du domaine. Demandez à votre administrateur Workspace de l'autoriser." },
  { author: 'Hyde', text: "À noter que cela peut aussi venir d'un Drive partagé, dont les règles sont distinctes." },
  { author: 'Fleur bleue', text: "Mon administrateur dit que le partage est bien ouvert, et le fichier est dans mon Drive personnel." }
];

console.log('\nRepérage par nom d\'affichage — la voie fiable');
let r = isolerRelanceStructuree(FIL, 'Fabrice_Fx', '');
check('méthode retenue', r.methode, v => v === 'nom du Product Expert');
check('résultat considéré fiable', r.fiable, v => v === true);
check('deux messages postérieurs retenus', r.messages.length, n => n === 2);
check('la question initiale est écartée', r.messages.map(m => m.text).join(), t => !t.includes("je n'arrive plus"));
check('la réponse du PE est écartée', r.messages.map(m => m.text).join(), t => !t.includes("règle du domaine"));
check('le message de l\'autre PE est retenu', r.messages[0].author, v => v === 'Hyde');
check('la relance du demandeur est retenue', r.messages[1].author, v => v === 'Fleur bleue');

console.log('\nTolérance sur le nom d\'affichage');
['fabrice_fx', 'FABRICE_FX', ' Fabrice_Fx ', 'Fabrice Fx'].forEach(nom =>
  check('« ' + nom + ' » reconnu', isolerRelanceStructuree(FIL, nom, '').fiable, v => v === true));
check('un homonyme partiel ne casse pas le repérage', memeAuteur('Fleur bleue', 'Fabrice_Fx'), v => v === false);

console.log('\nRepli par contenu quand le nom n\'est pas renseigné');
r = isolerRelanceStructuree(FIL, '', "Le partage externe est bloqué par une règle du domaine. Demandez à votre administrateur Workspace de l'autoriser.");
check('méthode retenue', r.methode, v => v === 'contenu de votre réponse');
check('résultat fiable', r.fiable, v => v === true);
check('deux messages postérieurs', r.messages.length, n => n === 2);

console.log('\nRepli dégradé — signalé comme non fiable');
r = isolerRelanceStructuree(FIL, '', '');
check('dernier message seulement', r.messages.length, n => n === 1);
check('incertitude signalée', r.fiable, v => v === false);
check('méthode explicite', r.methode, v => v === 'dernier message du fil');

console.log('\nCas où le PE a écrit en dernier');
const filSansRelance = FIL.slice(0, 2);
r = isolerRelanceStructuree(filSansRelance, 'Fabrice_Fx', '');
check('aucun message postérieur', r.messages.length, n => n === 0);
check('fil vide toléré', isolerRelanceStructuree([], 'Fabrice_Fx', '').messages.length, n => n === 0);

console.log('\nPlusieurs réponses du PE : seule la dernière fait référence');
const filLong = FIL.concat([
  { author: 'Fabrice_Fx', text: "Dans ce cas, vérifions le type d'emplacement du fichier." },
  { author: 'Fleur bleue', text: "C'est bien un fichier de mon Drive personnel, créé la semaine dernière." }
]);
r = isolerRelanceStructuree(filLong, 'Fabrice_Fx', '');
check('un seul message retenu après le dernier message du PE', r.messages.length, n => n === 1);
check('c\'est bien le plus récent', r.messages[0].text, t => t.includes('créé la semaine dernière'));

console.log('\nMise en forme avec les rôles');
const formate = formaterRelance(FIL.slice(2), 'Fleur bleue');
check('le demandeur est identifié', formate, t => t.includes('Fleur bleue (auteur de la question)'));
check('l\'autre bénévole est distingué', formate, t => t.includes('Hyde (autre intervenant)'));
check('les textes sont conservés', formate, t => t.includes('Drive partagé') && t.includes('Drive personnel'));
check('auteur inconnu géré',
  formaterRelance([{ author: '', text: 'Message sans auteur identifiable.' }], 'Fleur bleue'),
  t => t.includes('Intervenant inconnu'));

console.log('\n' + (fails === 0 ? 'Tous les tests passent.' : fails + ' test(s) en echec.'));
process.exit(fails ? 1 : 0);
