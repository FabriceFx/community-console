/**
 * Détection des réponses incomplètes.
 *
 * Cas réel : « je pense que récupérer l'accès à votre compte » — phrase coupée net,
 * lien de récupération absent. Trois causes cumulées : seule `parts[0]` était lue,
 * `finishReason` n'était jamais vérifié, et le budget de jetons était trop étroit
 * pour un modèle qui raisonne avant de répondre.
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

const tronque = sandbox.sembleTronque_;
const extraire = sandbox.extraireTexteCandidat_;

let fails = 0;
const check = (n, a, p) => { const ok = p(a); if (!ok) fails++; console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n); if (!ok) console.log('        obtenu : ' + JSON.stringify(a)); };

console.log('\nCas rencontré en production');
check('phrase coupée net détectée',
  tronque("Sans adresse e-mail connue ni numéro de téléphone de récupération, je pense que récupérer l'accès à votre compte"),
  v => v === true);

console.log('\nRéponses complètes — aucun signalement');
check('phrase terminée par un point', tronque("La récupération est impossible sans moyen actif."), v => v === false);
check('terminée par un point d\'interrogation', tronque("Quelle adresse utilisez-vous pour vous connecter ?"), v => v === false);
check('terminée par une URL de source', tronque("Le système exige un moyen actif.\n\nProcédure officielle de récupération : https://g.co/recover"), v => v === false);
check('liste à puces ponctuée', tronque("Vérifiez ceci :\n- premier point ;\n- second point."), v => v === false);
check('terminée par un guillemet fermant', tronque("Il affiche « compte introuvable »."), v => v === false);

console.log('\nAutres formes d\'incomplétude');
check('texte vide', tronque(''), v => v === true);
check('espaces seuls', tronque('   \n  '), v => v === true);
check('null toléré', tronque(null), v => v === true);
check('mot isolé sans ponctuation', tronque("Bonjour Peel Daniel"), v => v === true);

console.log('\nLecture de toutes les parties de la réponse');
check('une seule partie',
  extraire({ content: { parts: [{ text: 'Réponse complète.' }] } }),
  v => v === 'Réponse complète.');
check('plusieurs parties concaténées',
  extraire({ content: { parts: [{ text: 'Début de la ' }, { text: 'réponse complète.' }] } }),
  v => v === 'Début de la réponse complète.');
check('partie de raisonnement exclue',
  extraire({ content: { parts: [{ text: 'Réflexion interne à ne pas publier.', thought: true }, { text: 'Réponse visible.' }] } }),
  v => v === 'Réponse visible.');
check('parties sans texte ignorées',
  extraire({ content: { parts: [{ functionCall: {} }, { text: 'Réponse.' }] } }),
  v => v === 'Réponse.');
check('candidat vide toléré', extraire(null), v => v === '');
check('contenu sans parties toléré', extraire({ content: {} }), v => v === '');

console.log('\nBudget de génération');
const CFG = vm.runInContext('CONFIG', sandbox);
check('budget large pour absorber les jetons de réflexion', CFG.MAX_OUTPUT_TOKENS, n => n >= 4096);

console.log('\n' + (fails === 0 ? 'Tous les tests passent.' : fails + ' test(s) en echec.'));
process.exit(fails ? 1 : 0);
