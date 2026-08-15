/**
 * Détection des procédures pas-à-pas dans l'interface, non appuyées sur une source.
 *
 * Cas réel : une réponse décrivait un menu « Densité et couleur » dans Google Agenda,
 * introuvable dans l'interface. Les libellés de menus Google sont renommés, déplacés
 * ou supprimés ; ceux que le modèle produit de mémoire décrivent un état passé.
 * Non sourcé, ce format doit déclencher un avertissement avant publication.
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

const contientChemin = sandbox.contientCheminInterface_;
const extraireUrls = sandbox.extraireUrlsGrounding_;

let fails = 0;
const check = (n, a, p) => { const ok = p(a); if (!ok) fails++; console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n); if (!ok) console.log('        obtenu : ' + JSON.stringify(a)); };

// Cas réellement rencontré en production
const CAS_REEL = `Pour retrouver l'ancienne palette de couleurs sur la version pour ordinateur de Google Agenda :

- Cliquez sur l'icône d'engrenage (Paramètres) en haut à droite.
- Sélectionnez Densité et couleur.
- Dans le menu Jeu de couleurs, choisissez Classique (avec du texte blanc).
- Cliquez sur OK pour enregistrer.`;

console.log('\nCas rencontré en production — menu « Densité et couleur » introuvable');
check('procédure pas-à-pas détectée', contientChemin(CAS_REEL), v => v === true);

console.log('\nAutres formulations de navigation');
[
  ['anglais', 'Click the gear icon, then select Display settings from the menu.'],
  ['allemand', 'Klicken Sie auf das Zahnrad, dann wählen Sie die Anzeigeeinstellungen.'],
  ['espagnol', 'Haga clic en el engranaje y seleccione los ajustes de pantalla.'],
  ['italien', 'Fai clic sull\'ingranaggio, poi seleziona le impostazioni di visualizzazione.']
].forEach(([langue, texte]) => check(langue, contientChemin(texte), v => v === true));

console.log('\nRéponses sans parcours d\'interface — aucun avertissement');
check('description fonctionnelle sans libellés',
  contientChemin("Ce réglage se trouve dans les paramètres d'affichage. Son emplacement a pu changer selon la version, l'article ci-dessous est à jour."),
  v => v === false);
check('réponse de récupération de compte',
  contientChemin("Sans mot de passe ni accès à votre adresse de secours, la récupération est impossible. Le système exige au moins un moyen actif."),
  v => v === false);
check('une seule mention isolée ne suffit pas',
  contientChemin("Vous pouvez cliquer sur le lien ci-dessous pour consulter l'article officiel."),
  v => v === false);
check('texte vide', contientChemin(''), v => v === false);
check('null toléré', contientChemin(null), v => v === false);

console.log('\nCroisement avec les sources du grounding');
const sansSource = { groundingMetadata: { groundingChunks: [] } };
const avecSource = { groundingMetadata: { groundingChunks: [{ web: { uri: 'https://support.google.com/calendar/answer/1234' } }] } };
check('aucune source extraite quand le grounding est vide', extraireUrls(sansSource).length, n => n === 0);
check('source extraite quand le grounding en fournit une', extraireUrls(avecSource).length, n => n === 1);
check('candidat absent toléré', extraireUrls(null).length, n => n === 0);

const declenche = (body, cand) => contientChemin(body) && extraireUrls(cand).length === 0;
check('chemin sans source : avertissement déclenché', declenche(CAS_REEL, sansSource), v => v === true);
check('chemin avec source : pas d\'avertissement',    declenche(CAS_REEL, avecSource), v => v === false);

console.log('\n' + (fails === 0 ? 'Tous les tests passent.' : fails + ' test(s) en echec.'));
process.exit(fails ? 1 : 0);
