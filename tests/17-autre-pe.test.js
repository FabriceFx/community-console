/**
 * Fil auquel un autre bénévole a déjà répondu.
 *
 * Deux situations bien distinctes :
 *  - le Product Expert a répondu, puis un collègue est intervenu → relance classique ;
 *  - un collègue a répondu et le Product Expert pas encore → première intervention,
 *    où le seul risque réel est de répéter ce que le collègue vient d'écrire.
 */
const fs = require('fs'), vm = require('vm');

// --- Décision d'affichage (côté extension) ---
const noop = () => {};
const sbExt = {
  console: { log: noop, warn: noop, error: noop },
  document: { addEventListener: noop, getElementById: () => null, querySelector: () => null,
    querySelectorAll: () => [], createElement: () => ({ style: {}, addEventListener: noop }),
    body: { appendChild: noop, innerText: '' }, evaluate: () => ({ singleNodeValue: null }), title: '' },
  window: { location: { pathname: '/x', href: 'https://x' }, getComputedStyle: () => ({}) },
  chrome: { storage: { local: { get: noop }, sync: { get: noop } }, runtime: { sendMessage: noop, getManifest: () => ({ version: 't' }) } },
  MutationObserver: class { observe() {} }, setTimeout: noop, clearTimeout: noop,
  navigator: { clipboard: { writeText: noop } }, Date: Date, XPathResult: { FIRST_ORDERED_NODE_TYPE: 9 }
};
sbExt.window = sbExt; sbExt.globalThis = sbExt;
vm.createContext(sbExt);
vm.runInContext(fs.readFileSync('extension/content.js', 'utf8'), sbExt);

// --- Instructions système (côté backend) ---
const sbGas = {
  console: { warn: noop, error: noop, log: noop },
  UrlFetchApp: { fetch: () => ({ getResponseCode: () => 200, getHeaders: () => ({}), getContentText: () => '' }) },
  PropertiesService: (() => { const st={}; const o={getProperty:k=>st[k]||null,setProperty:(k,v)=>{st[k]=v;},deleteProperty:k=>{delete st[k];}}; return {getScriptProperties:()=>o,getUserProperties:()=>o}; })(),
  CacheService: { getScriptCache: () => ({ get: () => null, put(){}, remove(){} }) },
  Utilities: { sleep(){}, getUuid: () => 'x' },
  SpreadsheetApp: { newRichTextValue: () => ({ setText(){return this;}, build(){return {};} }), getActiveSpreadsheet: () => ({ getSheetByName: () => null }) },
};
vm.createContext(sbGas);
vm.runInContext(fs.readFileSync('gas/Config.gs','utf8'), sbGas);
vm.runInContext(fs.readFileSync('gas/Gemini.gs','utf8'), sbGas);

const PE = 'Fabrice_Fx';
const m = (a, t, op) => ({ author: a, text: t, isOriginalPoster: !!op });
const QUESTION = m('User 1609', "How do I use IMPORTXML to get this data?", true);
const AUTRE_PE = m('Hyde', "It's not just about the syntax: without a data source the question can't be answered.");
const REPONSE_PE = m(PE, "You need to provide the URL you are pulling from.");
const RELANCE = m('User 1609', "Here is the page I am trying to read from.", true);

let fails = 0;
const check = (n, a, p) => { const ok = p(a); if (!ok) fails++; console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n); if (!ok) console.log('        obtenu : ' + JSON.stringify(a).slice(0, 200)); };

console.log('\nAffichage du bouton selon qui a répondu');
check('un autre PE a répondu, pas vous → bouton proposé',
  sbExt.doitAfficherRelance([QUESTION, AUTRE_PE], PE), v => v === true);
check('vous avez répondu, puis un autre PE → bouton proposé',
  sbExt.doitAfficherRelance([QUESTION, REPONSE_PE, AUTRE_PE], PE), v => v === true);
check('question seule → toujours masqué',
  sbExt.doitAfficherRelance([QUESTION], PE), v => v === false);
check('vous avez le dernier mot → masqué',
  sbExt.doitAfficherRelance([QUESTION, AUTRE_PE, REPONSE_PE], PE), v => v === false);

console.log('\nCadrage transmis au modèle');
const premiere = sbGas.buildFollowUpInstruction_(false);
const relanceClassique = sbGas.buildFollowUpInstruction_(true);

check('première intervention : le cadrage le dit',      premiere, t => t.includes("Il n'a PAS encore écrit sur ce fil"));
check('première intervention : justification exigée',   premiere, t => t.includes("RAISON D'INTERVENIR"));
check('première intervention : rien à ajouter permis',  premiere, t => t.includes('RIEN_A_AJOUTER'));
check('première intervention : ne rien ajouter valable', premiere, t => t.includes('Ne rien ajouter est un résultat valable'));
check('première intervention : pas de mise en cause',   premiere, t => t.includes('sans le mettre en cause'));
check('relance classique : cadrage distinct',           relanceClassique, t => t.includes('vient de lui écrire de nouveau'));
check('relance classique : pas de cadrage collègue',    relanceClassique, t => !t.includes("Il n'a PAS encore écrit"));
check('les deux interdisent la redite',                 [premiere, relanceClassique], v => v.every(t => t.includes('NE JAMAIS REDIRE')));

console.log('\nStatut RIEN_A_AJOUTER');
const env = sbGas.parseFollowUpEnvelope_("LANG: en\nSUITE: RIEN_A_AJOUTER\nCONFIANCE: HAUTE\n---\nThe existing answer already covers this correctly.");
check('statut reconnu', env.suite, v => v === 'RIEN_A_AJOUTER');
check('constat conservé', env.body, t => t.includes('already covers this'));

console.log('\nAucun message n\'est fabriqué pour meubler');
const source = fs.readFileSync('extension/content.js', 'utf8');
check('aucune insertion quand rien à ajouter', source, t => t.includes('if (data.nothingToAdd)'));
check('sortie avant toute injection',          source, t => t.indexOf('if (data.nothingToAdd)') < t.indexOf("injecterReponse(texte, 'commentaire'"));
check('libellé du bouton adapté au contexte',  source, t => t.includes("premiereIntervention ? '💬 Compléter le fil'"));

console.log('\n' + (fails === 0 ? 'Tous les tests passent.' : fails + ' test(s) en echec.'));
process.exit(fails ? 1 : 0);
