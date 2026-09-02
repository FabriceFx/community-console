/**
 * Signalement des échecs : cause rattachée au symptôme.
 *
 * Cas réellement rencontré : l'extension en v1.13.1 face à une WebApp restée en
 * v1.12.8 affichait « Échec : URL du thread ou message de relance manquant. » —
 * un message exact du point de vue de l'ancien backend, incompréhensible du point
 * de vue de l'utilisateur. La v1.13.0 a retiré le suivi Google Sheets, et l'ancien
 * code réclamait encore l'URL du fil pour retrouver une ligne qui n'existe plus.
 *
 * L'avertissement de version ne s'affiche qu'une fois par page : passé ce premier
 * message, chaque échec suivant réapparaissait sans explication.
 */
const fs = require('fs'), vm = require('vm');

const noop = () => {};

function charger(versionExtension) {
  const ctx = {
    console: { log: noop, warn: noop, error: noop },
    chrome: {
      runtime: { getManifest: () => ({ version: versionExtension }), sendMessage: noop, lastError: null },
      storage: { local: { get: (k, cb) => cb({}) }, sync: { get: (k, cb) => cb({}) } }
    },
    document: {
      addEventListener: noop, querySelector: () => null, querySelectorAll: () => [],
      getElementById: () => null, createElement: () => ({ style: {}, addEventListener: noop }),
      evaluate: () => ({ singleNodeValue: null }), body: { appendChild: noop }, documentElement: {}
    },
    window: { location: { pathname: '/x', href: 'https://x' }, getSelection: () => ({}), getComputedStyle: () => ({}) },
    MutationObserver: function () { this.observe = noop; },
    setTimeout: noop, setInterval: noop, clearInterval: noop,
    Node: { DOCUMENT_POSITION_FOLLOWING: 4 }, navigator: { clipboard: {} },
    alert: noop, confirm: () => true,
    Promise, JSON, Math, Date, String, Object, Array, Number, RegExp, Error
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync('extension/content.js', 'utf8'), ctx);
  return ctx;
}

let fails = 0;
const check = (n, a, p) => { const ok = p(a); if (!ok) fails++; console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n); if (!ok) console.log('        obtenu : ' + JSON.stringify(a)); };

const ctx = charger('1.13.1');

console.log('\nBackend resté en arrière : la cause accompagne le symptôme');
const perime = ctx.messageEchec_({ success: true, data: {
  status: 'error',
  message: "URL du thread ou message de relance manquant.",
  backendVersion: '1.12.8'
} });
check('le message du backend est conservé', perime, t => t.startsWith("URL du thread ou message de relance manquant."));
check('la cause est nommée',                perime, t => /pas été redéployé/.test(t));
check('les deux versions sont citées',      perime, t => t.includes('v1.13.1') && t.includes('v1.12.8'));
check('la manœuvre exacte est donnée',      perime, t => /Gérer les déploiements/.test(t) && /Nouvelle version/.test(t));
check('le piège du simple copier-coller est signalé', perime, t => /Recopier les fichiers ne suffit pas/.test(t));

console.log('\nBackend à jour : aucun bruit ajouté');
const jour = ctx.messageEchec_({ success: true, data: { status: 'error', message: "Aucun message de relance n'a été transmis.", backendVersion: '1.13.1' } });
check('message rendu tel quel', jour, t => t === "Aucun message de relance n'a été transmis.");

console.log('\nCas dégradés');
check('aucune réponse',                 ctx.messageEchec_(null), t => t === "aucune réponse de l'extension.");
check('charge utile absente',           ctx.messageEchec_({ success: true }), t => t === "réponse invalide de la WebApp.");
check('backend sans numéro de version', ctx.messageEchec_({ success: true, data: { message: 'Boum.' } }), t => t === 'Boum.');
check('message absent',                 ctx.messageEchec_({ success: true, data: { backendVersion: '1.13.1' } }), t => t === 'erreur inconnue');
check('message absent et version en désaccord', ctx.messageEchec_({ success: true, data: { backendVersion: '1.0.0' } }), t => t.startsWith('erreur inconnue') && /redéployé/.test(t));

console.log('\nÉchec de transport : l\'explication du service worker est reprise telle quelle');
// La WebApp répondant par une page HTML, il n'y a pas de charge utile à interpréter.
check('explication du service worker rendue', ctx.messageEchec_({ success: false, error: "La WebApp est introuvable à cette adresse." }),
  t => t === "La WebApp est introuvable à cette adresse.");
check('échec sans explication',               ctx.messageEchec_({ success: false }), t => t === "réponse invalide de la WebApp.");

console.log('\nLe message d\'échec ne dépend plus du seul avertissement de version');
const source = fs.readFileSync('extension/content.js', 'utf8');
// Les deux points d'échec de l'interface doivent passer par le même formateur.
const appelsHelper = (source.match(/messageEchec_\(response\)/g) || []).length;
check('les deux échecs passent par messageEchec_', appelsHelper, n => n === 2);
check('la réponse complète est transmise, pas la seule charge utile', source, t => !/messageEchec_\(data\)/.test(t.replace(/function messageEchec_\(data\)/g, '')));
// Un échec de transport doit interrompre le parcours du bouton principal
check('le bouton principal s\'arrête si la charge utile manque', source, t => /if \(!data \|\| data\.status === 'error'\)/.test(t));
check('plus de message brut sur l\'échec de relance', source.includes('"Échec : " + (data ? data.message'), v => v === false);
// L'avertissement de version reste, mais il n'est plus la seule source d'explication
check('l\'avertissement de version subsiste', source, t => t.includes('Backend non redéployé'));

console.log('\n' + (fails === 0 ? 'Tous les tests passent.' : fails + ' test(s) en échec.'));
process.exit(fails ? 1 : 0);
