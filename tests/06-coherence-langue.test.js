/**
 * Cohérence linguistique de la ligne de récupération de compte.
 *
 * Les consignes du prompt sont rédigées en français : le modèle a tendance à recopier
 * l'intitulé « Procédure officielle de récupération » tel quel au milieu d'une réponse
 * anglaise. Ce filet le réaligne sur la langue du message.
 */
const fs = require('fs'), vm = require('vm');

const sandbox = {
  console: { warn(){}, error(){}, log(){} },
  UrlFetchApp: { fetch: () => ({ getResponseCode: () => 200, getHeaders: () => ({}), getContentText: () => '' }) },
  PropertiesService: (() => { const s={}; const o={getProperty:k=>s[k]||null,setProperty:(k,v)=>{s[k]=v;}}; return {getScriptProperties:()=>o,getUserProperties:()=>o}; })(),
  CacheService: { getScriptCache: () => ({ get: () => null, put(){}, remove(){} }) },
  Utilities: { sleep(){}, getUuid: () => 'x' },
  SpreadsheetApp: { newRichTextValue: () => ({ setText(){return this;}, build(){return {};} }), getActiveSpreadsheet: () => ({ getSheetByName: () => null }) },
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync('gas/Config.gs','utf8'), sandbox);
vm.runInContext(fs.readFileSync('gas/Gemini.gs','utf8'), sandbox);

const localiser = sandbox.localiserLigneRecuperation_;

let fails = 0;
const check = (n, a, p) => { const ok = p(a); if (!ok) fails++; console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n); if (!ok) console.log('        obtenu : ' + JSON.stringify(a)); };

// Cas réellement rencontré : réponse anglaise, intitulé resté en français
const CAS_REEL = `Without your password and without access to your recovery email or phone number, I believe recovering your account is impossible.

The official procedure remains the only existing option, but it has very little chance of succeeding in this situation:
Procédure officielle de récupération : https://g.co/recover`;

console.log('\nCas rencontré en production — réponse anglaise, intitulé français');
const corrige = localiser(CAS_REEL, 'en');
check('intitulé français supprimé',          corrige, t => !t.includes('Procédure officielle de récupération'));
check('intitulé anglais posé',               corrige, t => t.includes('Official account recovery process : https://g.co/recover'));
check('le corps anglais est intact',         corrige, t => t.includes('recovering your account is impossible'));
check('la phrase d\'introduction est gardée', corrige, t => t.includes('very little chance of succeeding'));

console.log('\nToutes les langues gérées');
[['fr','Procédure officielle de récupération'],['en','Official account recovery process'],
 ['de','Offizielles Verfahren zur Kontowiederherstellung'],['es','Procedimiento oficial de recuperación'],
 ['it','Procedura ufficiale di recupero']].forEach(([code, attendu]) => {
  check(code + ' → « ' + attendu + ' »',
    localiser('Texte.\n\nProcédure officielle de récupération : https://g.co/recover', code),
    t => t.includes(attendu + ' : https://g.co/recover'));
});

console.log('\nIdempotence et cas limites');
const dejaBon = 'Body.\n\nOfficial account recovery process : https://g.co/recover';
check('une ligne déjà correcte reste identique', localiser(dejaBon, 'en'), t => t === dejaBon);
check('appliquer deux fois ne change rien',      localiser(localiser(dejaBon, 'en'), 'en'), t => t === dejaBon);
check('langue non gérée : aucun changement',     localiser(CAS_REEL, 'pt'), t => t === CAS_REEL);
check('texte sans le lien : aucun changement',   localiser('Aucun lien ici.', 'en'), t => t === 'Aucun lien ici.');

console.log('\nLe lien inséré dans une phrase ne doit pas être réécrit');
const dansPhrase = 'You can try the official recovery flow at https://g.co/recover and see what happens.';
check('phrase préservée telle quelle', localiser(dansPhrase, 'en'), t => t === dansPhrase);

console.log('\nPonctuation et forme');
check('point final conservé hors du lien',
  localiser('Texte.\n\nProcédure officielle de récupération : https://g.co/recover.', 'en'),
  t => t.includes('Official account recovery process : https://g.co/recover.'));
check('barre oblique finale normalisée',
  localiser('Texte.\n\nProcédure officielle de récupération : https://g.co/recover/', 'en'),
  t => t.includes('https://g.co/recover') && !t.includes('recover//'));

console.log('\n' + (fails === 0 ? 'Tous les tests passent.' : fails + ' test(s) en echec.'));
process.exit(fails ? 1 : 0);
