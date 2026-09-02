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
  'extraireFilStructure',
  'trouverDemandeur',
  'isolerRelanceStructuree',
  'formaterRelance',
  'extraireInfosThread',
  'filVerrouille',
  'nettoyerCorpsMessage',
  'lireTexteEditeur'
].forEach((nom) => {
  check(nom + ' déclarée', declare(nom), v => v === true);
  check(nom + ' appelée au moins une fois', appels(nom), n => n >= 1);
});

console.log('\nL\'outil ne conserve plus aucune question ni réponse');
// L'enregistrement de la réponse publiée a été retiré avec le suivi Google Sheets :
// le Product Expert ne retouchait jamais les propositions, le corpus de style était
// donc toujours vide. Ce contrôle empêche qu'un fragment revienne sans le reste.
['afficherBoutonCapture', 'captureDejaReussie', 'pe-capture-btn', 'enregistrerReponsePubliee',
 'estBoutonPublier', 'choisirTexteACapturer', 'dernierTexteCapture', 'recordPublished',
 'registerOnly'].forEach((trace) => {
  check('aucune trace de « ' + trace + ' »', source.includes(trace), v => v === false);
});
check('aucun style orphelin dans styles.css', fs.readFileSync('extension/styles.css', 'utf8').includes('pe-capture-btn'), v => v === false);

// La mémoire de l'éditeur subsiste : elle ne quitte pas la page et sert uniquement
// à situer votre message dans le fil lors d'une relance.
check('la mémoire de l\'éditeur reste alimentée', source, t => t.includes('contenuEditeurMemorise = texte'));
check('elle sert de repère à la relance',        source, t => /isolerRelanceStructuree\([\s\S]{0,120}contenuEditeurMemorise/.test(t));

// Le contexte du fil doit accompagner la relance, le backend ne le relit plus
check('la question d\'origine est transmise',   source, t => /question: messages\[0\]/.test(t));
check('la réponse précédente est transmise',    source, t => t.includes('previousAnswerFromThread:'));

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
check('l\'analyse se clôt sur épuisement du quota',     source, t => /tentativesDiagnostic < MAX_TENTATIVES_DIAGNOSTIC[\s\S]{0,200}?analyseTerminee = true;/.test(t));
// La garde de tête `if (diagnosticAffiche) return;` doit être rouverte tant que le
// quota d'essais n'est pas épuisé, faute de quoi un seul essai a réellement lieu.
check('un essai infructueux réarme le diagnostic',       source, t => /if \(tentativesDiagnostic < MAX_TENTATIVES_DIAGNOSTIC\) \{[\s\S]{0,300}?diagnosticAffiche = false;[\s\S]{0,40}?return;/.test(t));

console.log('\nLa version est journalisée au chargement');
check('numéro de version affiché', source, t => t.includes('getManifest().version'));

console.log('\n' + (fails === 0 ? 'Tous les tests passent.' : fails + ' test(s) en echec.'));
process.exit(fails ? 1 : 0);
