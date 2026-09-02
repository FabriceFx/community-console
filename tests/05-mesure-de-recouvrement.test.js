/**
 * Mesure du recouvrement entre deux textes.
 *
 * `tauxDeModification_` alimente le garde-fou anti-redite des relances : si la
 * proposition recouvre plus de `MAX_FOLLOWUP_OVERLAP` de la réponse déjà publiée,
 * c'est qu'elle la reformule — précisément ce que la personne vient de signaler
 * comme inopérant. La confiance est alors rabaissée et l'extension avertit.
 *
 * (Cette mesure servait aussi à décider si une réponse publiée avait été retouchée,
 * du temps où l'outil conservait un corpus de style. Il n'en conserve plus.)
 */
const fs = require('fs'), vm = require('vm');

const sandbox = {
  console: { warn(){}, error(){}, log(){} },
  UrlFetchApp: { fetch: () => ({ getResponseCode: () => 200, getHeaders: () => ({}), getContentText: () => '' }) },
  PropertiesService: (() => { const s={}; const o={getProperty:k=>s[k]||null,setProperty:(k,v)=>{s[k]=v;},deleteProperty(k){delete s[k];}}; return {getScriptProperties:()=>o,getUserProperties:()=>o}; })(),
  Utilities: { sleep(){}, getUuid: () => 'x' },
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync('gas/Config.gs','utf8'), sandbox);
vm.runInContext(fs.readFileSync('gas/Gemini.gs','utf8'), sandbox);

const taux = sandbox.tauxDeModification_;
const SEUIL = vm.runInContext('CONFIG', sandbox).MAX_FOLLOWUP_OVERLAP;
const redite = (precedente, proposition) => (1 - taux(precedente, proposition)) >= SEUIL;

const PRECEDENTE = "Le partage externe est bloqué par une règle du domaine. Demandez à votre administrateur Workspace d'autoriser le partage hors du domaine dans la console d'administration, section Drive et Docs.";

let fails = 0;
const check = (n, a, p) => { const ok = p(a); if (!ok) fails++; console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n); if (!ok) console.log('        obtenu : ' + JSON.stringify(a)); };

console.log('\nRedites — doivent être signalées');
check('proposition strictement identique',   redite(PRECEDENTE, PRECEDENTE), v => v === true);
check('espaces et retours à la ligne seuls', redite(PRECEDENTE, '  ' + PRECEDENTE.replace(/ /g, '  ') + '\n'), v => v === true);
check('différence de casse uniquement',      redite(PRECEDENTE, PRECEDENTE.toUpperCase()), v => v === true);
check('un seul mot changé sur trente',       redite(PRECEDENTE, PRECEDENTE.replace('Demandez', 'Demande')), v => v === true);

console.log('\nApports réels — ne doivent PAS être signalés');
check('piste entièrement différente', redite(PRECEDENTE, "Puisque la règle de domaine n'est pas en cause, regardez du côté du type d'emplacement : un Drive partagé n'obéit pas aux mêmes autorisations qu'un dossier personnel."), v => v === false);
check('demande de précision',         redite(PRECEDENTE, "Quel message exact obtenez-vous au moment du partage, et s'agit-il d'un Drive partagé ou de votre espace personnel ?"), v => v === false);
check('simple accusé de réception',   redite(PRECEDENTE, "Parfait, merci de la confirmation."), v => v === false);

console.log('\nCas limites');
check('aucune référence : recouvrement nul', taux('', PRECEDENTE), v => v === 1);
check('proposition vide : recouvrement nul', taux(PRECEDENTE, ''), v => v === 1);
check('null et undefined tolérés',           taux(null, undefined), v => v === 1);
check('taux borné entre 0 et 1', [taux(PRECEDENTE, PRECEDENTE), taux(PRECEDENTE, 'xyz abc def')], v => v[0] === 0 && v[1] > 0 && v[1] <= 1);

console.log('\n' + (fails === 0 ? 'Tous les tests passent.' : fails + ' test(s) en echec.'));
process.exit(fails ? 1 : 0);
