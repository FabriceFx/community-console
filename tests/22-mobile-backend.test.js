/**
 * Tests unitaires du backend mobile (gas/MobileBackend.gs).
 *
 * Vérifie le traitement des requêtes provenant de la WebApp Mobile :
 * - Sécurité (secret, validation URL, protection anti-SSRF sur l'hôte).
 * - Extraction heuristique côté serveur (titre, produit, contenu, auteur).
 * - Enregistrement de la question et de la proposition dans Google Sheets.
 */
const fs = require('fs'), vm = require('vm');

function createMobileEnv(customHtml = '') {
  let currentHtml = customHtml;
  const scriptProperties = {
    PE_SHARED_SECRET: 'secret-mobile-456'
  };

  const columns = [
    "ID", "Date d'ajout", "URL du Thread", "Produit", "Titre", "Question",
    "Auteur", "Statut", "Résumé / Action (Gemini)", "Date de relance",
    "Notes", "Réponse publiée"
  ];
  const sheetRows = [
    [],
    [null, ...columns]
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
    getLastRow() { return sheetRows.length - 1; },
    getLastColumn() { return columns.length; },
    appendRow(arr) { sheetRows.push([null, ...arr]); },
    getRange(row, col, numRows = 1, numCols = 1) {
      return {
        getValue() { return getCell(row, col); },
        setValue(val) { setCell(row, col, val); return this; },
        setRichTextValue(rt) {
          const val = (rt && typeof rt.getText === 'function') ? rt.getText() : (rt && rt.text ? rt.text : String(rt || ''));
          setCell(row, col, val);
          return this;
        },
        getValues() {
          const res = [];
          for (let r = 0; r < numRows; r++) {
            const rowData = [];
            for (let c = 0; c < numCols; c++) rowData.push(getCell(row + r, col + c));
            res.push(rowData);
          }
          return res;
        },
        setValues(vals) {
          for (let r = 0; r < vals.length; r++) {
            for (let c = 0; c < vals[r].length; c++) setCell(row + r, col + c, vals[r][c]);
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
    PropertiesService: {
      getScriptProperties() {
        return {
          getProperty(k) { return scriptProperties[k] || null; },
          setProperty(k, v) { scriptProperties[k] = v; }
        };
      },
      getUserProperties() {
        return {
          getProperty() { return null; },
          setProperty() {}
        };
      }
    },
    UrlFetchApp: {
      fetch(url, options) {
        return {
          getContentText() { return currentHtml; },
          getResponseCode() { return 200; }
        };
      }
    },
    SpreadsheetApp: {
      getActiveSpreadsheet() {
        return {
          getSheetByName() { return mockSheet; },
          insertSheet() { return mockSheet; }
        };
      },
      newTextStyle() {
        return { setBold() { return this; }, build() { return {}; } };
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
    LockService: {
      getScriptLock() {
        return {
          tryLock() { return true; },
          releaseLock() {}
        };
      }
    },
    Utilities: {
      getUuid() { return 'mobile-uuid-789'; }
    },
    setupSheet() {}
  };

  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync('gas/Config.gs', 'utf8'), sandbox);
  vm.runInContext(fs.readFileSync('gas/Gemini.gs', 'utf8'), sandbox);
  vm.runInContext(fs.readFileSync('gas/Api.gs', 'utf8'), sandbox);
  vm.runInContext(fs.readFileSync('gas/MobileBackend.gs', 'utf8'), sandbox);

  sandbox.generateReply = function(content, author, product) {
    return {
      ok: true,
      status: 'REPONSE',
      confidence: 'HAUTE',
      lang: 'fr',
      text: `Proposition Mobile pour ${author} (${product})`
    };
  };

  const CONFIG = vm.runInContext('CONFIG', sandbox);

  return {
    sandbox,
    CONFIG,
    mockSheet,
    sheetRows,
    scriptProperties,
    setHtml(html) { currentHtml = html; },
    processMobileThreadUrl: sandbox.processMobileThreadUrl
  };
}

let fails = 0;
const check = (n, a, p) => {
  const ok = p(a);
  if (!ok) fails++;
  console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n);
  if (!ok) console.log('        obtenu : ' + (a !== undefined ? JSON.stringify(a).slice(0, 300) : 'undefined'));
};

const SECRET = 'secret-mobile-456';
const BASE_THREAD = 'https://support.google.com/mail/thread/555666';

console.log('\n1. Sécurité et Autorisation');
{
  const env = createMobileEnv();
  const run = env.processMobileThreadUrl;

  // Secret manquant
  let errSecret = null;
  try { run(BASE_THREAD, '', '', ''); } catch (e) { errSecret = e.message; }
  check('secret manquant -> rejeté', errSecret, m => m && m.includes('Accès refusé'));

  // Mauvais secret
  let errBadSecret = null;
  try { run(BASE_THREAD, '', '', 'mauvais-secret'); } catch (e) { errBadSecret = e.message; }
  check('secret erroné -> rejeté', errBadSecret, m => m && m.includes('Accès refusé'));

  // URL invalide
  let errUrl = null;
  try { run('', '', '', SECRET); } catch (e) { errUrl = e.message; }
  check('URL vide -> rejetée', errUrl, m => m && m.includes('invalide'));

  // Protection anti-SSRF : Domaine non autorisé
  let errSsrf = null;
  try { run('https://malicious-site.com/exploit', '', '', SECRET); } catch (e) { errSsrf = e.message; }
  check('domaine non autorisé -> rejeté (anti-SSRF)', errSsrf, m => m && m.includes('Domaine non autorisé'));

  // Hôte légitime avec sous-domaine
  let okHost = false;
  env.setHtml('<title>Test - Communauté Google</title>');
  try {
    const res = run('https://support.google.com/accounts/thread/111', '', '', SECRET);
    okHost = res.status === 'success';
  } catch (e) { okHost = false; }
  check('support.google.com accepté', okHost, v => v === true);
}

console.log('\n2. Détection du Produit par URL');
{
  const env = createMobileEnv();
  env.setHtml('<title>Titre de test - Communauté Google</title><meta name="description" content="Contenu suffisamment long pour passer">');
  const run = env.processMobileThreadUrl;

  const urlProducts = [
    ['https://support.google.com/mail/thread/1', 'Gmail'],
    ['https://support.google.com/accounts/thread/2', 'Compte Google'],
    ['https://support.google.com/drive/thread/3', 'Google Drive'],
    ['https://support.google.com/photos/thread/4', 'Google Photos'],
    ['https://support.google.com/maps/thread/5', 'Google Maps'],
    ['https://support.google.com/chrome/thread/6', 'Google Chrome'],
    ['https://support.google.com/android/thread/7', 'Android'],
    ['https://support.google.com/youtube/thread/8', 'YouTube'],
    ['https://support.google.com/docs/thread/9', 'Google Docs'],
    ['https://support.google.com/other/thread/10', 'Google']
  ];

  for (const [url, expectedProduct] of urlProducts) {
    const res = run(url, '', '', SECRET);
    check(`URL ${expectedProduct} détectée`, res.product, p => p === expectedProduct);
  }
}

console.log('\n3. Extraction du Titre et Nettoyage');
{
  const env = createMobileEnv();
  const run = env.processMobileThreadUrl;

  // A. Nettoyage du suffixe "- Communauté Google"
  env.setHtml('<html><head><title>Problème de synchronisation - Communauté Google</title><meta name="description" content="Description détaillée"></head></html>');
  const res1 = run('https://support.google.com/photos/thread/1', '', '', SECRET);
  check('titre nettoyé du suffixe Google', res1.title, t => t === 'Problème de synchronisation');

  // B. Fallback sur og:title
  env.setHtml('<html><head><meta property="og:title" content="Impossible de supprimer un fichier - Communauté Google Drive"><meta name="description" content="Description détaillée"></head></html>');
  const res2 = run('https://support.google.com/drive/thread/2', '', '', SECRET);
  check('titre extrait depuis og:title', res2.title, t => t.startsWith('Impossible de supprimer'));
}

console.log('\n4. Priorités et Extraction du Contenu');
{
  const env = createMobileEnv();
  const run = env.processMobileThreadUrl;

  // A. Contenu fourni manuellement (priorité absolue)
  env.setHtml('<title>Titre</title><meta name="description" content="Description du meta tag">');
  const resManuel = run(BASE_THREAD, '', 'Texte fourni manuellement par le Product Expert', SECRET);
  check('contenu fourni manuellement prioritaire', env.mockSheet.getRange(env.mockSheet.getLastRow(), env.CONFIG.COL.QUESTION).getValue(), q => q === 'Texte fourni manuellement par le Product Expert');
  check('contentIsThin est false', resManuel.contentIsThin, v => v === false);

  // B. Contenu depuis meta description
  env.setHtml('<title>Titre</title><meta name="description" content="Voici la question complète issue de la meta description">');
  const resMeta = run(BASE_THREAD, '', '', SECRET);
  check('contenu extrait de meta description', env.mockSheet.getRange(env.mockSheet.getLastRow(), env.CONFIG.COL.QUESTION).getValue(), q => q.includes('Voici la question complète'));
  check('contentIsThin est false sur meta suffisante', resMeta.contentIsThin, v => v === false);

  // C. Contenu trop court / manquant -> repli sur le titre et flag contentIsThin
  env.setHtml('<title>Question trop courte</title><meta name="description" content="Court">');
  const resThin = run(BASE_THREAD, '', '', SECRET);
  check('repli sur le titre si contenu < 15 caractères', env.mockSheet.getRange(env.mockSheet.getLastRow(), env.CONFIG.COL.QUESTION).getValue(), q => q === 'Question trop courte');
  check('contentIsThin est true', resThin.contentIsThin, v => v === true);
}

console.log('\n5. Les 4 Stratégies d\'Extraction de l\'Auteur');
{
  const env = createMobileEnv();
  const run = env.processMobileThreadUrl;

  // Priorité 0: Auteur fourni manuellement
  env.setHtml('<title>Titre</title><meta name="description" content="Question de test assez longue">');
  const resManuel = run(BASE_THREAD, 'Sophie_Manuel', '', SECRET);
  check('auteur manuel prioritaire', resManuel.author, a => a === 'Sophie_Manuel');

  // Stratégie A: Payload avatar JSON googleusercontent.com
  env.setHtml('<title>Titre</title><meta name="description" content="Question de test assez longue"><div>"https://googleusercontent.com/avatar123", "Marc_Avatar"</div>');
  const resA = run(BASE_THREAD, '', '', SECRET);
  check('stratégie A (avatar JSON) reconnue', resA.author, a => a === 'Marc_Avatar');

  // Stratégie B: Lien profil communauté
  env.setHtml('<title>Titre</title><meta name="description" content="Question de test assez longue"><a href="/s/community/user/998877">Julie_Profile</a>');
  const resB = run(BASE_THREAD, '', '', SECRET);
  check('stratégie B (lien profil) reconnue', resB.author, a => a === 'Julie_Profile');

  // Stratégie C: data-stats-id ou classe user-name
  env.setHtml('<title>Titre</title><meta name="description" content="Question de test assez longue"><span data-stats-id="user-name">Thomas_Css</span>');
  const resC = run(BASE_THREAD, '', '', SECRET);
  check('stratégie C (data-stats-id user-name) reconnue', resC.author, a => a === 'Thomas_Css');

  // Stratégie D: og:title avec "par" ou "by"
  env.setHtml('<meta property="og:title" content="Problème Gmail par Nicolas_Og - Communauté"><meta name="description" content="Question de test assez longue">');
  const resD = run(BASE_THREAD, '', '', SECRET);
  check('stratégie D (og:title "par Auteur") reconnue', resD.author, a => a.includes('Nicolas_Og'));

  // Repli : Utilisateur inconnu
  env.setHtml('<title>Titre simple</title><meta name="description" content="Question de test assez longue">');
  const resInconnu = run(BASE_THREAD, '', '', SECRET);
  check('repli sur "Utilisateur inconnu" si aucun marqueur', resInconnu.author, a => a === 'Utilisateur inconnu');
}

console.log('\n6. Enregistrement dans Google Sheets et Résultat de sortie');
{
  const env = createMobileEnv();
  env.setHtml('<title>Mon écran clignote - Communauté Google</title><meta name="description" content="Depuis la mise à jour, mon écran clignote.">');

  const res = env.processMobileThreadUrl(
    'https://support.google.com/chrome/thread/123456',
    'Camille',
    'Depuis la mise à jour, mon écran clignote sans arrêt.',
    SECRET
  );

  check('statut success retourné', res.status, v => v === 'success');
  check('backendVersion présent', !!res.backendVersion, v => v === true);
  check('identifiant 8 caractères généré', res.id, id => id === 'mobile-u');
  check('proposition de réponse générée', res.summary, s => s.includes('Proposition Mobile pour Camille (Google Chrome)'));

  const lastRow = env.mockSheet.getLastRow();
  const rowVals = env.mockSheet.getRange(lastRow, 1, 1, 12).getValues()[0];
  check('ligne ajoutée dans la feuille', lastRow >= 2, v => v === true);
  check('URL enregistrée', rowVals[env.CONFIG.COL.URL - 1], u => u.includes('chrome/thread/123456'));
  check('produit enregistré', rowVals[env.CONFIG.COL.PRODUCT - 1], p => p === 'Google Chrome');
  check('auteur enregistré', rowVals[env.CONFIG.COL.AUTHOR - 1], a => a === 'Camille');
  check('statut enregistré "Nouvelle"', rowVals[env.CONFIG.COL.STATUS - 1], s => s === 'Nouvelle');
  check('note contient mention Mobile iPhone', rowVals[env.CONFIG.COL.NOTES - 1], n => n.includes('Ajouté via WebApp Mobile (iPhone)'));
}

console.log('\n' + (fails === 0 ? 'Tous les tests passent.' : fails + ' test(s) en échec.'));
process.exit(fails ? 1 : 0);
