/**
 * Intégration des boutons dans la Community Console.
 *
 * Constaté en usage réel : après consultation d'un fil, le retour vers la liste des
 * questions laissait les boutons en place. Ancrés en haut à droite avec un z-index de
 * 999999, ils recouvraient le panneau de notifications de la console — jusqu'à sa
 * croix de fermeture. `initTracker` sortait bien sur une page hors fil, mais ne
 * retirait jamais ce qu'il avait posé.
 *
 * Second défaut, invisible sur une capture : la console est une application monopage.
 * En passant d'un fil à l'autre, `analyseTerminee` restait à true et le bouton de
 * relance conservait la décision prise sur le fil précédent.
 */
const fs = require('fs'), vm = require('vm');

let fails = 0;
const check = (n, a, p) => { const ok = p(a); if (!ok) fails++; console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n); if (!ok) console.log('        obtenu : ' + JSON.stringify(a)); };

function pageConsole(cheminInitial) {
  const noop = () => {};
  const registre = {};

  const creerElement = () => {
    const el = {
      id: '', tagName: 'DIV', innerHTML: '', title: '', type: '', disabled: false,
      style: {}, _classes: [], _enfants: [],
      classList: {
        add(...c) { c.forEach(x => { if (el._classes.indexOf(x) === -1) el._classes.push(x); }); },
        remove(...c) { el._classes = el._classes.filter(x => c.indexOf(x) === -1); },
        contains(x) { return el._classes.indexOf(x) !== -1; },
        toggle(x, force) { const present = el._classes.indexOf(x) !== -1;
          const cible = (force === undefined) ? !present : !!force;
          if (cible && !present) el._classes.push(x);
          if (!cible && present) el._classes = el._classes.filter(c => c !== x);
          return cible; }
      },
      addEventListener: noop, setAttribute: noop,
      appendChild(enfant) { el._enfants.push(enfant); if (enfant.id) registre[enfant.id] = enfant; enfant._parent = el; },
      remove() {
        delete registre[el.id];
        el._enfants.forEach(e => { delete registre[e.id]; });
        if (el._parent) el._parent._enfants = el._parent._enfants.filter(e => e !== el);
      }
    };
    return el;
  };

  const body = creerElement();
  body.id = 'body';
  const racine = creerElement();
  racine.id = 'html';
  // Fonds pilotés par le test : body d'abord, élément racine en repli
  const fonds = { body: 'rgb(255, 255, 255)', html: 'rgb(255, 255, 255)' };
  const doc = {
    addEventListener: noop,
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: (id) => registre[id] || null,
    createElement: creerElement,
    evaluate: () => ({ singleNodeValue: null }),
    body: body,
    documentElement: racine
  };

  const emplacement = { pathname: cheminInitial, href: 'https://support.google.com' + cheminInitial };

  const ctx = {
    console: { log: noop, warn: noop, error: noop },
    chrome: {
      runtime: { getManifest: () => ({ version: '0.0.0' }), sendMessage: noop, lastError: null },
      storage: { local: { get: (k, cb) => cb({}) }, sync: { get: (k, cb) => cb({}) } }
    },
    document: doc,
    window: {
      location: emplacement,
      getSelection: () => ({}),
      getComputedStyle: (el) => ({ backgroundColor: (el === body) ? fonds.body : fonds.html })
    },
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
    '\n;globalThis.__sonde = () => ({ fini: analyseTerminee, essais: tentativesDiagnostic, memoire: contenuEditeurMemorise });' +
    '\n;globalThis.__memoriser = (t) => { contenuEditeurMemorise = t; };',
    ctx
  );

  return {
    ctx, registre, body, fonds,
    aller(chemin) { emplacement.pathname = chemin; emplacement.href = 'https://support.google.com' + chemin; },
    dock: () => registre['pe-tracker-dock'] || null,
    bouton: () => registre['pe-tracker-btn'] || null
  };
}

const FIL_A = '/s/community/forum/553472/thread/111111';
const FIL_B = '/s/community/forum/553472/thread/222222';
const LISTE = '/s/community/forum/553472';

console.log('\nSur un fil : les boutons sont posés dans un conteneur unique');
let page = pageConsole(FIL_A);
page.ctx.initTracker();
check('le conteneur existe',            !!page.dock(), v => v === true);
check('le bouton principal existe',     !!page.bouton(), v => v === true);
check('il est dans le conteneur, pas dans body', page.dock()._enfants.indexOf(page.bouton()), i => i !== -1);
check('body ne porte que le conteneur', page.body._enfants.length, n => n === 1);

console.log('\nRetour vers la liste des questions : les boutons disparaissent');
page.aller(LISTE);
page.ctx.initTracker();
check('conteneur retiré',       page.dock(), v => v === null);
check('bouton retiré',          page.bouton(), v => v === null);
check('body est vide',          page.body._enfants.length, n => n === 0);

// C'est exactement le cas observé : sans ce retrait, les boutons recouvraient
// le panneau de notifications de la console.
page.ctx.initTracker();
check('un second passage ne les fait pas revenir', page.dock(), v => v === null);

console.log('\nRetour sur un fil : les boutons reviennent');
page.aller(FIL_B);
page.ctx.initTracker();
check('conteneur recréé', !!page.dock(), v => v === true);
check('bouton recréé',    !!page.bouton(), v => v === true);

console.log('\nPassage d\'un fil à l\'autre : l\'état est remis à zéro');
page = pageConsole(FIL_A);
// Le fil simulé ne rend aucun message : l'analyse consomme ses douze essais avant
// de se clore. C'est le comportement voulu sur une page au rendu différé.
for (let i = 0; i < 12; i++) page.ctx.initTracker();
page.ctx.__memoriser('Un brouillon rédigé sur le premier fil, assez long pour compter.');
check('analyse close après épuisement du quota', page.ctx.__sonde().fini, v => v === true);
check('douze essais consommés',                  page.ctx.__sonde().essais, n => n === 12);

page.aller(FIL_B);
page.ctx.initTracker();
check('analyse rouverte sur le second fil', page.ctx.__sonde().fini, v => v === false);
check('le comptage repart de zéro',         page.ctx.__sonde().essais, n => n === 1);
check('brouillon du fil précédent oublié',  page.ctx.__sonde().memoire, v => v === '');

console.log('\nLa teinte suit la page, pas le réglage du système');
// `prefers-color-scheme` décrit le système : un navigateur en thème sombre devant une
// console claire donnait des boutons sombres posés sur du blanc.
const teinte = (fondBody, fondHtml) => {
  const v = pageConsole(FIL_A);
  v.fonds.body = fondBody;
  v.fonds.html = fondHtml;
  v.ctx.initTracker();
  return v.dock()._classes.indexOf('pe-sombre') !== -1;
};
check('console claire → variante claire',   teinte('rgb(255, 255, 255)', 'rgb(255, 255, 255)'), v => v === false);
check('console sombre → variante sombre',   teinte('rgb(32, 33, 36)', 'rgb(32, 33, 36)'), v => v === true);
// Beaucoup de pages ne peignent le fond que sur l'élément racine : un corps transparent
// lu comme du noir aurait fait basculer en sombre une console parfaitement claire.
check('corps transparent → on lit la racine (claire)', teinte('rgba(0, 0, 0, 0)', 'rgb(255, 255, 255)'), v => v === false);
check('corps transparent → on lit la racine (sombre)', teinte('rgba(0, 0, 0, 0)', 'rgb(32, 33, 36)'), v => v === true);
check('fond illisible → variante claire par défaut',   teinte('', ''), v => v === false);

console.log('\nFeuille de style : intégration à la console');
const css = fs.readFileSync('extension/styles.css', 'utf8');
check('un conteneur unique est positionné', (css.match(/position:\s*fixed/g) || []).length, n => n === 1);
check('ancrage en bas, plus en haut',       css, t => /#pe-tracker-dock\s*\{[^}]*bottom:/.test(t) && !/top:/.test(t));
check('le bouton rond de la console est dégagé', css, t => /bottom:\s*96px/.test(t));
check('z-index modéré, une boîte de dialogue peut passer devant', css, t => !/z-index:\s*999999/.test(t) && /z-index:\s*9000/.test(t));
check('les états définissent fond ET texte', css, t => /pe-etat-succes\s*\{[^}]*background-color[^}]*color:/.test(t));
check('la variante sombre passe par une classe, pas par le système', css, t => !/@media[^{]*prefers-color-scheme[^{]*\{/.test(t) && t.includes('.pe-sombre'));

const source = fs.readFileSync('extension/content.js', 'utf8');
check('aucune couleur posée en ligne', /style\.backgroundColor\s*=/.test(source), v => v === false);
check('les boutons ne vont plus dans body', source.includes('document.body.appendChild(btn)'), v => v === false);

console.log('\n' + (fails === 0 ? 'Tous les tests passent.' : fails + ' test(s) en échec.'));
process.exit(fails ? 1 : 0);
