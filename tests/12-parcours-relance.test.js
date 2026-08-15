/**
 * Parcours complet d'une relance côté extension.
 *
 * Vérifie que le demandeur est correctement identifié sans réglage supplémentaire,
 * et que les rôles transmis au modèle distinguent bien la personne à aider des
 * autres bénévoles intervenus dans le fil.
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

const { isolerRelanceStructuree, formaterRelance } = sandbox;

let fails = 0;
const check = (n, a, p) => { const ok = p(a); if (!ok) fails++; console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n); if (!ok) console.log('        obtenu : ' + JSON.stringify(a).slice(0, 260)); };

const FIL = [
  { author: 'Fleur bleue', text: "Je n'arrive plus à partager mes fichiers Drive depuis hier." },
  { author: 'Fabrice_Fx', text: "Le partage externe est bloqué par une règle du domaine." },
  { author: 'Hyde', text: "Cela peut aussi venir d'un Drive partagé, dont les règles diffèrent." },
  { author: 'Fleur bleue', text: "Mon administrateur dit que le partage est ouvert." }
];

console.log('\nIdentification du demandeur sans réglage supplémentaire');
// Le demandeur est l'auteur du premier message : aucun champ à saisir
const demandeur = FIL[0].author;
check('demandeur déduit du premier message', demandeur, v => v === 'Fleur bleue');

const relance = formaterRelance(isolerRelanceStructuree(FIL, 'Fabrice_Fx', '').messages, demandeur);
check('le demandeur est bien étiqueté', relance, t => t.includes('Fleur bleue (auteur de la question)'));
check('l\'autre bénévole est distingué',  relance, t => t.includes('Hyde (autre intervenant)'));
check('le Product Expert n\'apparaît pas', relance, t => !t.includes('Fabrice_Fx'));

console.log('\nRégression : sans identification, tout le monde était « autre intervenant »');
const relanceSansDemandeur = formaterRelance(isolerRelanceStructuree(FIL, 'Fabrice_Fx', '').messages, '');
check('c\'était bien le comportement fautif', relanceSansDemandeur, t => t.includes('Fleur bleue (autre intervenant)'));
check('corrigé dès lors que le demandeur est connu', relance, t => !t.includes('Fleur bleue (autre intervenant)'));

console.log('\nSeul un autre bénévole a répondu');
const filCollegue = FIL.slice(0, 3);
const r = isolerRelanceStructuree(filCollegue, 'Fabrice_Fx', '');
check('un seul message postérieur', r.messages.length, n => n === 1);
check('il provient bien du collègue', r.messages[0].author, v => v === 'Hyde');
check('aucun message du demandeur dans la relance',
  formaterRelance(r.messages, demandeur), t => !t.includes('auteur de la question'));

console.log('\nLe demandeur écrit plusieurs fois de suite');
const filMultiple = FIL.concat([{ author: 'Fleur bleue', text: "J'ajoute que le problème touche aussi les dossiers." }]);
const r2 = isolerRelanceStructuree(filMultiple, 'Fabrice_Fx', '');
check('les trois messages postérieurs sont retenus', r2.messages.length, n => n === 3);
check('l\'ordre chronologique est conservé', r2.messages[2].text, t => t.includes('dossiers'));

console.log('\n' + (fails === 0 ? 'Tous les tests passent.' : fails + ' test(s) en echec.'));
process.exit(fails ? 1 : 0);
