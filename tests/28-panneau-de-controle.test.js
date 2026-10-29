/**
 * Aller-retour complet du panneau de contrôle : Sidebar.html ↔ Ui.gs ↔ Config.gs.
 *
 * Le script du panneau est extrait du HTML et exécuté contre le vrai code serveur.
 * Sans cela, un champ ajouté côté serveur mais jamais lu côté client — ou l'inverse —
 * reste invisible : le réglage paraît enregistré, et ne l'est pas.
 *
 * Le panneau n'exposait que le français et l'anglais alors que cinq langues étaient
 * gérées, et la signature n'était configurable nulle part.
 */
const fs = require('fs'), vm = require('vm');

let fails = 0;
const check = (n, a, p) => { const ok = p(a); if (!ok) fails++; console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n); if (!ok) console.log('        obtenu : ' + JSON.stringify(a)); };

/** Contexte serveur : le vrai Config.gs / Gemini.gs / Ui.gs sur des propriétés en mémoire. */
function serveur() {
  const store = {};
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
    Utilities: { sleep(){}, getUuid: () => '0123-4567-89ab' },
    // Le panneau s'ouvre depuis le classeur : utilisateur actif et effectif coïncident.
    Session: { getActiveUser: () => ({ getEmail: () => 'pe@example.com' }), getEffectiveUser: () => ({ getEmail: () => 'pe@example.com' }) },
    SpreadsheetApp: { newRichTextValue: () => ({ setText(){ return this; }, build(){ return {}; } }), getActiveSpreadsheet: () => ({ getSheetByName: () => null }) }
  };
  vm.createContext(sb);
  ['gas/Config.gs', 'gas/Gemini.gs', 'gas/Ui.gs'].forEach(f => vm.runInContext(fs.readFileSync(f, 'utf8'), sb));
  return sb;
}

/** Contexte client : le <script> de Sidebar.html sur un DOM simulé, relié à `srv`. */
function panneau(srv) {
  const registre = {};
  const champ = (id) => (registre[id] = {
    id, value: '', textContent: '', className: '', type: 'text', rows: 0, disabled: false,
    style: {}, innerHTML: '',
    setAttribute() {}, addEventListener() {},
    appendChild(enfant) { if (enfant.id) registre[enfant.id] = enfant; }
  });

  ['apiKey', 'modelName', 'sharedSecret', 'signature', 'signatureStatus', 'secretStatus',
   'closingsFields', 'saveBtn', 'loader', 'btnText', 'status', 'genBtn',
   'toggleKeyBtn', 'toggleSecretBtn'].forEach(champ);

  // google.script.run, chaînable comme le vrai, branché sur le code serveur réel
  const chaine = (onOk, onKo) => ({
    withSuccessHandler(f) { return chaine(f, onKo); },
    withFailureHandler(f) { return chaine(onOk, f); },
    getSettings() { if (onOk) onOk(srv.getSettings()); },
    saveSettings(s) { srv.saveSettings(s); if (onOk) onOk(true); },
    generateSharedSecret() { const r = srv.generateSharedSecret(); if (onOk) onOk(r); }
  });

  const ctx = {
    console: { log() {}, warn() {}, error() {} },
    document: {
      getElementById: (id) => registre[id] || null,
      // Les champs de langue sont créés par le panneau : ils s'enregistrent à l'insertion
      createElement: () => ({ id: '', value: '', textContent: '', className: '', rows: 0, style: {},
                              setAttribute() {}, addEventListener() {}, appendChild() {} })
    },
    google: { script: { run: chaine(null, null) } },
    setTimeout: () => {},
    JSON, Object, Array, String, Number, Math, RegExp, Error
  };

  vm.createContext(ctx);
  const script = /<script>([\s\S]*?)<\/script>/.exec(fs.readFileSync('gas/Sidebar.html', 'utf8'))[1];
  // saveSettings est déclarée dans le script du panneau : on l'expose pour la déclencher
  vm.runInContext(script + '\n;globalThis.__enregistrer = saveSettings;', ctx);

  return { registre, enregistrer: ctx.__enregistrer };
}

console.log('\nOuverture du panneau sur une configuration vierge');
let srv = serveur();
let vue = panneau(srv);

check('un champ de signature existe',         !!vue.registre.signature, v => v === true);
check('signature vide au départ',             vue.registre.signature.value, v => v === '');
check('l\'absence de signature est signalée',  vue.registre.signatureStatus.textContent, t => /signature/i.test(t));
check('l\'absence de secret est signalée',     vue.registre.secretStatus.textContent, t => /secret/i.test(t));

console.log('\nUn champ de formules par langue réellement gérée');
// languesGerees_ dérive la liste des coquilles de message : le panneau la suit
// automatiquement, sans qu'aucune langue soit recopiée dans le HTML.
const langues = srv.languesGerees_();
check('cinq langues côté serveur', langues.join(','), v => v === 'fr,en,de,es,it');
langues.forEach((lang) => check('champ présent pour « ' + lang + ' »', !!vue.registre['closings_' + lang], v => v === true));
check('valeurs par défaut préremplies',        vue.registre.closings_de.value, v => typeof v === 'string' && v.length > 0);
check('la clôture vide se saisit par un tiret', vue.registre.closings_fr.value.split('\n'), l => l.indexOf('-') !== -1);

console.log('\nSaisie, enregistrement, puis réouverture du panneau');
vue.registre.apiKey.value = 'AIzaSyTEST';
vue.registre.modelName.value = 'gemini-3.7-flash';
vue.registre.sharedSecret.value = 'secret-de-test';
vue.registre.signature.value = 'Camille';
vue.registre.closings_fr.value = 'Dites-moi si ça avance.';
vue.registre.closings_de.value = 'Melden Sie sich gerne wieder.';
vue.registre.closings_es.value = 'Cuénteme cómo va.';
vue.registre.closings_it.value = 'Fammi sapere come va.';
vue.enregistrer();

// Ce que le serveur a réellement retenu
check('signature persistée',   srv.getSignature_(), v => v === 'Camille');
check('secret persisté',       srv.getSharedSecret_(), v => v === 'secret-de-test');
check('clôtures FR persistées', srv.getCustomClosings_('fr'), l => l.indexOf('Dites-moi si ça avance.') !== -1);
check('clôtures DE persistées', srv.getCustomClosings_('de'), l => l.indexOf('Melden Sie sich gerne wieder.') !== -1);
check('clôtures ES persistées', srv.getCustomClosings_('es'), l => l.indexOf('Cuénteme cómo va.') !== -1);
check('clôtures IT persistées', srv.getCustomClosings_('it'), l => l.indexOf('Fammi sapere come va.') !== -1);

// Le panneau rouvert doit afficher ce qui a été enregistré
const rouvert = panneau(srv);
check('signature relue à la réouverture',  rouvert.registre.signature.value, v => v === 'Camille');
check('clôture DE relue',                  rouvert.registre.closings_de.value, v => v === 'Melden Sie sich gerne wieder.');
check('plus d\'avertissement de signature', rouvert.registre.signatureStatus.textContent, t => t === '');
check('plus d\'avertissement de secret',    rouvert.registre.secretStatus.textContent, t => t === '');

console.log('\nLes réglages atteignent réellement les messages générés');
check('la signature saisie est apposée',
  srv.buildFormattedResponse_('de', 'Anna', 'Gmail', 'Der Ordner wird nicht synchronisiert.', 'REPONSE'),
  t => t.trim().endsWith('Camille'));
check('la clôture DE saisie est employée',
  srv.buildFormattedResponse_('de', 'Anna', 'Gmail', 'Der Ordner wird nicht synchronisiert.', 'REPONSE'),
  t => t.includes('Melden Sie sich gerne wieder.'));

console.log('\nSignature effacée depuis le panneau');
rouvert.registre.signature.value = '';
rouvert.enregistrer();
check('la signature est retirée côté serveur', srv.getSignature_(), v => v === '');
check('le message s\'arrête alors sur la clôture',
  srv.buildFormattedResponse_('de', 'Anna', 'Gmail', 'Der Ordner wird nicht synchronisiert.', 'REPONSE'),
  t => t.trim().endsWith('Melden Sie sich gerne wieder.'));

console.log('\n' + (fails === 0 ? 'Tous les tests passent.' : fails + ' test(s) en échec.'));
process.exit(fails ? 1 : 0);
