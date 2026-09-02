/**
 * Tests unitaires du point d'entrée Webhook doPost (gas/Api.gs).
 *
 * Simule l'environnement Google Apps Script (SpreadsheetApp, ContentService,
 * LockService, PropertiesService) pour tester l'intégralité du cycle de vie des
 * requêtes POST : sécurité, actions métier, anti-doublon et persistance.
 */
const fs = require('fs'), vm = require('vm');

function createGasMock() {
  const scriptProperties = {
    PE_SHARED_SECRET: 'mon-secret-test-123'
  };
  const userProperties = {};

  let cacheInvalidated = false;

  // Représentation de la feuille en mémoire (lignes x colonnes, 1-based)
  // Ligne 1 = En-têtes
  const columns = [
    "ID", "Date d'ajout", "URL du Thread", "Produit", "Titre", "Question",
    "Auteur", "Statut", "Résumé / Action (Gemini)", "Date de relance",
    "Notes", "Réponse publiée"
  ];
  let sheetRows = [
    [], // Index 0 inutilisé
    [null, ...columns] // Index 1 = En-têtes (cellule 1, 1 non vide)
  ];

  function getCell(r, c) {
    if (!sheetRows[r]) return '';
    return sheetRows[r][c] !== undefined ? sheetRows[r][c] : '';
  }

  function setCell(r, c, val) {
    while (sheetRows.length <= r) {
      sheetRows.push(new Array(columns.length + 1).fill(''));
    }
    sheetRows[r][c] = val;
  }

  const mockSheet = {
    getLastRow() {
      return sheetRows.length - 1;
    },
    getLastColumn() {
      return columns.length;
    },
    appendRow(rowArr) {
      sheetRows.push([null, ...rowArr]);
    },
    getRange(row, col, numRows = 1, numCols = 1) {
      return {
        getValue() {
          return getCell(row, col);
        },
        setValue(val) {
          setCell(row, col, val);
          return this;
        },
        setRichTextValue(rt) {
          const val = (rt && typeof rt.getText === 'function') ? rt.getText() : (rt && rt.text ? rt.text : String(rt || ''));
          setCell(row, col, val);
          return this;
        },
        getValues() {
          const result = [];
          for (let r = 0; r < numRows; r++) {
            const rowData = [];
            for (let c = 0; c < numCols; c++) {
              rowData.push(getCell(row + r, col + c));
            }
            result.push(rowData);
          }
          return result;
        },
        setValues(vals) {
          for (let r = 0; r < vals.length; r++) {
            for (let c = 0; c < vals[r].length; c++) {
              setCell(row + r, col + c, vals[r][c]);
            }
          }
          return this;
        },
        setFontWeight() { return this; },
        setBackground() { return this; }
      };
    }
  };

  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput(text) {
        return {
          text,
          mimeType: null,
          setMimeType(m) { this.mimeType = m; return this; },
          getContent() { return this.text; },
          getJSON() { return JSON.parse(this.text); }
        };
      }
    },
    LockService: {
      getScriptLock() {
        return {
          tryLock() { return true; },
          releaseLock() {}
        };
      }
    },
    PropertiesService: {
      getScriptProperties() {
        return {
          getProperty(k) { return scriptProperties[k] || null; },
          setProperty(k, v) { scriptProperties[k] = v; }
        };
      },
      getUserProperties() {
        return {
          getProperty(k) { return userProperties[k] || null; },
          setProperty(k, v) { userProperties[k] = v; }
        };
      }
    },
    SpreadsheetApp: {
      getActiveSpreadsheet() {
        return {
          getSheetByName(name) { return mockSheet; },
          insertSheet(name) { return mockSheet; }
        };
      },
      newTextStyle() {
        return {
          setBold() { return this; },
          build() { return {}; }
        };
      },
      newRichTextValue() {
        let txt = '';
        return {
          setText(t) { txt = t; return this; },
          setTextStyle() { return this; },
          setLinkUrl() { return this; },
          build() { return { text: txt, getText() { return txt; } }; }
        };
      }
    },
    Utilities: {
      getUuid() { return 'uuid-12345678-abcd'; }
    },
    setupSheet() {}
  };

  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync('gas/Config.gs', 'utf8'), sandbox);
  vm.runInContext(fs.readFileSync('gas/Gemini.gs', 'utf8'), sandbox);
  vm.runInContext(fs.readFileSync('gas/Api.gs', 'utf8'), sandbox);

  // Mocks applicatifs après chargement
  sandbox.generateReply = function(content, author, product, apiKey) {
    return {
      ok: true,
      status: 'REPONSE',
      confidence: 'HAUTE',
      lang: 'fr',
      text: 'Proposition pour ' + author + ' sur ' + product
    };
  };

  sandbox.generateFollowUp = function(ctx) {
    return {
      ok: true,
      suite: ctx.followUp.includes('résolu') ? 'RESOLU' : 'REPONSE',
      confidence: 'MOYENNE',
      text: 'Réponse relance à ' + ctx.author,
      overlap: 0.1
    };
  };

  sandbox.invalidateStyleExamplesCache_ = function() {
    cacheInvalidated = true;
  };

  const CONFIG = vm.runInContext('CONFIG', sandbox);

  return {
    sandbox,
    CONFIG,
    mockSheet,
    sheetRows,
    scriptProperties,
    wasCacheInvalidated() { return cacheInvalidated; },
    resetCacheInvalidated() { cacheInvalidated = false; }
  };
}

let fails = 0;
const check = (n, a, p) => {
  const ok = p(a);
  if (!ok) fails++;
  console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n);
  if (!ok) console.log('        obtenu : ' + (a !== undefined ? JSON.stringify(a).slice(0, 300) : 'undefined'));
};

const SECRET = 'mon-secret-test-123';
const THREAD_URL = 'https://support.google.com/mail/thread/123456';

console.log('\n1. Validation JSON et Autorisation');
{
  const env = createGasMock();
  const doPost = env.sandbox.doPost;

  // JSON invalide
  const resBadJson = doPost({ postData: { contents: '{ invalid-json' } }).getJSON();
  check('JSON invalide rejeté', resBadJson.status, v => v === 'error');
  check('backendVersion présent sur erreur JSON', resBadJson.backendVersion, v => !!v);

  // Absence de secret
  const resNoSecret = doPost({ postData: { contents: JSON.stringify({ action: 'registerOnly' }) } }).getJSON();
  check('requête sans secret refusée', resNoSecret.code, v => v === 'unauthorized');

  // Mauvais secret
  const resWrongSecret = doPost({ postData: { contents: JSON.stringify({ secret: 'faux-secret' }) } }).getJSON();
  check('secret erroné refusé', resWrongSecret.code, v => v === 'unauthorized');

  // Aucun secret côté serveur
  env.scriptProperties.PE_SHARED_SECRET = '';
  const resNoServerSecret = doPost({ postData: { contents: JSON.stringify({ secret: SECRET }) } }).getJSON();
  check('aucun secret configuré côté serveur -> refusé', resNoServerSecret.code, v => v === 'unauthorized');
}

console.log('\n2. Action standard : Ajout d\'un nouveau thread');
{
  const env = createGasMock();
  const doPost = env.sandbox.doPost;

  const payload = {
    secret: SECRET,
    title: 'Problème de connexion Gmail',
    url: THREAD_URL,
    author: 'Alice',
    product: 'Gmail',
    content: 'Bonjour, je ne parviens plus à me connecter à mon compte.'
  };

  const res = doPost({ postData: { contents: JSON.stringify(payload) } }).getJSON();
  check('création d\'une nouvelle ligne réussie', res.status, v => v === 'success');
  check('identifiant 8 caractères généré', res.id, v => v === 'uuid-123');
  check('résumé généré présent', res.summary, s => s.includes('Proposition pour Alice'));
  check('ligne ajoutée dans la feuille', env.mockSheet.getLastRow(), r => r === 2);

  // Vérifier les valeurs enregistrées dans la feuille
  const rowVals = env.mockSheet.getRange(2, 1, 1, 12).getValues()[0];
  check('colonne URL correcte', rowVals[env.CONFIG.COL.URL - 1], u => u === THREAD_URL);
  check('colonne Statut initial "Nouvelle"', rowVals[env.CONFIG.COL.STATUS - 1], s => s === 'Nouvelle');
  check('colonne Notes enrichie', rowVals[env.CONFIG.COL.NOTES - 1], n => n.includes('Ajouté via extension'));

  // Détection de doublon si le même thread est renvoyé
  const resDup = doPost({ postData: { contents: JSON.stringify(payload) } }).getJSON();
  check('thread existant détecté en doublon', resDup.duplicate, v => v === true);
  check('aucune nouvelle ligne créée pour le doublon', env.mockSheet.getLastRow(), r => r === 2);
  const noteApresRelance = env.mockSheet.getRange(2, env.CONFIG.COL.NOTES).getValue();
  check('note mise à jour pour mentionner la ré-analyse', noteApresRelance, n => n.includes('Analyse relancée'));
}

console.log('\n3. Action recordPublished : Enregistrement d\'une réponse publiée');
{
  const env = createGasMock();
  const doPost = env.sandbox.doPost;

  // Initialiser un thread avec un résumé proposé
  const urlPub = 'https://support.google.com/mail/thread/789';
  doPost({
    postData: {
      contents: JSON.stringify({
        secret: SECRET,
        title: 'Question',
        url: urlPub,
        author: 'Bob',
        product: 'Gmail',
        content: 'Question de Bob'
      })
    }
  });

  const proposedSummary = env.mockSheet.getRange(2, env.CONFIG.COL.SUMMARY).getValue();

  // Test 1: Données manquantes
  const resMissing = doPost({
    postData: { contents: JSON.stringify({ secret: SECRET, action: 'recordPublished', url: '' }) }
  }).getJSON();
  check('rejet si URL manquante', resMissing.status, v => v === 'error');

  // Test 2: Thread introuvable
  const resNotFound = doPost({
    postData: { contents: JSON.stringify({ secret: SECRET, action: 'recordPublished', url: 'https://support.google.com/unknown', publishedText: 'ok' }) }
  }).getJSON();
  check('rejet si thread introuvable', resNotFound.status, v => v === 'error');

  // Test 3: Réponse reprise telle quelle (identique ou taux < 0.05)
  env.resetCacheInvalidated();
  const resIdentique = doPost({
    postData: { contents: JSON.stringify({ secret: SECRET, action: 'recordPublished', url: urlPub, publishedText: proposedSummary }) }
  }).getJSON();
  check('réponse identique -> modified: false', resIdentique.modified, v => v === false);
  check('colonne Réponse publiée reste vide', env.mockSheet.getRange(2, env.CONFIG.COL.PUBLISHED).getValue(), v => v === '');
  check('note annotée "publiée sans modification"', env.mockSheet.getRange(2, env.CONFIG.COL.NOTES).getValue(), n => n.includes('publiée sans modification'));
  check('cache de style NON invalidé', env.wasCacheInvalidated(), v => v === false);

  // Test 4: Réponse retouchée par le PE
  const texteRetouche = 'Bonjour Bob, voici ma propre solution détaillée entièrement personnalisée pour votre problème.';
  env.resetCacheInvalidated();
  const resRetouche = doPost({
    postData: { contents: JSON.stringify({ secret: SECRET, action: 'recordPublished', url: urlPub, publishedText: texteRetouche }) }
  }).getJSON();
  check('réponse retouchée -> modified: true', resRetouche.modified, v => v === true);
  check('colonne Réponse publiée remplie', env.mockSheet.getRange(2, env.CONFIG.COL.PUBLISHED).getValue(), v => v === texteRetouche);
  check('note annotée "publiée après retouche"', env.mockSheet.getRange(2, env.CONFIG.COL.NOTES).getValue(), n => n.includes('publiée après retouche'));
  check('cache de style invalidé pour réapprentissage', env.wasCacheInvalidated(), v => v === true);
}

console.log('\n4. Action registerOnly : Inscription sans génération');
{
  const env = createGasMock();
  const doPost = env.sandbox.doPost;

  const urlReg = 'https://support.google.com/drive/thread/456';
  const payload = {
    secret: SECRET,
    action: 'registerOnly',
    url: urlReg,
    title: 'Fil Drive déjà répondu',
    author: 'Claire',
    product: 'Google Drive',
    content: 'Question traitée hors outil'
  };

  const res1 = doPost({ postData: { contents: JSON.stringify(payload) } }).getJSON();
  check('inscription sans génération réussie', res1.created, v => v === true);
  check('statut initial "En attente (User)"', env.mockSheet.getRange(2, env.CONFIG.COL.STATUS).getValue(), s => s === 'En attente (User)');
  check('note explicite sur la relance', env.mockSheet.getRange(2, env.CONFIG.COL.NOTES).getValue(), n => n.includes('Enregistré lors d\'une relance'));

  // Inscription dupliquée du même thread
  const res2 = doPost({ postData: { contents: JSON.stringify(payload) } }).getJSON();
  check('dédoublonnage sur registerOnly (created: false)', res2.created, v => v === false);
  check('aucun doublon créé dans la feuille', env.mockSheet.getLastRow(), r => r === 2);
}

console.log('\n5. Action followUp : Traitement des relances');
{
  const env = createGasMock();
  const doPost = env.sandbox.doPost;

  const urlFollow = 'https://support.google.com/photos/thread/999';

  // Pré-enregistrer le fil dans la feuille avec une réponse publiée
  env.mockSheet.appendRow([
    'uuid-999',
    new Date(),
    urlFollow,
    'Google Photos',
    'Sauvegarde bloquée',
    'Mes photos ne se synchronisent plus.',
    'David',
    'En attente (User)',
    'Proposition initiale',
    '',
    'Notes',
    'Première réponse publiée par Fabrice'
  ]);
  const rowIdx = env.mockSheet.getLastRow();

  // Test 1: Données manquantes
  const resBad = doPost({
    postData: { contents: JSON.stringify({ secret: SECRET, action: 'followUp', url: '' }) }
  }).getJSON();
  check('rejet si URL de relance manquante', resBad.status, v => v === 'error');

  // Test 2: Thread non suivi
  const resUntracked = doPost({
    postData: { contents: JSON.stringify({ secret: SECRET, action: 'followUp', url: 'https://support.google.com/untracked', followUpText: 'Merci mais ça ne marche pas' }) }
  }).getJSON();
  check('thread non suivi -> code: untracked', resUntracked.code, v => v === 'untracked');

  // Test 3: Relance normale
  const resFollow = doPost({
    postData: {
      contents: JSON.stringify({
        secret: SECRET,
        action: 'followUp',
        url: urlFollow,
        followUpText: 'J\'ai réinstallé l\'app mais toujours pareil.'
      })
    }
  }).getJSON();

  check('relance traitée avec succès', resFollow.status, v => v === 'success');
  check('provenance de la réponse précédente = feuille', resFollow.previousAnswerSource, s => s === 'feuille');
  check('résumé mis à jour avec la relance', env.mockSheet.getRange(rowIdx, env.CONFIG.COL.SUMMARY).getValue(), s => s.includes('Réponse relance à David'));
  check('date de relance renseignée', !!env.mockSheet.getRange(rowIdx, env.CONFIG.COL.FOLLOWUP).getValue(), v => v === true);

  // Test 4: Relance menant à la résolution
  const resResolu = doPost({
    postData: {
      contents: JSON.stringify({
        secret: SECRET,
        action: 'followUp',
        url: urlFollow,
        followUpText: 'Merci beaucoup c\'est résolu !'
      })
    }
  }).getJSON();
  check('statut "Résolue" appliqué si résolu', env.mockSheet.getRange(rowIdx, env.CONFIG.COL.STATUS).getValue(), s => s === 'Résolue');
}

console.log('\n6. Migration de structure : ensureColumns_');
{
  const env = createGasMock();
  const ensureColumns_ = env.sandbox.ensureColumns_;

  // Simuler une ancienne feuille qui n'avait que 10 colonnes
  const shortSheet = {
    getLastColumn() { return 10; },
    getRange(row, col, numRows, numCols) {
      return {
        setValues(vals) {
          check('2 colonnes manquantes injectées', vals[0].length, n => n === 2);
          check('colonne Réponse publiée ajoutée', vals[0], arr => arr.includes('Réponse publiée'));
          return this;
        },
        setFontWeight() { return this; },
        setBackground() { return this; }
      };
    }
  };

  ensureColumns_(shortSheet);
}

console.log('\n' + (fails === 0 ? 'Tous les tests passent.' : fails + ' test(s) en échec.'));
process.exit(fails ? 1 : 0);
