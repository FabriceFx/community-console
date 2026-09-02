/**
 * Rapprochement d'un fil avec sa ligne de suivi.
 *
 * Une même question se présente sous plusieurs URL : `?hl=fr` posé par le sélecteur
 * de langue, `?msgid=...` sur un lien de notification, une ancre `#reply`, un libellé
 * de titre remanié après édition. Comparées telles quelles, ces formes désignaient
 * des fils distincts, avec trois conséquences invisibles :
 *   - la feuille se remplissait de doublons pour une même question ;
 *   - la relance répondait « ce thread n'est pas encore suivi » ;
 *   - la réponse retouchée n'était jamais enregistrée, et la boucle d'apprentissage
 *     du style restait vide sans que rien ne le signale.
 */
const fs = require('fs'), vm = require('vm');

const sandbox = {
  console: { log(){}, warn(){}, error(){} },
  CONFIG: { COL: { URL: 3 } },
  UrlFetchApp: { fetch: () => ({ getResponseCode: () => 200, getHeaders: () => ({}), getContentText: () => '' }) },
  PropertiesService: (() => { const s={}; const o={getProperty:k=>s[k]||null,setProperty:(k,v)=>{s[k]=v;},deleteProperty(k){delete s[k];}}; return {getScriptProperties:()=>o,getUserProperties:()=>o}; })(),
  Utilities: { sleep(){}, getUuid: () => 'x' },
  SpreadsheetApp: { newRichTextValue: () => ({ setText(){return this;}, build(){return {};} }) },
  ContentService: { createTextOutput: (t) => ({ setMimeType(){ return this; }, getContent: () => t }), MimeType: { JSON: 'json' } },
  LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock(){} }) },
  JSON, Math, Date, String, Object, Array, Number, RegExp, Error
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync('gas/Api.gs', 'utf8'), sandbox);

let fails = 0;
const check = (n, a, p) => { const ok = p(a); if (!ok) fails++; console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n); if (!ok) console.log('        obtenu : ' + JSON.stringify(a)); };

const BASE = 'https://support.google.com/websearch/thread/348371234/probleme-de-fiche';
const n = sandbox.normaliserUrlFil_;

console.log('\nFormes équivalentes d\'une même URL de fil');
check('réduite au numéro de fil',   n(BASE), v => v === 'https://support.google.com/websearch/thread/348371234');
check('paramètre de langue ignoré', n(BASE + '?hl=fr'), v => v === n(BASE));
check('lien de notification ignoré', n(BASE + '?msgid=348379999&hl=en'), v => v === n(BASE));
check('ancre ignorée',              n(BASE + '#reply'), v => v === n(BASE));
check('barre oblique finale ignorée', n(BASE + '/'), v => v === n(BASE));
check('titre remanié sans effet',   n('https://support.google.com/websearch/thread/348371234/intitule-modifie'), v => v === n(BASE));
check('espaces autour ignorés',     n('  ' + BASE + '  '), v => v === n(BASE));

console.log('\nDeux fils distincts ne doivent jamais se confondre');
check('numéro de fil différent', n('https://support.google.com/websearch/thread/999999/x'), v => v !== n(BASE));
check('URL vide neutralisée',    n(''), v => v === '');
check('valeur nulle neutralisée', n(null), v => v === '');

console.log('\nRapprochement dans la feuille de suivi');
// Ligne 1 = en-têtes ; le fil a été enregistré depuis un lien de notification
const lignes = [[BASE + '?msgid=348379999']];
const feuille = {
  getLastRow: () => 1 + lignes.length,
  getRange: (row, col, numRows) => ({
    getValues: () => lignes.slice(row - 2, row - 2 + numRows)
  })
};

check('retrouvé depuis l\'URL nue',        sandbox.trouverLigneParUrl_(feuille, BASE), r => r === 2);
check('retrouvé depuis ?hl=fr',            sandbox.trouverLigneParUrl_(feuille, BASE + '?hl=fr'), r => r === 2);
check('retrouvé depuis une ancre',         sandbox.trouverLigneParUrl_(feuille, BASE + '#reply'), r => r === 2);
check('retrouvé depuis un titre remanié',  sandbox.trouverLigneParUrl_(feuille, 'https://support.google.com/websearch/thread/348371234/autre-titre'), r => r === 2);
check('un autre fil reste introuvable',    sandbox.trouverLigneParUrl_(feuille, 'https://support.google.com/websearch/thread/111/x'), r => r === -1);
check('URL vide reste introuvable',        sandbox.trouverLigneParUrl_(feuille, ''), r => r === -1);

console.log('\n' + (fails === 0 ? 'Tous les tests passent.' : fails + ' test(s) en échec.'));
process.exit(fails ? 1 : 0);
