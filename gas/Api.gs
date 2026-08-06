/**
 * @fileoverview Réception des requêtes externes (Webhook doPost)
 */

/**
 * Point d'entrée pour les requêtes POST provenant de l'extension Chrome
 * @param {Object} e Objet d'événement contenant les données POST
 */
function doPost(e) {
  console.log("doPost appelé !", e);
  try {
    const data = JSON.parse(e.postData.contents);
    const title = data.title || "Titre inconnu";
    const url = data.url || "";
    const author = data.author || "Auteur inconnu";
    const product = data.product || "Inconnu";
    const content = data.content || "";
    
    const providedApiKey = (data.apiKey || "").trim();
    if (providedApiKey) {
      try {
        setGeminiApiKey(providedApiKey);
      } catch (keyErr) {
        console.warn("Impossible de sauvegarder la clé reçue via API dans les propriétés :", keyErr);
      }
    }
    
    // Analyser avec Gemini si disponible
    let summary = "";
    if (content) {
      summary = generateSummaryWithGemini(content, author, product, providedApiKey);
    }
    
    // Ajouter à la feuille
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
    if (!sheet) {
      sheet = ss.insertSheet(CONFIG.SHEET_NAME);
    }
    
    const newId = Utilities.getUuid().substring(0, 8);
    const date = new Date();
    
    sheet.appendRow([
      newId,
      date,
      url,
      product,
      title,
      content,
      author,
      CONFIG.STATUSES[0], // "Nouvelle"
      "", // Le résumé sera injecté en RichText juste après
      "",
      "Ajouté via extension"
    ]);
    
    // Injecter le résumé avec le formatage riche (Gras, puces)
    const row = sheet.getLastRow();
    if (summary) {
      const richText = formatMarkdownToRichText(summary);
      sheet.getRange(row, 9).setRichTextValue(richText);
    }
    
    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      message: "Thread ajouté avec succès",
      id: newId,
      summary: summary || ""
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    console.error("Erreur critique dans doPost :", error);
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Point d'entrée pour la WebApp Mobile (iPhone/iPad/Navigateurs)
 * Servit automatiquement lorsqu'un utilisateur ouvre l'URL WebApp dans son navigateur mobile
 */
function doGet(e) {
  if (e && e.parameter && e.parameter.api === 'json') {
    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      message: "L'API Community Console PE Tracker est fonctionnelle."
    })).setMimeType(ContentService.MimeType.JSON);
  }

  const template = HtmlService.createTemplateFromFile('MobileUi');
  return template.evaluate()
    .setTitle('Suivi PE - Community Console Mobile')
    .setFaviconUrl('https://www.gstatic.com/images/branding/product/1x/sheets_48dp.png')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
