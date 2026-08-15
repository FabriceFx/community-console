/**
 * Détection des réponses publiées sans retouche.
 *
 * Enjeu : réinjecter dans le prompt une proposition publiée telle quelle ferait
 * apprendre au modèle sa propre production. Ses tics d'écriture se renforceraient
 * d'une génération à l'autre. Seule la partie réécrite par le PE porte du signal.
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

const taux = sandbox.tauxDeModification_;
const SEUIL = vm.runInContext('CONFIG', sandbox).MIN_EDIT_RATIO;
const retouchee = (a, b) => taux(a, b) >= SEUIL;

const PROPOSE = "Le partage externe est bloqué par une règle du domaine. Demandez à votre administrateur Workspace d'autoriser le partage hors du domaine dans la console d'administration, section Drive et Docs.";

let fails = 0;
const check = (n, a, p) => { const ok = p(a); if (!ok) fails++; console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n); if (!ok) console.log('        obtenu : ' + JSON.stringify(a)); };

console.log('\nPublications sans retouche — ne doivent PAS alimenter le style');
check('texte strictement identique',        retouchee(PROPOSE, PROPOSE), v => v === false);
check('espaces et retours à la ligne seuls', retouchee(PROPOSE, '  ' + PROPOSE.replace(/ /g, '  ') + '\n'), v => v === false);
check('différence de casse uniquement',      retouchee(PROPOSE, PROPOSE.toUpperCase()), v => v === false);
check('un seul mot changé sur trente',       retouchee(PROPOSE, PROPOSE.replace('Demandez', 'Demande')), v => v === false);

console.log('\nPublications retouchées — doivent alimenter le style');
check('phrase entière réécrite', retouchee(PROPOSE, "C'est votre administrateur Workspace qui bloque ça, via une règle de domaine. Il faut qu'il ouvre le partage externe dans la console."), v => v === true);
check('réponse raccourcie de moitié', retouchee(PROPOSE, "Règle de domaine : seul votre administrateur Workspace peut débloquer le partage externe."), v => v === true);
check('texte entièrement différent', retouchee(PROPOSE, "Bonjour, il faut vérifier les paramètres de votre navigateur et vider le cache avant toute chose."), v => v === true);

console.log('\nCas limites');
check('aucune proposition de référence : considéré réécrit', taux('', PROPOSE), v => v === 1);
check('publication vide : considéré réécrit',                taux(PROPOSE, ''), v => v === 1);
check('null et undefined tolérés',                           taux(null, undefined), v => v === 1);
check('taux borné entre 0 et 1', [taux(PROPOSE, PROPOSE), taux(PROPOSE, 'xyz abc def')], v => v[0] === 0 && v[1] > 0 && v[1] <= 1);

console.log('\n' + (fails === 0 ? 'Tous les tests passent.' : fails + ' test(s) en echec.'));
process.exit(fails ? 1 : 0);
