/**
 * Repêchage de la réponse précédente depuis le fil.
 *
 * Un fil traité hors de l'outil — ou inscrit automatiquement lors d'une relance — ne
 * laisse aucune trace de la réponse du Product Expert dans la feuille. Le garde-fou
 * anti-redite se retrouve alors sans référence, alors que le fil affiche ce texte.
 */
const fs = require('fs'), vm = require('vm');

const noop = () => {};
const sandbox = {
  console: { log: noop, warn: noop, error: noop },
  document: { addEventListener: noop, getElementById: () => null, querySelector: () => null,
    querySelectorAll: () => [], createElement: () => ({ style: {}, addEventListener: noop }),
    body: { appendChild: noop, innerText: '' }, evaluate: () => ({ singleNodeValue: null }), title: '' },
  window: { location: { pathname: '/x', href: 'https://x' }, getComputedStyle: () => ({}) },
  chrome: { storage: { local: { get: noop }, sync: { get: noop } }, runtime: { sendMessage: noop, getManifest: () => ({ version: 't' }) } },
  MutationObserver: class { observe() {} }, setTimeout: noop, clearTimeout: noop,
  navigator: { clipboard: { writeText: noop } }, Date: Date, XPathResult: { FIRST_ORDERED_NODE_TYPE: 9 }
};
sandbox.window = sandbox; sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync('extension/content.js', 'utf8'), sandbox);

const { isolerRelanceStructuree } = sandbox;
const PE = 'Fabrice_Fx';
const m = (a, t, op) => ({ author: a, text: t, isOriginalPoster: !!op });

const REPONSE = "Sans mot de passe ni accès à vos moyens de récupération, la récupération n'est pas possible.";
const FIL = [
  m('User 1609', "i forgot my google account password", true),
  m(PE, REPONSE),
  m('User 1609', "How is that possible ? i lost the phone", true)
];

let fails = 0;
const check = (n, a, p) => { const ok = p(a); if (!ok) fails++; console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n); if (!ok) console.log('        obtenu : ' + JSON.stringify(a).slice(0, 200)); };

console.log('\nLe message de référence est retenu à l\'isolement');
let r = isolerRelanceStructuree(FIL, PE, '');
check('message du Product Expert conservé', r.messagePe && r.messagePe.text, v => v === REPONSE);
check('la relance reste correctement isolée', r.messages.length, n => n === 1);

r = isolerRelanceStructuree(FIL, '', REPONSE);
check('repérage par contenu : message conservé aussi', r.messagePe && r.messagePe.text, v => v === REPONSE);

r = isolerRelanceStructuree(FIL, '', '');
check('repli dégradé : aucune référence', r.messagePe, v => v === null);

console.log('\nTransmission au backend');
const src = fs.readFileSync('extension/content.js', 'utf8');
check('le texte relevé est envoyé',        src, t => t.includes('previousAnswerFromThread: isolation.messagePe'));
check('envoyé sur les deux parcours',      (src.match(/previousAnswerFromThread:/g) || []).length, n => n === 2);
check('longueur plafonnée',                src, t => t.includes('.text.substring(0, MAX_CONTENT)'));

console.log('\nExploitation côté backend');
const api = fs.readFileSync('gas/Api.gs', 'utf8');
check('la feuille reste prioritaire',      api, t => t.includes('const previousAnswer = depuisFeuille || depuisFil;'));
check('le texte du fil est conservé',      api, t => t.includes('sheet.getRange(targetRow, CONFIG.COL.PUBLISHED).setValue(depuisFil)'));
check('uniquement si la feuille est vide', api, t => t.includes('if (!depuisFeuille && depuisFil) {'));
check('le corpus de style est rafraîchi',  api, t => /if \(!depuisFeuille && depuisFil\) \{[\s\S]{0,200}invalidateStyleExamplesCache_\(\)/.test(t));
check('la provenance est remontée',        api, t => t.includes("previousAnswerSource: depuisFeuille ? 'feuille'"));

console.log('\nAvertissement ajusté');
check('alerte réservée à l\'absence totale', src, t => t.includes("n'a pas pu être retrouvée"));
check('mention des deux sources explorées', src, t => t.includes('Ni dans la feuille, ni dans le fil'));
check('repêchage signalé sans alerte',      src, t => t.includes("Réponse précédente relevée dans le fil"));

console.log('\n' + (fails === 0 ? 'Tous les tests passent.' : fails + ' test(s) en echec.'));
process.exit(fails ? 1 : 0);
