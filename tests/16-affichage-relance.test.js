/**
 * Conditions d'affichage du bouton « Répondre à la relance ».
 *
 * Il ne s'affichait que sur le critère « au moins une carte détectée ». Or la carte de
 * question en est une : le bouton apparaissait donc sur un fil sans aucune réponse,
 * et sur un fil où le Product Expert venait de répondre sans que personne n'ait réagi.
 */
const fs = require('fs'), vm = require('vm');

const noop = () => {};
const sandbox = {
  console: { log: noop, warn: noop, error: noop },
  document: { addEventListener: noop, getElementById: () => null, querySelector: () => null,
    querySelectorAll: () => [], createElement: () => ({ style: {}, addEventListener: noop }),
    body: { appendChild: noop, innerText: '' }, evaluate: () => ({ singleNodeValue: null }), title: '' },
  window: { location: { pathname: '/x', href: 'https://x' }, getComputedStyle: () => ({}) },
  chrome: { storage: { local: { get: noop }, sync: { get: noop } }, runtime: { sendMessage: noop, getManifest: () => ({ version: 'test' }) } },
  MutationObserver: class { observe() {} },
  setTimeout: noop, clearTimeout: noop,
  navigator: { clipboard: { writeText: noop } },
  Date: Date, XPathResult: { FIRST_ORDERED_NODE_TYPE: 9 }
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync('extension/content.js', 'utf8'), sandbox);

const doitAfficher = sandbox.doitAfficherRelance;
const PE = 'Fabrice_Fx';
const m = (auteur, texte, op) => ({ author: auteur, text: texte, isOriginalPoster: !!op });

const QUESTION = m('User 1609', "i can't open my gmail because i forgot my password", true);
const REPONSE_PE = m(PE, "Without your password and without access to your recovery options, this is not possible.");
const RELANCE = m('User 1609', "How is that possible ? i lost the phone and i can't remember the password", true);
const AUTRE_PE = m('Hyde', "It's not just about the syntax, there is no data source here.");

let fails = 0;
const check = (n, a, p) => { const ok = p(a); if (!ok) fails++; console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n); if (!ok) console.log('        obtenu : ' + JSON.stringify(a)); };

console.log('\nSituations sans relance — le bouton doit rester masqué');
check('question seule, aucune réponse',        doitAfficher([QUESTION], PE), v => v === false);
check('fil vide',                              doitAfficher([], PE), v => v === false);
check('liste absente',                         doitAfficher(null, PE), v => v === false);
check('le PE vient de répondre, rien depuis',  doitAfficher([QUESTION, REPONSE_PE], PE), v => v === false);
check('dernier message du fil signé du PE',    doitAfficher([QUESTION, REPONSE_PE, RELANCE, m(PE, 'Nouvelle réponse à la relance.')], PE), v => v === false);

// Depuis la 1.12.0, un fil auquel un autre bénévole a répondu sans que le Product
// Expert soit intervenu autorise une première intervention — sous réserve de ne rien
// répéter, ce que le cadrage dédié impose. Ces deux cas renvoyaient false jusque-là.
console.log('\nFil répondu par un autre bénévole — première intervention permise');
check('un autre PE a répondu, pas vous',       doitAfficher([QUESTION, AUTRE_PE], PE), v => v === true);
check('deux réponses, aucune de vous',         doitAfficher([QUESTION, AUTRE_PE, m('Tiers', 'Autre avis sur la question.')], PE), v => v === true);

console.log('\nSituations avec relance — le bouton doit s\'afficher');
check('le demandeur a répondu',                doitAfficher([QUESTION, REPONSE_PE, RELANCE], PE), v => v === true);
check('un autre bénévole est intervenu après', doitAfficher([QUESTION, REPONSE_PE, AUTRE_PE], PE), v => v === true);
check('plusieurs messages depuis',             doitAfficher([QUESTION, REPONSE_PE, AUTRE_PE, RELANCE], PE), v => v === true);
check('échange déjà long',                     doitAfficher([QUESTION, REPONSE_PE, RELANCE, m(PE, 'Seconde réponse.'), m('User 1609', 'Toujours bloqué malgré tout.')], PE), v => v === true);

console.log('\nNom d\'affichage non renseigné');
check('bouton proposé dès qu\'un échange existe', doitAfficher([QUESTION, REPONSE_PE], ''), v => v === true);
check('mais pas sur une question seule',          doitAfficher([QUESTION], ''), v => v === false);

console.log('\nTolérance sur l\'écriture du nom');
['fabrice_fx', 'FABRICE_FX', ' Fabrice_Fx '].forEach((nom) =>
  check('« ' + nom + ' » reconnu', doitAfficher([QUESTION, REPONSE_PE, RELANCE], nom), v => v === true));

if (fails) { console.log('\n' + fails + ' test(s) en echec.'); process.exit(1); }

// ---------------------------------------------------------------------------
// Le diagnostic doit expliciter la décision, pour qu'un bouton absent ou présent
// à tort se diagnostique par lecture de la console et non par tâtonnement.
// ---------------------------------------------------------------------------
const source = fs.readFileSync('extension/content.js', 'utf8');

let fails2 = 0;
const check2 = (n, a, p) => { const ok = p(a); if (!ok) fails2++; console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n); };

console.log('\nLe diagnostic explicite la décision d\'affichage');
check2('le nom configuré est affiché',        source, t => t.includes('Nom configuré : «'));
check2('le nombre de vos messages est donné', source, t => t.includes("message(s) à vous"));
check2('l\'état du bouton est indiqué',       source, t => t.includes("bouton de relance "));
check2('la raison « pas encore intervenu »',  source, t => t.includes("vous n'êtes pas encore intervenu sur ce fil"));
check2('la raison « dernier message »',       source, t => t.includes('votre message est le dernier du fil'));
check2('la raison « messages depuis »',       source, t => t.includes('posté(s) depuis votre réponse'));
check2('nom manquant explicitement signalé',  source, t => t.includes("Nom d'affichage non renseigné"));

if (fails2) { console.log('\n' + fails2 + ' test(s) en echec.'); process.exit(1); }
console.log('\nTous les tests passent.');
