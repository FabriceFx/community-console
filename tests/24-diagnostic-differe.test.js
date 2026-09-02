/**
 * Reprises différées du diagnostic de lecture du fil.
 *
 * La Community Console construit sa page après coup : les premières inspections du
 * DOM tombent régulièrement à vide. `diagnostiquerUneFois` prévoit douze essais,
 * mais posait son drapeau « déjà affiché » avant d'entrer dans la branche de reprise
 * et ne le rendait jamais. La garde de tête coupait donc court à tous les appels
 * suivants : le compteur restait à 1, aucun diagnostic ne s'affichait jamais, et
 * `analyseTerminee` ne passant pas à true, le fil était réanalysé — un `innerText`
 * sur toute la page — à chaque mutation du DOM.
 */
const fs = require('fs'), vm = require('vm');

let fails = 0;
const check = (n, a, p) => { const ok = p(a); if (!ok) fails++; console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n); if (!ok) console.log('        obtenu : ' + JSON.stringify(a)); };

/**
 * Charge le content script dans un contexte isolé.
 * @param {Array} cartes Les messages que le DOM est censé exposer ([] = page non rendue)
 */
function charger(cartes) {
  const noop = () => {};
  const liens = cartes.map((c) => ({
    tagName: 'A', href: c.href, innerText: c.auteur,
    parentElement: null
  }));

  // Chaque lien de profil est enveloppé dans sa carte, comme dans la page réelle
  liens.forEach((lien, i) => {
    const carte = {
      tagName: 'DIV',
      innerText: cartes[i].auteur + '\n' + cartes[i].texte,
      parentElement: null,
      querySelectorAll: (sel) => (sel.indexOf('user') !== -1 ? [lien] : [])
    };
    lien.parentElement = carte;
  });

  const doc = {
    addEventListener: noop,
    querySelector: () => null,
    querySelectorAll: (sel) => (sel.indexOf('user') !== -1 || sel.indexOf('profile') !== -1 ? liens : []),
    getElementById: () => null,
    createElement: () => ({ style: {}, addEventListener: noop, setAttribute: noop, innerHTML: '' }),
    evaluate: () => ({ singleNodeValue: null }),
    body: { innerText: '', appendChild: noop, addEventListener: noop }
  };

  const ctx = {
    console: { log: noop, warn: noop, error: noop },
    chrome: {
      runtime: { getManifest: () => ({ version: '0.0.0' }), sendMessage: noop, lastError: null },
      storage: { local: { get: (k, cb) => cb({}) }, sync: { get: (k, cb) => cb({}) } }
    },
    document: doc,
    window: { location: { pathname: '/s/community/thread/1', href: 'x' }, getSelection: () => ({}), getComputedStyle: () => ({}) },
    MutationObserver: function () { this.observe = noop; },
    setTimeout: noop, setInterval: noop, clearInterval: noop,
    Node: { DOCUMENT_POSITION_FOLLOWING: 4 },
    navigator: { clipboard: { writeText: () => Promise.resolve() } },
    alert: noop, confirm: () => true,
    Promise, JSON, Math, Date, String, Object, Array, Number, RegExp, Error
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(
    fs.readFileSync('extension/content.js', 'utf8') +
    '\n;globalThis.__sonde = () => ({ max: MAX_TENTATIVES_DIAGNOSTIC, essais: tentativesDiagnostic, fini: analyseTerminee });',
    ctx
  );
  return ctx;
}

console.log('\nPage pas encore rendue : les essais doivent s\'enchaîner');
let ctx = charger([]);
const max = ctx.__sonde().max;

ctx.diagnostiquerUneFois();
check('un premier essai est compté', ctx.__sonde().essais, n => n === 1);
check('l\'analyse reste ouverte', ctx.__sonde().fini, v => v === false);

for (let i = 2; i < max; i++) ctx.diagnostiquerUneFois();
check('chaque appel consomme un essai', ctx.__sonde().essais, n => n === max - 1);
check('le quota n\'est pas encore épuisé', ctx.__sonde().fini, v => v === false);

ctx.diagnostiquerUneFois();
check('le quota s\'épuise au ' + max + 'e essai', ctx.__sonde().essais, n => n === max);
check('l\'analyse se clôt alors', ctx.__sonde().fini, v => v === true);

// Une fois close, l'analyse ne doit plus rien coûter
ctx.diagnostiquerUneFois();
check('aucun essai au-delà du quota', ctx.__sonde().essais, n => n === max);

console.log('\nPage rendue : le diagnostic aboutit du premier coup');
ctx = charger([
  { auteur: 'Ornella PASSA', href: '/s/community/user/111', texte: "Je ne parviens pas à récupérer la fiche de mon établissement." },
  { auteur: 'Fabrice_Fx', href: '/s/community/user/222', texte: "Le rattachement se fait depuis la fiche existante, pas en en créant une." }
]);
check('le fil est bien lu', ctx.extraireFilStructure().length, n => n === 2);
ctx.diagnostiquerUneFois();
check('aucun essai infructueux compté', ctx.__sonde().essais, n => n === 0);
check('l\'analyse est close immédiatement', ctx.__sonde().fini, v => v === true);

console.log('\n' + (fails === 0 ? 'Tous les tests passent.' : fails + ' test(s) en échec.'));
process.exit(fails ? 1 : 0);
