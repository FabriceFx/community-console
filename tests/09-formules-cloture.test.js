/**
 * Formules de clôture personnalisables.
 *
 * Ces phrases signent le message : elles doivent être celles du Product Expert,
 * pas des tournures inventées par l'outil. Le panneau de contrôle les rend
 * modifiables, et une clôture vide est un choix légitime.
 */
const fs = require('fs'), vm = require('vm');

function makeSandbox(closings) {
  const store = {};
  if (closings) Object.keys(closings).forEach(k => { store['PE_CLOSINGS_' + k] = closings[k]; });

  const props = {
    getProperty: k => (k in store ? store[k] : null),
    setProperty: (k, v) => { store[k] = v; },
    deleteProperty: k => { delete store[k]; }
  };

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

let fails = 0;
const check = (n, a, p) => { const ok = p(a); if (!ok) fails++; console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n); if (!ok) console.log('        obtenu : ' + JSON.stringify(a)); };

console.log('\nLes tournures inventées par l\'outil ont disparu');
let sb = makeSandbox(null);
const messages = [];
for (let i = 0; i < 40; i++) messages.push(sb.buildFormattedResponse('fr', 'Marie', 'Gmail', 'Corps technique.', 'REPONSE'));
const tout = messages.join('\n');
["Dites-moi si ça avance de votre côté",
 "Si ça ne débloque rien, redonnez-moi le détail",
 "Tenez-moi au courant de ce que ça donne",
 "j'y reviendrai"].forEach(phrase =>
  check('« ' + phrase + ' » absente', tout, t => !t.includes(phrase)));

console.log('\nLes formules d\'origine du Product Expert sont revenues');
check('formule historique présente', tout, t => t.includes("n'hésitez pas à revenir vers nous"));
check('signature toujours en fin de message', messages[0], t => t.trim().endsWith('Fabrice'));

console.log('\nFormules personnalisées depuis le panneau de contrôle');
sb = makeSandbox({ fr: "Bonne journée.\nBon courage." });
const perso = [];
for (let i = 0; i < 30; i++) perso.push(sb.buildFormattedResponse('fr', 'Marie', 'Gmail', 'Corps.', 'REPONSE'));
check('les formules saisies sont utilisées', perso.join('\n'), t => t.includes('Bonne journée.') && t.includes('Bon courage.'));
check('les formules par défaut sont écartées', perso.join('\n'), t => !t.includes("n'hésitez pas à revenir vers nous"));
check('les deux variantes alternent', new Set(perso).size, n => n > 1);

console.log('\nClôture vide : le message s\'arrête sur le fond');
sb = makeSandbox({ fr: "-" });
const sansCloture = sb.buildFormattedResponse('fr', 'Marie', 'Gmail', 'Corps technique.', 'REPONSE');
check('aucune phrase entre le fond et la signature', sansCloture, t => t === "Bonjour Marie,\n\nCorps technique.\n\nFabrice" || t.endsWith("Corps technique.\n\nFabrice"));
check('pas de ligne vide surnuméraire', sansCloture, t => !/\n\n\n/.test(t));

console.log('\nMélange de formules et de clôture vide');
sb = makeSandbox({ fr: "Bonne journée.\n-" });
const melange = [];
for (let i = 0; i < 30; i++) melange.push(sb.buildFormattedResponse('fr', 'Marie', 'Gmail', 'Corps.', 'REPONSE'));
check('la variante avec formule apparaît', melange.join('|'), t => t.includes('Bonne journée.'));
check('la variante sans formule apparaît', melange.some(m => m === "Bonjour Marie,\n\nCorps.\n\nFabrice"), v => v === true);

console.log('\nLangues non personnalisées et clarifications');
sb = makeSandbox({ fr: "Bonne journée." });
check('l\'anglais garde ses valeurs par défaut',
  sb.buildFormattedResponse('en', 'John', 'Gmail', 'Body.', 'REPONSE'),
  t => t.includes('feel free to reply') || t.includes('I hope this answer'));
check('une clarification garde sa formule dédiée',
  sb.buildFormattedResponse('fr', 'Marie', 'Gmail', 'Quelle adresse ?', 'CLARIFICATION'),
  t => !t.includes('Bonne journée.'));

console.log('\n' + (fails === 0 ? 'Tous les tests passent.' : fails + ' test(s) en echec.'));
process.exit(fails ? 1 : 0);
