/**
 * Enregistrement du popup de l'extension avec une configuration incomplète.
 *
 * Défaut signalé : « quand je ne remplis qu'une partie des valeurs, Sauvegarder
 * n'enregistre rien ». Une URL sans secret, ou une URL mal copiée, faisait refuser
 * l'enregistrement de TOUS les champs ; le message, placé sous le bouton, passait
 * inaperçu dans un popup plus haut que la fenêtre.
 *
 * Le vrai popup.js est exécuté contre un DOM simulé et un chrome.storage.local qui
 * se comporte comme le vrai : set() fusionne les clés transmises et laisse les autres
 * intactes.
 */
const fs = require('fs'), vm = require('vm');

let fails = 0;
const check = (n, a, p) => { const ok = p(a); if (!ok) fails++; console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n); if (!ok) console.log('        obtenu : ' + JSON.stringify(a)); };

/** Ouvre le popup sur un stockage donné ; rend de quoi saisir, cliquer et lire. */
const ouvrirPopup = (stockageInitial = {}) => {
  const stockage = { ...stockageInitial };
  const elements = {};
  const element = (id, type = 'text') => (elements[id] = {
    id, type, value: '', textContent: '', style: {},
    _ecouteurs: {},
    addEventListener(evt, fn) { this._ecouteurs[evt] = fn; },
    scrollIntoView() { this._visible = true; }
  });
  ['webappUrl', 'peDisplayName', 'saveBtn', 'toggleKeyBtn', 'toggleSecretBtn', 'status'].forEach((id) => element(id));
  ['geminiApiKey', 'sharedSecret'].forEach((id) => element(id, 'password'));

  let auChargement = null;
  const sandbox = {
    setTimeout: () => 0,
    document: {
      getElementById: (id) => elements[id] || null,
      addEventListener: (evt, fn) => { if (evt === 'DOMContentLoaded') auChargement = fn; }
    },
    chrome: {
      runtime: { lastError: undefined },
      storage: {
        local: {
          get: (cles, cb) => cb(Object.fromEntries(cles.filter((k) => k in stockage).map((k) => [k, stockage[k]]))),
          set: (valeurs, cb) => { Object.assign(stockage, valeurs); if (cb) cb(); }
        },
        sync: { get: (cles, cb) => cb({}), remove() {} }
      }
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync('extension/popup.js', 'utf8'), sandbox);
  auChargement();

  return {
    stockage,
    elements,
    saisir: (valeurs) => Object.entries(valeurs).forEach(([id, v]) => { elements[id].value = v; }),
    sauvegarder: () => elements.saveBtn._ecouteurs.click()
  };
};

const URL_OK = 'https://script.google.com/macros/s/ABC/exec';

console.log('\nURL sans secret : les autres champs sont enregistrés');
{
  const p = ouvrirPopup();
  p.saisir({ webappUrl: URL_OK, peDisplayName: 'Fabrice_Fx' });
  p.sauvegarder();
  check('URL enregistrée', p.stockage.webappUrl, (v) => v === URL_OK);
  check('nom enregistré', p.stockage.peDisplayName, (v) => v === 'Fabrice_Fx');
  check('le secret manquant est signalé', p.elements.status.textContent, (t) => /Enregistré/.test(t) && /secret/i.test(t));
  check('le message est amené à l\'écran', !!p.elements.status._visible, (v) => v === true);
}

console.log('\nUn seul champ rempli');
{
  const p = ouvrirPopup();
  p.saisir({ peDisplayName: 'Fabrice_Fx' });
  p.sauvegarder();
  check('nom enregistré', p.stockage.peDisplayName, (v) => v === 'Fabrice_Fx');
  check('l\'URL manquante est signalée', p.elements.status.textContent, (t) => /URL/.test(t));
}

console.log('\nURL invalide : elle seule est écartée');
{
  const p = ouvrirPopup({ webappUrl: URL_OK, sharedSecret: 'ancien' });
  p.saisir({ webappUrl: 'script.google.com/macros/s/XYZ/exec', sharedSecret: 'nouveau', peDisplayName: 'Fabrice_Fx' });
  p.sauvegarder();
  check('l\'URL précédente est conservée', p.stockage.webappUrl, (v) => v === URL_OK);
  check('le nouveau secret est enregistré', p.stockage.sharedSecret, (v) => v === 'nouveau');
  check('le nom est enregistré', p.stockage.peDisplayName, (v) => v === 'Fabrice_Fx');
  check('le refus de l\'URL est expliqué', p.elements.status.textContent, (t) => /URL non enregistrée/.test(t));
}

console.log('\nConfiguration complète');
{
  const p = ouvrirPopup();
  p.saisir({ webappUrl: URL_OK, sharedSecret: 's3cr3t', peDisplayName: 'Fabrice_Fx', geminiApiKey: 'AIzaTest' });
  p.sauvegarder();
  check('tout est enregistré', p.stockage, (s) => s.webappUrl === URL_OK && s.sharedSecret === 's3cr3t' && s.peDisplayName === 'Fabrice_Fx' && s.geminiApiKey === 'AIzaTest');
  check('aucun avertissement', p.elements.status.textContent, (t) => /succès/.test(t) && !/ℹ️|⚠️/.test(t));
}

console.log('\nRéouverture : les valeurs enregistrées sont réaffichées');
{
  const p = ouvrirPopup({ webappUrl: URL_OK, peDisplayName: 'Fabrice_Fx' });
  check('URL réaffichée', p.elements.webappUrl.value, (v) => v === URL_OK);
  check('nom réaffiché', p.elements.peDisplayName.value, (v) => v === 'Fabrice_Fx');
}

console.log(fails ? `\n${fails} échec(s).` : '\nTous les tests passent.');
process.exit(fails ? 1 : 0);
