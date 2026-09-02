/**
 * Réponses de la WebApp qui ne sont pas du JSON.
 *
 * Cas réellement rencontré : l'adresse enregistrée ne correspondait plus à un
 * déploiement actif, et Apps Script a répondu par sa page « Page introuvable ».
 * Le service worker transmettait alors :
 *
 *     sendResponse({ success: true, data: { status: "success", summary: texte } });
 *
 * Autrement dit, il présentait la page d'erreur HTML de Google comme la proposition
 * rédigée par Gemini — et l'extension la plaçait dans le champ de réponse du forum.
 * Le code HTTP n'était même pas consulté.
 */
const fs = require('fs'), vm = require('vm');

// Extrait fidèle de la page réellement reçue
const PAGE_INTROUVABLE = '<!DOCTYPE html><html lang="fr"><head><meta name="description" content="Traitement de texte, présentations et feuilles de calcul en ligne">' +
  '<title>Page introuvable</title></head><body><p class="errorMessage">Impossible d\'ouvrir le fichier pour le moment.</p>' +
  '<p> Vérifiez l\'adresse, puis réessayez.</p></body></html>';

const PAGE_CONNEXION = '<!DOCTYPE html><html><head><title>Connexion - Comptes Google</title></head>' +
  '<body><form action="https://accounts.google.com/ServiceLogin"></form></body></html>';

function servicePorte(reponseHttp) {
  let ecouteur = null;
  const ctx = {
    console: { log(){}, warn(){}, error(){} },
    chrome: { runtime: { onMessage: { addListener: (f) => { ecouteur = f; } } } },
    fetch: () => Promise.resolve(reponseHttp),
    Promise, JSON, String, Object, Array, Number, Math, RegExp, Error
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync('extension/background.js', 'utf8'), ctx);
  return {
    ctx,
    envoyer(charge) {
      return new Promise((resolve) => {
        ecouteur({ action: 'sendToWebapp', webappUrl: 'https://script.google.com/macros/s/AAA/exec', payload: charge || {} },
          null, resolve);
      });
    },
    envoyerSansUrl(resolve) {
      ecouteur({ action: 'sendToWebapp', webappUrl: '', payload: {} }, null, resolve);
    }
  };
}

const httpReponse = (statut, corps) => ({ status: statut, ok: statut >= 200 && statut < 300, text: () => Promise.resolve(corps) });

let fails = 0;
const check = (n, a, p) => { const ok = p(a); if (!ok) fails++; console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n); if (!ok) console.log('        obtenu : ' + JSON.stringify(a)); };

(async () => {
  console.log('\nLa page « Page introuvable » d\'Apps Script');
  let r = await servicePorte(httpReponse(200, PAGE_INTROUVABLE)).envoyer();
  check('signalée comme un échec',          r.success, v => v === false);
  check('jamais présentée comme réponse',   JSON.stringify(r), t => !/"status"\s*:\s*"success"/.test(t));
  check('le HTML n\'est pas transmis',      JSON.stringify(r), t => !t.includes('DOCTYPE'));
  check('la cause est nommée',              r.error, t => /introuvable à cette adresse/.test(t));
  check('les trois causes usuelles sont citées', r.error, t => /archivé/.test(t) && /tronquée/.test(t) && /déploiement actif/.test(t));
  check('la manœuvre est donnée',           r.error, t => /Gérer les déploiements/.test(t) && /\/exec/.test(t));

  console.log('\nRedirection vers l\'écran de connexion');
  r = await servicePorte(httpReponse(200, PAGE_CONNEXION)).envoyer();
  check('signalée comme un échec', r.success, v => v === false);
  check('l\'accès du déploiement est mis en cause', r.error, t => /N'importe qui/.test(t));

  console.log('\nCodes HTTP');
  r = await servicePorte(httpReponse(500, '<html>Erreur serveur</html>')).envoyer();
  check('5xx : incident passager annoncé', r.error, t => /incident passager/.test(t) && /500/.test(t));
  r = await servicePorte(httpReponse(404, 'introuvable')).envoyer();
  check('4xx : vérifier l\'URL', r.error, t => /404/.test(t));
  check('le code HTTP est remonté', r.httpStatus, v => v === 404);

  console.log('\nDu JSON servi avec un code d\'erreur reste une erreur');
  r = await servicePorte(httpReponse(403, '{"status":"error","message":"Accès refusé."}')).envoyer();
  check('signalé comme un échec', r.success, v => v === false);
  check('le message du backend est repris', r.error, t => /Accès refusé/.test(t));

  console.log('\nLe cas nominal n\'est pas dégradé');
  r = await servicePorte(httpReponse(200, '{"status":"success","summary":"Bonjour Marie,","backendVersion":"1.13.3"}')).envoyer();
  check('succès transmis',            r.success, v => v === true);
  check('charge utile intacte',       r.data.summary, v => v === 'Bonjour Marie,');
  check('version du backend conservée', r.data.backendVersion, v => v === '1.13.3');

  console.log('\nURL de WebApp non configurée');
  const sansUrl = servicePorte(httpReponse(200, '{}'));
  r = await new Promise((resolve) => {
    sansUrl.ctx.chrome.runtime.onMessage.addListener; // l'écouteur est déjà posé
    sansUrl.envoyerSansUrl(resolve);
  });
  check('signalée comme un échec', r.success, v => v === false);
  check('cause explicite',         r.error, t => /URL de la WebApp manquante/.test(t));

  console.log('\n' + (fails === 0 ? 'Tous les tests passent.' : fails + ' test(s) en échec.'));
  process.exit(fails ? 1 : 0);
})();
