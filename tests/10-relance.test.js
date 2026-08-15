/**
 * Traitement des relances : la personne a répondu après le message du Product Expert.
 *
 * Piège principal : un modèle à qui l'on donne le fil complet reformule ce qui a
 * déjà été dit — exactement ce qui exaspère quelqu'un venant d'expliquer que cela
 * n'a pas fonctionné. Un garde-fou mesure ce recouvrement.
 */
const fs = require('fs'), vm = require('vm');

function makeSandbox(closings) {
  const store = {};
  if (closings) Object.keys(closings).forEach(k => { store['PE_CLOSINGS_' + k] = closings[k]; });
  const props = { getProperty: k => (k in store ? store[k] : null), setProperty: (k,v) => { store[k]=v; }, deleteProperty: k => { delete store[k]; } };
  const sb = {
    console: { warn(){}, error(){}, log(){} },
    UrlFetchApp: { fetch: () => ({ getResponseCode: () => 200, getHeaders: () => ({}), getContentText: () => '' }) },
    PropertiesService: { getScriptProperties: () => props, getUserProperties: () => props },
    CacheService: { getScriptCache: () => ({ get: () => null, put(){}, remove(){} }) },
    Utilities: { sleep(){}, getUuid: () => 'x' },
    SpreadsheetApp: { newRichTextValue: () => ({ setText(){return this;}, build(){return {};} }), getActiveSpreadsheet: () => ({ getSheetByName: () => null }) },
  };
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync('gas/Config.gs','utf8'), sb);
  vm.runInContext(fs.readFileSync('gas/Gemini.gs','utf8'), sb);
  return sb;
}

const sb = makeSandbox(null);
let fails = 0;
const check = (n, a, p) => { const ok = p(a); if (!ok) fails++; console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n); if (!ok) console.log('        obtenu : ' + JSON.stringify(a).slice(0, 220)); };

console.log('\nClassification de la relance');
const env = sb.parseFollowUpEnvelope_("LANG: fr\nSUITE: ECHEC\nCONFIANCE: MOYENNE\n---\nQuel message exact obtenez-vous à l'écran ?");
check('langue', env.lang, v => v === 'fr');
check('classification', env.suite, v => v === 'ECHEC');
check('corps isolé', env.body, v => v === "Quel message exact obtenez-vous à l'écran ?");
check('valeur par défaut si en-tête absent', sb.parseFollowUpEnvelope_("Texte brut.").suite, v => v === 'NOUVEAU');
['RESOLU','ECHEC','INCOMPRIS','NOUVEAU','HORS_SUJET'].forEach(c =>
  check(c + ' reconnu', sb.parseFollowUpEnvelope_("SUITE: " + c + "\n---\nCorps.").suite, v => v === c));

console.log('\nMise en forme : pas de bienvenue sur un troisième message');
const msg = sb.buildFollowUpResponse('fr', "Le message d'erreur que vous décrivez oriente vers autre chose.", 'ECHEC');
check('aucune formule de bienvenue', msg, t => !/bienvenue/i.test(t));
check('aucune salutation d\'ouverture', msg, t => !/^bonjour/i.test(t.trim()));
check('signature présente', msg, t => t.trim().endsWith('Fabrice'));
check('formule de clôture conservée', msg, t => t.includes("n'hésitez pas à revenir vers nous") || t.includes("J'espère que cette réponse"));

console.log('\nCas RESOLU : le plus court est le meilleur');
const resolu = sb.buildFollowUpResponse('fr', "Parfait, merci de la confirmation.", 'RESOLU');
check('aucune formule de clôture invitant à revenir', resolu, t => !t.includes("n'hésitez pas à revenir vers nous"));
check('corps et signature uniquement', resolu, t => t === "Parfait, merci de la confirmation.\n\nFabrice");

console.log('\nGarde-fou anti-redite');
const PRECEDENTE = "Le partage externe est bloqué par une règle du domaine. Demandez à votre administrateur Workspace d'autoriser le partage hors du domaine dans la console d'administration, section Drive et Docs.";
const SEUIL = vm.runInContext('CONFIG', sb).MAX_FOLLOWUP_OVERLAP;
const recouvrement = (a, b) => 1 - sb.tauxDeModification_(a, b);
const redite = (a, b) => recouvrement(a, b) >= SEUIL;

check('reformulation quasi identique signalée', redite(PRECEDENTE, PRECEDENTE), v => v === true);
check('reformulation légère signalée',
  redite(PRECEDENTE, "Le partage externe est bloqué par une règle du domaine. Demandez à votre administrateur d'autoriser le partage hors domaine dans la console."),
  v => v === true);
check('vraie relance non signalée',
  redite(PRECEDENTE, "Quel message exact s'affiche quand vous tentez le partage ? Selon qu'il mentionne une restriction ou une erreur réseau, la cause diffère."),
  v => v === false);
check('changement de piste non signalé',
  redite(PRECEDENTE, "Puisque votre administrateur confirme que le partage est ouvert, la piste est ailleurs : vérifiez si le fichier appartient à un Drive partagé, dont les règles sont distinctes."),
  v => v === false);
check('absence de réponse précédente : aucun recouvrement', recouvrement('', "Nouvelle réponse."), v => v === 0);

console.log('\nInstructions système dédiées');
const p = sb.buildFollowUpInstruction_();
check('interdiction de redire en règle n°1', p, t => t.includes('NE JAMAIS REDIRE'));
check('accusé de réception exigé',           p, t => t.includes('ACCUSER RÉCEPTION'));
check('les cinq classes documentées',        p, t => ['RESOLU','ECHEC','INCOMPRIS','NOUVEAU','HORS_SUJET'].every(c => t.includes(c)));
check('interdiction de reproposer la même manipulation', p, t => t.includes('Ne repropose JAMAIS la même manipulation'));
check('pas de salutation demandée',          p, t => t.includes('ne recommence pas par une formule de bienvenue'));
check('impasse assumée autorisée',           p, t => t.includes("il n'existe pas d'autre solution"));

console.log('\n' + (fails === 0 ? 'Tous les tests passent.' : fails + ' test(s) en echec.'));
process.exit(fails ? 1 : 0);
