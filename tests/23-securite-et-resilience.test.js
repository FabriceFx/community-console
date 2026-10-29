/**
 * Tests unitaires de la sécurité, de l'anonymisation PII et de la résilience HTTP.
 *
 * Couvre :
 * - sanitizePii_ (masquage d'emails, téléphones, mots de passe et clés)
 * - redactSecrets_ (nettoyage des URL avec ?key= et tokens AIza)
 * - fetchWithRetry_ (retry avec backoff exponentiel sur 429/500/503 et absence de retry sur 404)
 * - resolveRedirectUrl_ (résolution des redirections Vertex AI Search)
 * - Ui.gs & Config.gs (gestion sécurisée des paramètres et génération de secret)
 */
const fs = require('fs'), vm = require('vm');

function createSecurityEnv() {
  const userProps = {};
  const scriptProps = {};

  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    PropertiesService: {
      getUserProperties() {
        return {
          getProperty(k) { return userProps[k] || null; },
          setProperty(k, v) { userProps[k] = v; },
          deleteProperty(k) { delete userProps[k]; }
        };
      },
      getScriptProperties() {
        return {
          getProperty(k) { return scriptProps[k] || null; },
          setProperty(k, v) { scriptProps[k] = v; },
          // Le service réel expose deleteProperty : une saisie vidée efface le
          // réglage au lieu d'enregistrer une chaîne vide (signature, clôtures).
          deleteProperty(k) { delete scriptProps[k]; }
        };
      }
    },
    Utilities: {
      sleep() {},
      getUuid() { return '01234567-89ab-cdef-0123-456789abcdef'; }
    },
    // Le panneau s'ouvre depuis le classeur : utilisateur actif et effectif coïncident.
    Session: {
      getActiveUser: () => ({ getEmail: () => 'pe@example.com' }),
      getEffectiveUser: () => ({ getEmail: () => 'pe@example.com' })
    },
    UrlFetchApp: {
      fetch(url, options) {
        throw new Error('Default fetch mock not configured');
      }
    }
  };

  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync('gas/Config.gs', 'utf8'), sandbox);
  vm.runInContext(fs.readFileSync('gas/Gemini.gs', 'utf8'), sandbox);
  vm.runInContext(fs.readFileSync('gas/Ui.gs', 'utf8'), sandbox);

  return {
    sandbox,
    userProps,
    scriptProps
  };
}

let fails = 0;
const check = (n, a, p) => {
  const ok = p(a);
  if (!ok) fails++;
  console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n);
  if (!ok) console.log('        obtenu : ' + (a !== undefined ? JSON.stringify(a).slice(0, 300) : 'undefined'));
};

console.log('\n1. Anonymisation PII (sanitizePii_)');
{
  const env = createSecurityEnv();
  const sanitizePii_ = env.sandbox.sanitizePii_;

  // Cas limites
  check('entrée vide gérée', sanitizePii_(''), v => v === '');
  check('null géré', sanitizePii_(null), v => v === '');
  check('undefined géré', sanitizePii_(undefined), v => v === '');
  check('nombre géré', sanitizePii_(12345), v => v === '');

  // Adresses e-mail
  const emailText = 'Contactez-moi sur dupont.jean+perso@gmail.com ou support@sub.domain.co.uk svp.';
  const cleanedEmail = sanitizePii_(emailText);
  check('adresses email masquées', cleanedEmail, t =>
    !t.includes('dupont.jean') &&
    !t.includes('@gmail.com') &&
    !t.includes('@sub.domain.co.uk') &&
    t.includes('[EMAIL MASQUÉ]')
  );

  // Numéros de téléphone français et internationaux
  const phoneText = 'Appelez au 06 12 34 56 78 ou au +33 1 40 50 60 70 ou au +1 555 123 4567.';
  const cleanedPhone = sanitizePii_(phoneText);
  check('numéros de téléphone masqués', cleanedPhone, t =>
    !t.includes('06 12 34 56 78') &&
    !t.includes('+33 1 40 50 60 70') &&
    !t.includes('+1 555 123 4567') &&
    t.includes('[TÉLÉPHONE MASQUÉ]')
  );

  // Mots de passe et tokens
  const secretsText = 'Voici mon token = secret_token_abc123 et mon mot de passe: SuperSecretP@ss99 pour le test.';
  const cleanedSecrets = sanitizePii_(secretsText);
  check('mots de passe et secrets masqués', cleanedSecrets, t =>
    !t.includes('secret_token_abc123') &&
    !t.includes('SuperSecretP@ss99') &&
    t.includes('[DONNÉE SENSIBLE MASQUÉE]')
  );
}

console.log('\n2. Nettoyage des clés d\'API dans les logs (redactSecrets_)');
{
  const env = createSecurityEnv();
  const redactSecrets_ = env.sandbox.redactSecrets_;

  // URL avec ?key=
  const urlWithKey = 'https://generativelanguage.googleapis.com/v1beta/models?key=AIzaSyD9876543210ABCDEF&alt=json';
  const cleanedUrl = redactSecrets_(urlWithKey);
  check('paramètre ?key= masqué', cleanedUrl, u =>
    !u.includes('AIzaSyD9876543210ABCDEF') &&
    u.includes('?key=[MASQUÉE]&alt=json')
  );

  // Clé AIza isolée dans un message d'erreur
  const errMsg = 'Error in client call: key AIzaSyA1B2C3D4E5F6G7H8 is invalid or expired.';
  const cleanedErr = redactSecrets_(errMsg);
  check('clé isolée AIza... masquée', cleanedErr, m =>
    !m.includes('AIzaSyA1B2C3D4E5F6G7H8') &&
    m.includes('[CLÉ MASQUÉE]')
  );

  // Cas limites
  check('null géré', redactSecrets_(null), v => v === '');
  check('undefined géré', redactSecrets_(undefined), v => v === '');
}

console.log('\n3. Résilience et Retries HTTP (fetchWithRetry_)');
{
  const env = createSecurityEnv();
  const fetchWithRetry_ = env.sandbox.fetchWithRetry_;

  // A. Succès immédiat (200) -> 1 seul appel
  let calls200 = 0;
  env.sandbox.UrlFetchApp.fetch = () => {
    calls200++;
    return { getResponseCode: () => 200, getContentText: () => '{"ok":true}' };
  };
  const res200 = fetchWithRetry_('https://example.com', {}, 3);
  check('200 retourne immédiatement au 1er essai', calls200, n => n === 1);
  check('réponse 200 intacte', res200.getResponseCode(), c => c === 200);

  // B. Pas de retry sur 404 (erreur non transitoire)
  let calls404 = 0;
  env.sandbox.UrlFetchApp.fetch = () => {
    calls404++;
    return { getResponseCode: () => 404, getContentText: () => 'Not Found' };
  };
  const res404 = fetchWithRetry_('https://example.com/notfound', {}, 3);
  check('404 non réessayé (1 seul appel)', calls404, n => n === 1);
  check('réponse 404 retournée', res404.getResponseCode(), c => c === 404);

  // C. Retries sur 503 puis succès au 2e essai
  let calls503 = 0;
  env.sandbox.UrlFetchApp.fetch = () => {
    calls503++;
    if (calls503 === 1) return { getResponseCode: () => 503 };
    return { getResponseCode: () => 200, getContentText: () => 'Success after 503' };
  };
  const resRecovered = fetchWithRetry_('https://example.com/flaky', {}, 3);
  check('retry effectué après 503 (2 appels)', calls503, n => n === 2);
  check('succès final 200 retourné', resRecovered.getResponseCode(), c => c === 200);

  // D. Épuisement des retries sur 429
  let calls429 = 0;
  env.sandbox.UrlFetchApp.fetch = () => {
    calls429++;
    return { getResponseCode: () => 429, getContentText: () => 'Rate limit' };
  };
  const res429 = fetchWithRetry_('https://example.com/ratelimit', {}, 3);
  check('maxRetries atteint sur 429 (3 appels)', calls429, n => n === 3);
  check('dernière réponse 429 retournée', res429.getResponseCode(), c => c === 429);

  // E. Exception réseau avec clé API dans l'URL -> secret masqué dans l'exception
  let callsEx = 0;
  env.sandbox.UrlFetchApp.fetch = () => {
    callsEx++;
    throw new Error('DNS failure on https://api.google.com/?key=AIzaSySECRET123456');
  };
  let errorCaught = null;
  try {
    fetchWithRetry_('https://api.google.com/?key=AIzaSySECRET123456', {}, 2);
  } catch (e) {
    errorCaught = e.message;
  }
  check('exception levée après épuisement des retries', callsEx, n => n === 2);
  check('secret masqué dans le message de l\'exception', errorCaught, m =>
    !m.includes('AIzaSySECRET123456') &&
    m.includes('[MASQUÉE]')
  );
}

console.log('\n4. Résolution des Redirections Vertex AI Search (resolveRedirectUrl_)');
{
  const env = createSecurityEnv();
  const resolveRedirectUrl_ = env.sandbox.resolveRedirectUrl_;

  // URL standard (hors Vertex) -> inchangée sans aucun appel HTTP
  let fetchCount = 0;
  env.sandbox.UrlFetchApp.fetch = () => { fetchCount++; return {}; };
  const directUrl = resolveRedirectUrl_('https://support.google.com/mail/answer/123');
  check('URL non-Vertex inchangée', directUrl, u => u === 'https://support.google.com/mail/answer/123');
  check('aucun appel HTTP pour URL standard', fetchCount, n => n === 0);

  // URL Vertex avec redirection Location
  const vertexUrl = 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/ABCDEF123456';
  env.sandbox.UrlFetchApp.fetch = () => ({
    getHeaders: () => ({
      Location: 'https://support.google.com/docs/answer/998877'
    })
  });
  const resolved = resolveRedirectUrl_(vertexUrl);
  check('redirection Vertex résolue vers le lien direct', resolved, u => u === 'https://support.google.com/docs/answer/998877');

  // URL Vertex avec échec réseau -> repli propre sur l'URL d'origine
  env.sandbox.UrlFetchApp.fetch = () => { throw new Error('Timeout'); };
  const fallback = resolveRedirectUrl_(vertexUrl);
  check('repli sur URL d\'origine en cas d\'échec de redirection', fallback, u => u === vertexUrl);
}

console.log('\n5. Configuration et Secret Partagé (Ui.gs & Config.gs)');
{
  const env = createSecurityEnv();
  const { saveSettings, getSettings, generateSharedSecret } = env.sandbox;

  // Sauvegarde des réglages, dans les cinq langues gérées
  saveSettings({
    apiKey: 'AIzaSyNOUVELLECLE999',
    modelName: 'gemini-3.7-flash',
    sharedSecret: 'mon-secret-sauvegarde-321',
    signature: 'Camille',
    closingsFr: 'Bien cordialement,\n-',
    closingsEn: 'Best regards,\n-',
    closingsDe: 'Viele Grüße,\n-',
    closingsEs: 'Un saludo,\n-',
    closingsIt: 'Cordiali saluti,\n-'
  });

  const settings = getSettings();
  const cloture = (lang) => (settings.closings.filter(c => c.lang === lang)[0] || {}).valeur;

  check('clé API enregistrée dans UserProperties', settings.apiKey, k => k === 'AIzaSyNOUVELLECLE999');
  check('modèle enregistré dans UserProperties', settings.modelName, m => m === 'gemini-3.7-flash');
  check('secret partagé enregistré dans ScriptProperties', settings.sharedSecret, s => s === 'mon-secret-sauvegarde-321');
  check('signature enregistrée', settings.signature, v => v === 'Camille');

  // Le panneau n'exposait que FR et EN alors que cinq langues étaient gérées :
  // les trois autres restaient bloquées sur des formules non modifiables.
  check('les cinq langues sont exposées', settings.closings.map(c => c.lang).join(','), v => v === 'fr,en,de,es,it');
  check('chaque langue porte un intitulé lisible', settings.closings.every(c => c.label && c.label !== c.lang), v => v === true);
  check('formules FR enregistrées', cloture('fr'), c => c.includes('Bien cordialement'));
  check('formules EN enregistrées', cloture('en'), c => c.includes('Best regards'));
  check('formules DE enregistrées', cloture('de'), c => c.includes('Viele Grüße'));
  check('formules ES enregistrées', cloture('es'), c => c.includes('Un saludo'));
  check('formules IT enregistrées', cloture('it'), c => c.includes('Cordiali saluti'));
  check('la clôture vide est rendue par un tiret', cloture('de'), c => c.split('\n').pop() === '-');

  // Une signature vide est un choix légitime : le message s'arrête sur la clôture
  saveSettings({ signature: '   ' });
  check('signature effaçable', getSettings().signature, v => v === '');

  // Génération d'un nouveau secret
  const generated = generateSharedSecret();
  check('secret généré non vide', !!generated, v => v === true);
  check('tirets retirés du secret (format hexadécimal condensé)', generated.includes('-'), v => v === false);
  check('secret généré immédiatement persisté côté serveur', env.sandbox.getSharedSecret_(), s => s === generated);
}

console.log('\n' + (fails === 0 ? 'Tous les tests passent.' : fails + ' test(s) en échec.'));
process.exit(fails ? 1 : 0);
