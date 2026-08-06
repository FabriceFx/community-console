/**
 * @fileoverview Traitement côté serveur des requêtes soumises depuis la WebApp Mobile (iPhone/iPad)
 */

/**
 * Reçoit l'URL d'un thread soumise depuis l'interface mobile, extrait les informations côté serveur via UrlFetchApp,
 * génère la réponse Gemini, enregistre la ligne dans Google Sheets et retourne le résumé formaté au mobile.
 * 
 * @param {string} threadUrl L'URL complète du thread Google Community Console
 * @returns {Object} Objet contenant le statut, le titre, le produit et la réponse Gemini
 */
function processMobileThreadUrl(threadUrl) {
  console.log("processMobileThreadUrl appelé avec URL :", threadUrl);

  if (!threadUrl || typeof threadUrl !== 'string') {
    throw new Error("L'URL du thread fournie est invalide.");
  }

  let cleanUrl = threadUrl.trim();
  if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
    cleanUrl = 'https://' + cleanUrl;
  }

  let htmlText = "";
  try {
    const response = UrlFetchApp.fetch(cleanUrl, {
      muteHttpExceptions: true,
      followRedirects: true,
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
      }
    });
    htmlText = response.getContentText();
  } catch (err) {
    console.warn("Impossible d'extraire le HTML du thread :", err);
  }

  // 1. Extraire le titre du thread
  let title = "Thread Community Console";
  const titleMatch = htmlText.match(/<title[^>]*>([^<]+)<\/title>/i) || htmlText.match(/property="og:title"\s+content="([^"]+)"/i);
  if (titleMatch && titleMatch[1]) {
    title = titleMatch[1].replace(/\s*-\s*Communauté Google.*$/i, '').trim();
  }

  // 2. Extraire le nom du produit Google
  let product = "Google";
  if (cleanUrl.includes('/mail/')) product = "Gmail";
  else if (cleanUrl.includes('/accounts/')) product = "Compte Google";
  else if (cleanUrl.includes('/drive/')) product = "Google Drive";
  else if (cleanUrl.includes('/photos/')) product = "Google Photos";
  else if (cleanUrl.includes('/maps/')) product = "Google Maps";
  else if (cleanUrl.includes('/chrome/')) product = "Google Chrome";
  else if (cleanUrl.includes('/android/')) product = "Android";
  else if (cleanUrl.includes('/youtube/')) product = "YouTube";

  // 3. Extraire la description / contenu texte de la question
  let content = "";
  const metaDesc = htmlText.match(/name="description"\s+content="([^"]+)"/i) || htmlText.match(/property="og:description"\s+content="([^"]+)"/i);
  if (metaDesc && metaDesc[1]) {
    content = metaDesc[1].trim();
  }
  if (!content || content.length < 15) {
    content = title;
  }

  const author = "Utilisateur Mobile";

  // 4. Générer la réponse via l'IA Gemini
  const summary = generateSummaryWithGemini(content, author, product);

  // 5. Ajouter une nouvelle ligne dans la feuille Google Sheets
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
    cleanUrl,
    product,
    title,
    content,
    author,
    CONFIG.STATUSES[0], // "Nouvelle"
    "",
    "",
    "Ajouté via WebApp Mobile (iPhone)"
  ]);

  const row = sheet.getLastRow();
  if (summary) {
    const richText = formatMarkdownToRichText(summary);
    sheet.getRange(row, 9).setRichTextValue(richText);
  }

  return {
    status: "success",
    id: newId,
    title: title,
    product: product,
    summary: summary || ""
  };
}
