/**
 * Détection du bouton de publication du forum (extension/content.js).
 *
 * C'est le maillon le plus fragile de la boucle de retour : il dépend de libellés
 * définis par Google, qui peuvent changer. Un faux positif enregistre comme publié
 * un texte qui ne l'est pas et pollue le corpus de style.
 */
const fs = require('fs'), vm = require('vm');

const noop = () => {};
const sandbox = {
  console: { log: noop, warn: noop, error: noop },
  document: {
    addEventListener: noop,
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => ({ style: {}, addEventListener: noop }),
    body: { appendChild: noop },
    evaluate: () => ({ singleNodeValue: null }),
    title: ''
  },
  window: { location: { pathname: '/x', href: 'https://x' }, getComputedStyle: () => ({}) },
  chrome: { storage: { local: { get: noop }, sync: { get: noop } }, runtime: { sendMessage: noop } },
  MutationObserver: class { observe() {} },
  setTimeout: noop,
  clearTimeout: noop,
  navigator: { clipboard: { writeText: noop } },
  Date: Date,
  XPathResult: { FIRST_ORDERED_NODE_TYPE: 9 }
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync('extension/content.js', 'utf8'), sandbox);

const estBoutonPublier = sandbox.estBoutonPublier;
const el = (texte, aria) => ({ innerText: texte, textContent: texte, getAttribute: () => aria || null });

let fails = 0;
const check = (n, a, p) => { const ok = p(a); if (!ok) fails++; console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n); };

console.log('\nBoutons qui publient — doivent être détectés');
[
  ['Publier', undefined],
  ['publier', undefined],
  ['  Publier  ', undefined],
  ['Publier la réponse', undefined],
  ['', 'Publier'],
  ['Envoyer', undefined],
  ['Post', undefined],
  ['Submit', undefined]
].forEach(([t, a]) => check('« ' + (t.trim() || a) + ' »', estBoutonPublier(el(t, a)), v => v === true));

console.log('\nBoutons qui ne publient PAS — ne doivent jamais déclencher');
[
  ['Répondre', undefined],          // ouvre l'éditeur, cliqué par l'extension elle-même
  ['Reply', undefined],
  ['Répondre à ce message', undefined],
  ['Annuler', undefined],
  ['Cancel', undefined],
  ['Enregistrer le brouillon', undefined],
  ['Aperçu', undefined],
  ['Modifier', undefined],
  ['Signaler ce post', undefined],  // contient « post » sans commencer par lui
  ['', undefined],
  ['Publier'.repeat(12), undefined] // libellé aberrant, trop long
].forEach(([t, a]) => check('« ' + (t.trim().slice(0, 28) || '(vide)') + ' »', estBoutonPublier(el(t, a)), v => v === false));

if (fails) { console.log('\n' + fails + ' test(s) en echec.'); process.exit(1); }

// ---------------------------------------------------------------------------
// Choix du texte à capturer : éditeur vivant vs contenu mémorisé.
// Après publication, le forum retire l'éditeur du DOM ; sans mémoire, la capture
// manuelle échouait avec « Éditeur de réponse introuvable sur cette page ».
// ---------------------------------------------------------------------------
const choisir = sandbox.choisirTexteACapturer;
const LONG = 'Le partage est bloqué par une règle du domaine, demandez à votre administrateur.';
const COURT = 'ok merci';

let fails2 = 0;
const check2 = (n, a, p) => { const ok = p(a); if (!ok) fails2++; console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n); };

console.log('\nChoix du texte à capturer');
check2('éditeur présent : son contenu prime',        choisir(LONG, 'autre chose mémorisée depuis longtemps'), v => v === LONG);
check2('éditeur disparu : repli sur la mémoire',      choisir('', LONG), v => v === LONG);
check2('éditeur vidé après publication : mémoire',    choisir('', LONG), v => v === LONG);
check2('éditeur trop court : la mémoire prend le pas', choisir(COURT, LONG), v => v === LONG);
check2('rien d\'exploitable : chaîne vide',            choisir('', COURT), v => v === '');
check2('les deux vides : chaîne vide',                 choisir('', ''), v => v === '');
check2('tolère null et undefined',                     choisir(null, undefined), v => v === '');

if (fails2) { console.log('\n' + fails2 + ' test(s) en echec.'); process.exit(1); }
console.log('\nTous les tests passent.');
