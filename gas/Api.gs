/**
 * @fileoverview Réception des requêtes externes (Webhook doPost)
 */

/**
 * Construit une réponse JSON normalisée.
 * @param {Object} obj Le contenu à sérialiser
 * @returns {GoogleAppsScript.Content.TextOutput}
 */
function jsonOutput_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Point d'entrée pour les requêtes POST provenant de l'extension Chrome et du bookmarklet.
 *
 * La WebApp étant déployée en accès « N'importe qui », chaque requête doit présenter le
 * secret partagé configuré dans le panneau de contrôle. Sans cette barrière, un tiers
 * connaissant l'URL /exec pourrait consommer le quota Gemini et écrire dans la feuille.
 *
 * @param {Object} e Objet d'événement contenant les données POST
 */
function doPost(e) {
  try {
    let data;
    try {
      data = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      return jsonOutput_({ status: "error", message: "Charge utile JSON invalide." });
    }

    // 1. Autorisation — avant tout appel à Gemini, pour ne pas consommer de quota inutilement
    try {
      assertAuthorized_(data.secret);
    } catch (authErr) {
      console.warn("Requête doPost refusée : " + authErr.message);
      return jsonOutput_({ status: "error", code: "unauthorized", message: authErr.message });
    }

    // 2. Enregistrement d'une réponse publiée : pas de génération, simple écriture
    if (data.action === 'recordPublished') {
      return recordPublishedReply_(data.url, data.publishedText);
    }

    const title = data.title || "Titre inconnu";
    const url = data.url || "";
    const author = data.author || "Auteur inconnu";
    const product = data.product || "Inconnu";
    const content = data.content || "";

    // La clé transmise ne sert qu'à la requête en cours : elle n'est jamais persistée côté
    // serveur, sinon un appelant pourrait écraser la clé API du propriétaire de la feuille.
    const providedApiKey = (data.apiKey || "").trim();

    // 2. Générer la proposition de réponse
    let reply = { ok: false, status: "", confidence: "", lang: "", text: "" };
    if (content) {
      reply = generateReply(content, author, product, providedApiKey);
    }
    const summary = reply.text || "";

    // 3. Écrire dans la feuille sous verrou (évite l'écrasement de ligne si deux requêtes se croisent)
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(15000)) {
      console.warn("Verrou script indisponible : écriture abandonnée pour éviter toute corruption de ligne.");
      return jsonOutput_({
        status: "error",
        code: "busy",
        message: "Le serveur traite déjà une autre demande. Réessayez dans quelques secondes.",
        summary: summary,
        replyStatus: reply.status,
        confidence: reply.confidence
      });
    }

    const newId = Utilities.getUuid().substring(0, 8);

    try {
      const sheet = getTrackingSheet_();

      sheet.appendRow([
        newId,
        new Date(),
        url,
        product,
        title,
        content,
        author,
        CONFIG.STATUSES[0], // "Nouvelle"
        "", // Le résumé est injecté en RichText juste après
        "",
        buildNote_("Ajouté via extension", reply),
        "" // Réponse publiée, renseignée après coup par l'extension
      ]);

      // Injecter le résumé avec le formatage riche (Gras, puces)
      const row = sheet.getLastRow();
      if (summary) {
        sheet.getRange(row, CONFIG.COL.SUMMARY).setRichTextValue(formatMarkdownToRichText(summary));
      }
    } finally {
      lock.releaseLock();
    }

    return jsonOutput_({
      status: "success",
      message: "Thread ajouté avec succès",
      id: newId,
      summary: summary,
      replyStatus: reply.status,
      confidence: reply.confidence,
      lang: reply.lang
    });

  } catch (error) {
    console.error("Erreur critique dans doPost :", error);
    return jsonOutput_({ status: "error", message: error.toString() });
  }
}

/**
 * Récupère la feuille de suivi en garantissant la présence des en-têtes et des validations.
 * @returns {GoogleAppsScript.Spreadsheet.Sheet} La feuille prête à l'emploi
 */
function getTrackingSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(CONFIG.SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEET_NAME);
    setupSheet(sheet, true);
    return sheet;
  }

  // Une feuille dont la première cellule est vide n'a jamais reçu ses en-têtes
  if (!sheet.getRange(1, 1).getValue()) {
    setupSheet(sheet, true);
  }

  ensureColumns_(sheet);
  return sheet;
}

/**
 * Ajoute les colonnes manquantes sur une feuille créée par une version antérieure.
 * `setupSheet` ne pose ses en-têtes que sur une feuille vierge : sans cette migration,
 * une feuille existante n'aurait jamais reçu la colonne « Réponse publiée ».
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet La feuille à mettre à niveau
 */
function ensureColumns_(sheet) {
  const lastColumn = sheet.getLastColumn();
  if (lastColumn >= CONFIG.COLUMNS.length) return;

  const missing = CONFIG.COLUMNS.slice(lastColumn);
  sheet.getRange(1, lastColumn + 1, 1, missing.length)
    .setValues([missing])
    .setFontWeight("bold")
    .setBackground("#e0e0e0");

  console.log("Colonnes ajoutées à la feuille de suivi : " + missing.join(', '));
}

/**
 * Enregistre le texte réellement publié par le Product Expert sur le forum.
 *
 * C'est la brique centrale de la boucle de retour : l'écart entre la proposition de
 * Gemini et le message finalement publié décrit le style et le jugement du PE bien
 * mieux que n'importe quelle consigne. Ces réponses alimentent ensuite le prompt
 * comme exemples (voir getStyleExamples_), et l'outil s'aligne au fil des usages.
 *
 * @param {string} threadUrl L'URL du thread concerné
 * @param {string} publishedText Le texte final effectivement publié
 * @returns {GoogleAppsScript.Content.TextOutput}
 */
function recordPublishedReply_(threadUrl, publishedText) {
  const url = String(threadUrl || '').trim();
  const text = String(publishedText || '').trim();

  if (!url || !text) {
    return jsonOutput_({ status: "error", message: "URL du thread ou texte publié manquant." });
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) {
    return jsonOutput_({ status: "error", code: "busy", message: "Serveur occupé, réessayez." });
  }

  try {
    const sheet = getTrackingSheet_();
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      return jsonOutput_({ status: "error", message: "Aucune ligne de suivi." });
    }

    // Rechercher la ligne du thread en partant de la fin (le thread courant est récent)
    const urls = sheet.getRange(2, CONFIG.COL.URL, lastRow - 1, 1).getValues();
    let targetRow = -1;
    for (let i = urls.length - 1; i >= 0; i--) {
      if (String(urls[i][0] || '').trim() === url) {
        targetRow = i + 2;
        break;
      }
    }

    if (targetRow === -1) {
      return jsonOutput_({ status: "error", message: "Thread introuvable dans la feuille de suivi." });
    }

    sheet.getRange(targetRow, CONFIG.COL.STATUS).setValue("En attente (User)");

    // Comparer au texte proposé : une réponse publiée telle quelle n'apprend rien
    // au modèle sur le style du PE, et la réinjecter lui ferait apprendre sa propre
    // production — ses tics d'écriture se renforceraient à chaque génération.
    const proposed = sheet.getRange(targetRow, CONFIG.COL.SUMMARY).getValue();
    const editRatio = tauxDeModification_(proposed, text);
    const modified = editRatio >= CONFIG.MIN_EDIT_RATIO;
    const percent = Math.round(editRatio * 100);

    const baseNote = String(sheet.getRange(targetRow, CONFIG.COL.NOTES).getValue() || '')
      .replace(/ • (publiée sans modification|publiée après retouche[^•]*)/g, '');

    if (!modified) {
      // Rien n'est stocké : le texte est déjà en colonne « Résumé / Action (Gemini) »
      sheet.getRange(targetRow, CONFIG.COL.NOTES).setValue(baseNote + " • publiée sans modification");
      return jsonOutput_({
        status: "success",
        message: "Publication enregistrée : proposition reprise telle quelle, rien à apprendre.",
        row: targetRow,
        modified: false,
        editRatio: percent
      });
    }

    sheet.getRange(targetRow, CONFIG.COL.PUBLISHED).setValue(text);
    sheet.getRange(targetRow, CONFIG.COL.NOTES).setValue(baseNote + " • publiée après retouche (" + percent + " % réécrit)");

    // Le corpus de style vient de changer : forcer sa reconstruction au prochain appel
    invalidateStyleExamplesCache_();

    return jsonOutput_({
      status: "success",
      message: "Réponse retouchée enregistrée : elle servira d'exemple de style.",
      row: targetRow,
      modified: true,
      editRatio: percent
    });
  } finally {
    lock.releaseLock();
  }
}

/**
 * Compose la note de suivi en y intégrant le niveau de fiabilité de la réponse générée.
 * C'est ce qui permet de repérer d'un coup d'œil, dans la feuille, les propositions
 * à reprendre entièrement à la main avant publication.
 *
 * @param {string} origin Provenance de la ligne (extension, WebApp mobile...)
 * @param {Object} reply L'objet renvoyé par generateReply
 * @returns {string} La note à inscrire en colonne Notes
 */
function buildNote_(origin, reply) {
  if (!reply || !reply.status) return origin;

  const labels = {
    REPONSE: "réponse proposée",
    CLARIFICATION: "⚠️ à clarifier — informations insuffisantes",
    HORS_SUJET: "⚠️ hors sujet",
    ERREUR: "❌ échec de génération"
  };

  const parts = [origin, labels[reply.status] || reply.status];
  if (reply.confidence && reply.status === 'REPONSE') {
    parts.push("confiance " + reply.confidence.toLowerCase());
  }

  return parts.join(" • ");
}

/**
 * Point d'entrée pour la WebApp Mobile (iPhone/iPad/Navigateurs)
 * Servie automatiquement lorsqu'un utilisateur ouvre l'URL WebApp dans son navigateur mobile
 */
function doGet(e) {
  if (e && e.parameter && e.parameter.api === 'json') {
    return jsonOutput_({
      status: "success",
      message: "L'API Community Console PE Tracker est fonctionnelle."
    });
  }

  const template = HtmlService.createTemplateFromFile('MobileUi');
  return template.evaluate()
    .setTitle('Suivi PE - Community Console Mobile')
    .setFaviconUrl('https://www.gstatic.com/images/branding/product/1x/sheets_48dp.png')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
