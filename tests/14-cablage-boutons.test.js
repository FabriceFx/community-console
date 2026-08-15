/**
 * Câblage des fonctions du content script.
 *
 * Une réécriture avait fait disparaître l'appel à `afficherBoutonRelance()` : la
 * fonction existait, était testée, mais n'était plus jamais appelée. Le bouton
 * n'apparaissait donc jamais, sans qu'aucun test ne s'en aperçoive.
 */
const fs = require('fs');
const source = fs.readFileSync('extension/content.js', 'utf8');

let fails = 0;
const check = (n, a, p) => { const ok = p(a); if (!ok) fails++; console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n); if (!ok) console.log('        obtenu : ' + JSON.stringify(a)); };

// Compte les occurrences hors déclaration de fonction
const appels = (nom) => (source.match(new RegExp('(?<!function )\\b' + nom + '\\s*\\(', 'g')) || []).length;
const declare = (nom) => new RegExp('function\\s+' + nom + '\\s*\\(').test(source);

console.log('\nToute fonction déclarée doit être réellement appelée');
[
  'afficherBoutonRelance',
  'creerBoutonPrincipal',
  'doitAfficherRelance',
  'creerBoutonRelance',
  'trouverBoutonCommenter',
  'diagnostiquerUneFois',
  'afficherBoutonCapture',
  'extraireFilStructure',
  'trouverDemandeur',
  'isolerRelanceStructuree',
  'formaterRelance',
  'extraireInfosThread',
  'filVerrouille',
  'nettoyerCorpsMessage',
  'choisirTexteACapturer',
  'lireTexteEditeur',
  'estBoutonPublier',
  'enregistrerReponsePubliee'
].forEach((nom) => {
  check(nom + ' déclarée', declare(nom), v => v === true);
  check(nom + ' appelée au moins une fois', appels(nom), n => n >= 1);
});

console.log('\nPoints d\'entrée attendus dans initTracker');
const initTracker = source.slice(source.indexOf('function initTracker()'));
check('le bouton principal est créé',   initTracker, t => t.includes('creerBoutonPrincipal()'));
check('le bouton de relance est posé',  initTracker, t => t.includes('afficherBoutonRelance()'));
check('le diagnostic est déclenché',    initTracker, t => t.includes('diagnostiquerUneFois()'));

console.log('\nL\'analyse doit survivre à la création du bouton principal');
// Une garde « bouton déjà présent » placée avant l'analyse la rendait inatteignable
// dès le premier passage, alors que la page n'était pas encore construite.
const avantAnalyse = initTracker.slice(0, initTracker.indexOf('afficherBoutonRelance()'));
check('aucune sortie sur présence du bouton principal', avantAnalyse, t => !t.includes("getElementById('pe-tracker-btn')"));
check('la garde de fin d\'analyse est distincte',       initTracker, t => t.includes('if (analyseTerminee) return;'));
check('l\'analyse se clôt sur succès',                  source, t => /analyseTerminee = true;[\s\S]{0,120}const demandeur/.test(t));
check('l\'analyse se clôt sur épuisement du quota',     source, t => /diagnosticAffiche = true;\s*\n\s*analyseTerminee = true;/.test(t));

console.log('\nLa version est journalisée au chargement');
check('numéro de version affiché', source, t => t.includes('getManifest().version'));

console.log('\n' + (fails === 0 ? 'Tous les tests passent.' : fails + ' test(s) en echec.'));
process.exit(fails ? 1 : 0);
