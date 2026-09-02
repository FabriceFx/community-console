/**
 * Signature configurable.
 *
 * Elle était codée en dur (« Fabrice ») à quatre endroits : les deux assemblages de
 * message, l'assemblage de relance, et la reconnaissance de fin de message dans
 * les deux assemblages de message et l'assemblage de relance. Le projet étant sous
 * licence MIT et destiné aux Product Experts en général, tout autre bénévole qui
 * l'installait signait ses réponses du prénom de l'auteur de l'outil.
 */
const fs = require('fs'), vm = require('vm');

function makeSandbox(proprietes) {
  const store = Object.assign({}, proprietes || {});
  const props = {
    getProperty: k => (k in store ? store[k] : null),
    setProperty: (k, v) => { store[k] = v; },
    deleteProperty: k => { delete store[k]; }
  };
  const sb = {
    console: { warn(){}, error(){}, log(){} },
    UrlFetchApp: { fetch: () => ({ getResponseCode: () => 200, getHeaders: () => ({}), getContentText: () => '' }) },
    PropertiesService: { getScriptProperties: () => props, getUserProperties: () => props },
    Utilities: { sleep(){}, getUuid: () => 'x' }
  };
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync('gas/Config.gs', 'utf8'), sb);
  vm.runInContext(fs.readFileSync('gas/Gemini.gs', 'utf8'), sb);
  return sb;
}

let fails = 0;
const check = (n, a, p) => { const ok = p(a); if (!ok) fails++; console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n); if (!ok) console.log('        obtenu : ' + JSON.stringify(a)); };

// Une clôture unique et non vide rend les assemblages déterministes
const CLOTURE = { PE_CLOSINGS_fr: "Dites-moi si ça avance." };

console.log('\nLa signature configurée est celle qui est apposée');
let sb = makeSandbox(Object.assign({ PE_SIGNATURE: 'Camille' }, CLOTURE));
let msg = sb.buildFormattedResponse('fr', 'Marie', 'Google Drive', 'Le partage externe est bloqué par une règle du domaine.', 'REPONSE');
check('le message se termine par la signature', msg, t => t.trim().endsWith('Camille'));
check('aucune signature en dur ne subsiste',    msg, t => !/Fabrice/.test(t));
check('la signature n\'apparaît qu\'une fois',   (msg.match(/Camille/g) || []).length, n => n === 1);
check('la clôture précède la signature',        msg, t => /Dites-moi si ça avance\.\n\nCamille$/.test(t.trim()));

console.log('\nUne autre signature donne un autre message');
sb = makeSandbox(Object.assign({ PE_SIGNATURE: 'Jean-Luc' }, CLOTURE));
check('signature composée respectée', sb.buildFormattedResponse('fr', 'Marie', 'Gmail', 'Corps technique.', 'REPONSE'), t => t.trim().endsWith('Jean-Luc'));

console.log('\nSignature absente : le message s\'arrête sur la clôture');
sb = makeSandbox(CLOTURE);
msg = sb.buildFormattedResponse('fr', 'Marie', 'Gmail', 'Corps technique.', 'REPONSE');
check('aucune ligne de signature',        msg, t => t.trim().endsWith("Dites-moi si ça avance."));
check('pas de ligne vide en fin',         msg, t => t === t.trimEnd());
check('le corps reste intact',            msg, t => t.includes('Corps technique.'));

console.log('\nRelances');
sb = makeSandbox(Object.assign({ PE_SIGNATURE: 'Camille' }, CLOTURE));
check('relance ordinaire signée',   sb.buildFollowUpResponse('fr', 'Le blocage vient de la règle du domaine.', 'ECHEC'), t => t.trim().endsWith('Camille'));
check('remerciement : corps et signature seuls', sb.buildFollowUpResponse('fr', 'Parfait, merci de la confirmation.', 'RESOLU'),
  t => t === "Parfait, merci de la confirmation.\n\nCamille");

sb = makeSandbox(CLOTURE);
check('relance non signée si aucune signature', sb.buildFollowUpResponse('fr', 'Parfait, merci de la confirmation.', 'RESOLU'),
  t => t === "Parfait, merci de la confirmation.");

console.log('\n' + (fails === 0 ? 'Tous les tests passent.' : fails + ' test(s) en échec.'));
process.exit(fails ? 1 : 0);
