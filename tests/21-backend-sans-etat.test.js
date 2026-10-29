/**
 * Point d'entrée Webhook doPost, désormais sans état.
 *
 * L'outil ne conserve plus aucune question ni réponse. Le bac à sable ci-dessous
 * ne fournit donc NI SpreadsheetApp NI LockService : si le backend tentait encore
 * d'écrire ou de verrouiller quoi que ce soit, la requête lèverait une exception
 * et les tests le signaleraient. C'est le contrôle structurel le plus solide dont
 * on dispose contre une réintroduction du stockage.
 */
const fs = require('fs'), vm = require('vm');

const SECRET = 'secret-de-test-123';

function backend(options) {
  const o = options || {};
  const scriptProps = {};
  if (o.secretConfigure !== false) scriptProps.PE_SHARED_SECRET = SECRET;

  const appels = { generateReply_: [], generateFollowUp_: [] };

  const sandbox = {
    console: { log(){}, warn(){}, error(){} },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: k => (k in scriptProps ? scriptProps[k] : null),
        setProperty: (k, v) => { scriptProps[k] = v; },
        deleteProperty: k => { delete scriptProps[k]; }
      }),
      getUserProperties: () => ({ getProperty: () => null, setProperty(){}, deleteProperty(){} })
    },
    ContentService: {
      createTextOutput: (t) => ({ _t: t, setMimeType() { return this; }, getContent() { return this._t; } }),
      MimeType: { JSON: 'application/json' }
    },
    HtmlService: {
      createTemplateFromFile: () => ({
        evaluate: () => ({ setTitle(){return this;}, setFaviconUrl(){return this;}, addMetaTag(){return this;}, setXFrameOptionsMode(){return this;} })
      }),
      XFrameOptionsMode: { ALLOWALL: 'ALLOWALL' }
    },
    UrlFetchApp: { fetch: () => ({ getResponseCode: () => 200, getHeaders: () => ({}), getContentText: () => '{}' }) },
    Utilities: { sleep(){}, getUuid: () => '0123-4567' }
    // Volontairement absents : SpreadsheetApp, LockService, CacheService.
  };
  vm.createContext(sandbox);
  ['gas/Config.gs', 'gas/Gemini.gs', 'gas/Api.gs'].forEach(f => vm.runInContext(fs.readFileSync(f, 'utf8'), sandbox));

  // La génération est simulée : ce fichier teste l'aiguillage, pas le modèle
  sandbox.generateReply_ = function (content, author, product, apiKey) {
    appels.generateReply_.push({ content, author, product, apiKey });
    return Object.assign({
      ok: true, status: 'REPONSE', confidence: 'HAUTE', lang: 'fr',
      text: 'Proposition pour ' + author, uiPathUnsourced: false, truncated: false
    }, o.reply || {});
  };
  sandbox.generateFollowUp_ = function (contexte) {
    appels.generateFollowUp_.push(contexte);
    return Object.assign({
      ok: true, suite: 'NOUVEAU', confidence: 'MOYENNE', lang: 'fr',
      text: 'Réponse à la relance', repeatsPrevious: false, overlap: 0, truncated: false
    }, o.followUp || {});
  };

  return {
    sandbox,
    appels,
    post(charge) {
      const out = sandbox.doPost({ postData: { contents: typeof charge === 'string' ? charge : JSON.stringify(charge) } });
      return JSON.parse(out.getContent());
    }
  };
}

let fails = 0;
const check = (n, a, p) => { const ok = p(a); if (!ok) fails++; console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n); if (!ok) console.log('        obtenu : ' + JSON.stringify(a)); };

console.log('\n1. Charge utile et autorisation');
{
  const b = backend();
  check('JSON invalide refusé proprement', b.post('{ pas du json'), r => r.status === 'error' && /JSON/.test(r.message));
  check('aucune génération déclenchée', b.appels.generateReply_.length, n => n === 0);

  check('secret absent refusé', b.post({ content: 'x' }), r => r.code === 'unauthorized');
  check('secret erroné refusé', b.post({ content: 'x', secret: 'mauvais' }), r => r.code === 'unauthorized');
  check('quota Gemini préservé sur refus', b.appels.generateReply_.length, n => n === 0);

  const sansSecret = backend({ secretConfigure: false });
  check('serveur sans secret configuré refuse tout', sansSecret.post({ content: 'x', secret: SECRET }), r => r.code === 'unauthorized');

  check('la version accompagne chaque réponse', b.post({ content: 'x', secret: 'mauvais' }).backendVersion, v => typeof v === 'string' && v.length > 0);
}

console.log('\n2. Question nouvelle : générer, renvoyer, ne rien garder');
{
  const b = backend();
  const r = b.post({
    secret: SECRET, url: 'https://support.google.com/websearch/thread/42',
    title: 'Titre', author: 'Marie', product: 'Google Drive',
    content: 'Le partage externe est refusé.', apiKey: 'AIzaSyDUCLIENT'
  });

  check('statut success', r.status, v => v === 'success');
  check('proposition renvoyée', r.summary, s => s === 'Proposition pour Marie');
  check('statut de réponse transmis', r.replyStatus, v => v === 'REPONSE');
  check('niveau de confiance transmis', r.confidence, v => v === 'HAUTE');
  check('langue transmise', r.lang, v => v === 'fr');
  check('aucun identifiant de suivi', r.id, v => v === undefined);
  check('aucun numéro de ligne', r.row, v => v === undefined);

  const appel = b.appels.generateReply_[0];
  check('contenu transmis au modèle', appel.content, c => c === 'Le partage externe est refusé.');
  check('auteur transmis', appel.author, a => a === 'Marie');
  check('produit transmis', appel.product, p => p === 'Google Drive');
  check('clé API de l\'appelant relayée', appel.apiKey, k => k === 'AIzaSyDUCLIENT');
  check('la clé n\'est jamais persistée', b.sandbox.getGeminiApiKey_(), k => k === '');

  check('question vide refusée', b.post({ secret: SECRET, content: '   ' }), x => x.status === 'error');
}

console.log('\n3. Avertissements de relecture remontés à l\'appelant');
{
  const b = backend({ reply: { status: 'CLARIFICATION', confidence: 'FAIBLE', uiPathUnsourced: true, truncated: true } });
  const r = b.post({ secret: SECRET, content: 'Question incomplète.' });
  check('CLARIFICATION remontée', r.replyStatus, v => v === 'CLARIFICATION');
  check('confiance faible remontée', r.confidence, v => v === 'FAIBLE');
  check('chemin d\'interface non sourcé remonté', r.uiPathUnsourced, v => v === true);
  check('troncature remontée', r.truncated, v => v === true);

  const echec = backend({ reply: { ok: false, status: 'ERREUR', text: 'Clé API Gemini manquante.' } });
  check('échec de génération renvoyé en erreur', echec.post({ secret: SECRET, content: 'x' }), x => x.status === 'error' && /Clé API/.test(x.message));
}

console.log('\n4. Relance : tout le contexte vient de l\'appelant');
{
  const b = backend();
  const r = b.post({
    secret: SECRET, action: 'followUp',
    followUpText: "J'ai essayé, ça ne marche toujours pas.",
    question: "Je n'arrive pas à partager un dossier.",
    previousAnswerFromThread: "Le partage externe est bloqué par une règle du domaine.",
    author: 'Marie', product: 'Google Drive', apiKey: 'AIzaSyDUCLIENT'
  });

  const ctx = b.appels.generateFollowUp_[0];
  check('la relance atteint le modèle', ctx.followUp, t => /ça ne marche toujours pas/.test(t));
  check('la question d\'origine est transmise', ctx.question, q => /partager un dossier/.test(q));
  check('la réponse précédente est transmise', ctx.previousAnswer, p => /règle du domaine/.test(p));
  check('la clé API est relayée', ctx.apiKey, k => k === 'AIzaSyDUCLIENT');
  check('cadrage « déjà répondu » par défaut', ctx.peADejaRepondu, v => v === true);
  check('référence disponible signalée', r.hadPreviousAnswer, v => v === true);
  check('proposition renvoyée', r.summary, s => s === 'Réponse à la relance');

  check('relance vide refusée', b.post({ secret: SECRET, action: 'followUp', followUpText: '' }), x => x.status === 'error');

  // Sans réponse précédente repérée dans le fil, le garde-fou anti-redite est aveugle
  const aveugle = backend();
  const sansRef = aveugle.post({ secret: SECRET, action: 'followUp', followUpText: 'Et maintenant ?' });
  check('absence de référence signalée', sansRef.hadPreviousAnswer, v => v === false);

  // Première intervention sur un fil traité par un autre bénévole
  const premiere = backend({ followUp: { suite: 'RIEN_A_AJOUTER', text: 'La réponse existante est complète.' } });
  const rien = premiere.post({ secret: SECRET, action: 'followUp', followUpText: 'x', peADejaRepondu: false });
  check('cadrage « autre bénévole » transmis', premiere.appels.generateFollowUp_[0].peADejaRepondu, v => v === false);
  check('« rien à ajouter » signalé à l\'extension', rien.nothingToAdd, v => v === true);

  const redite = backend({ followUp: { repeatsPrevious: true, overlap: 82, confidence: 'FAIBLE' } });
  const rr = redite.post({ secret: SECRET, action: 'followUp', followUpText: 'x', previousAnswerFromThread: 'y' });
  check('redite signalée', rr.repeatsPrevious, v => v === true);
  check('taux de recouvrement transmis', rr.overlap, v => v === 82);
}

console.log('\n5. Aucun stockage, par construction');
{
  // Les services d'écriture n'existent pas dans ce bac à sable : toute tentative
  // lèverait une ReferenceError, que doPost renverrait en erreur.
  const b = backend();
  check('SpreadsheetApp absent du bac à sable', b.sandbox.SpreadsheetApp, v => v === undefined);
  check('LockService absent du bac à sable', b.sandbox.LockService, v => v === undefined);
  check('une question passe malgré tout', b.post({ secret: SECRET, content: 'x' }).status, v => v === 'success');
  check('une relance passe malgré tout', b.post({ secret: SECRET, action: 'followUp', followUpText: 'x' }).status, v => v === 'success');

  const source = fs.readFileSync('gas/Api.gs', 'utf8');
  ['SpreadsheetApp', 'LockService', 'appendRow', 'getTrackingSheet_', 'recordPublished', 'registerOnly', 'CONFIG.COL']
    .forEach((trace) => check('Api.gs ne mentionne plus « ' + trace + ' »', source.includes(trace), v => v === false));
}

console.log('\n6. doGet n\'est qu\'une sonde JSON');
{
  const b = backend();
  // Avec ou sans paramètre (l'ancienne sonde demandait ?api=json) : toujours du JSON.
  [{ parameter: { api: 'json' } }, { parameter: {} }, undefined].forEach((e, i) => {
    const json = JSON.parse(b.sandbox.doGet(e).getContent());
    check('sonde ' + (i + 1) + ' : succès et version', json, j => j.status === 'success' && !!j.backendVersion);
    check('sonde ' + (i + 1) + ' : aucun réglage divulgué', JSON.stringify(json), t => !/secret|apiKey|AIza/i.test(t));
  });

  // Une page HtmlService servie aux anonymes rouvrirait la surface google.script.run.
  const source = fs.readFileSync('gas/Api.gs', 'utf8');
  check('Api.gs ne sert aucune page HTML', /HtmlService\.create/.test(source), v => v === false);
  check('plus de MobileUi.html dans gas/', fs.existsSync('gas/MobileUi.html'), v => v === false);
}

console.log('\n' + (fails === 0 ? 'Tous les tests passent.' : fails + ' test(s) en échec.'));
process.exit(fails ? 1 : 0);
