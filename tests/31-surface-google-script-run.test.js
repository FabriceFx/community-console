/**
 * Surface exposée à `google.script.run`.
 *
 * Toute fonction publique du projet — tout nom qui ne finit pas par « _ » — peut être
 * appelée par `google.script.run` depuis n'importe quelle page HtmlService servie par le
 * projet. Or doGet livre MobileUi à des visiteurs ANONYMES, et le script s'exécute sous
 * l'identité du propriétaire. Il suffisait donc d'ouvrir l'URL /exec et de taper dans la
 * console :
 *
 *   google.script.run.withSuccessHandler(console.log).getSettings()
 *
 * pour lire la clé API Gemini et le secret partagé ; ou d'appeler fetchWithRetry pour
 * se servir de la WebApp comme d'un proxy HTTP, ou generateReply pour consommer le quota
 * Gemini sans secret.
 *
 * Deux contrôles :
 * 1. structurel — seule une liste fermée de fonctions est publique ;
 * 2. comportemental — les fonctions du panneau refusent un visiteur anonyme ou un
 *    compte autre que celui sous lequel le script s'exécute.
 */
const fs = require('fs'), path = require('path'), vm = require('vm');

let fails = 0;
const check = (n, a, p) => { const ok = p(a); if (!ok) fails++; console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n); if (!ok) console.log('        obtenu : ' + JSON.stringify(a)); };

// Chaque entrée doit se justifier : un point d'entrée Google, une cible de menu,
// ou une fonction appelée par google.script.run ET protégée en tête de corps.
const PUBLIQUES_ATTENDUES = {
  onOpen: 'déclencheur simple',
  doGet: 'point d\'entrée de la WebApp',
  doPost: 'point d\'entrée de la WebApp — assertAuthorized_',
  showSidebar: 'cible de menu',
  showAbout: 'cible de menu',
  showAvailableModels: 'cible de menu',
  processMobileThreadUrl: 'MobileUi — assertAuthorized_',
  getSettings: 'Sidebar — assertDepuisLeClasseur_',
  saveSettings: 'Sidebar — assertDepuisLeClasseur_',
  generateSharedSecret: 'Sidebar — assertDepuisLeClasseur_'
};

console.log('\nSeules les fonctions prévues sont publiques');
const dossier = path.join(__dirname, '..', 'gas');
const publiques = [];
fs.readdirSync(dossier).filter(f => f.endsWith('.gs')).forEach(f => {
  const source = fs.readFileSync(path.join(dossier, f), 'utf8');
  // Déclarations de fonction ET fonctions fléchées affectées à une constante de portée globale
  const motif = /^(?:async\s+)?function\s+([A-Za-z0-9$]+)\s*\(|^(?:const|let|var)\s+([A-Za-z0-9$]+)\s*=\s*(?:async\s*)?(?:function\b|\([^)]*\)\s*=>|[A-Za-z0-9$]+\s*=>)/gm;
  let m;
  while ((m = motif.exec(source))) {
    const nom = m[1] || m[2];
    if (!nom.endsWith('_')) publiques.push(nom + ' (' + f + ')');
  }
});
const imprevues = publiques.filter(p => !(p.split(' ')[0] in PUBLIQUES_ATTENDUES));
check('aucune fonction publique hors de la liste', imprevues, l => l.length === 0);

console.log('\nLes fonctions publiques sensibles commencent par leur garde');
const sources = fs.readdirSync(dossier).filter(f => f.endsWith('.gs'))
  .map(f => fs.readFileSync(path.join(dossier, f), 'utf8')).join('\n');
Object.entries(PUBLIQUES_ATTENDUES).forEach(([nom, raison]) => {
  const garde = (raison.match(/assert[A-Za-z]+_/) || [])[0];
  if (!garde) return;
  const corps = sources.match(new RegExp('function ' + nom + '\\s*\\([^)]*\\)\\s*\\{([\\s\\S]*?)\\n\\}'));
  // doPost lit d'abord la charge utile pour y trouver le secret : on exige seulement
  // la présence du garde ; les autres doivent l'appeler en première instruction.
  const premiere = corps ? corps[1].replace(/^\s*(\/\/[^\n]*\n\s*)*/, '').split('\n')[0] : '';
  const attendu = nom === 'doPost' ? (corps && corps[1].includes(garde + '(')) : premiere.startsWith(garde + '(');
  check(nom + ' → ' + garde, premiere, () => attendu);
});

/** Le vrai Ui.gs, sous une identité donnée. */
function serveur(actif, effectif) {
  const store = { GEMINI_API_KEY: 'AIzaCleDuProprietaire0000', PE_SHARED_SECRET: 'secret-du-proprietaire' };
  const props = {
    getProperty: k => (k in store ? store[k] : null),
    setProperty: (k, v) => { store[k] = v; },
    deleteProperty: k => { delete store[k]; }
  };
  const sb = {
    console: { warn(){}, error(){}, log(){} },
    PropertiesService: { getScriptProperties: () => props, getUserProperties: () => props },
    Utilities: { sleep(){}, getUuid: () => 'aaaa-bbbb' },
    Session: {
      getActiveUser: () => ({ getEmail: () => actif }),
      getEffectiveUser: () => ({ getEmail: () => effectif })
    }
  };
  vm.createContext(sb);
  ['gas/Config.gs', 'gas/Gemini.gs', 'gas/Ui.gs'].forEach(f => vm.runInContext(fs.readFileSync(f, 'utf8'), sb));
  return { sb, store };
}

const refuse = (fn) => { try { fn(); return false; } catch (e) { return /Accès refusé/.test(e.message); } };

console.log('\nVisiteur anonyme de la WebApp (utilisateur actif vide)');
{
  const { sb, store } = serveur('', 'pe@example.com');
  check('getSettings refusé', null, () => refuse(() => sb.getSettings()));
  check('saveSettings refusé', null, () => refuse(() => sb.saveSettings({ sharedSecret: 'pirate' })));
  check('generateSharedSecret refusé', null, () => refuse(() => sb.generateSharedSecret()));
  check('le secret du propriétaire est intact', store.PE_SHARED_SECRET, v => v === 'secret-du-proprietaire');
}

console.log('\nAutre compte connecté sur la WebApp');
{
  const { sb } = serveur('intrus@example.com', 'pe@example.com');
  check('getSettings refusé', null, () => refuse(() => sb.getSettings()));
}

console.log('\nPropriétaire depuis le classeur');
{
  const { sb } = serveur('pe@example.com', 'pe@example.com');
  const reglages = sb.getSettings();
  check('getSettings rend la clé', reglages.apiKey, v => v === 'AIzaCleDuProprietaire0000');
  check('generateSharedSecret fonctionne', sb.generateSharedSecret(), v => v === 'aaaabbbb');
}

console.log(fails ? `\n${fails} échec(s).` : '\nTous les tests passent.');
process.exit(fails ? 1 : 0);
