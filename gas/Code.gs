/**
 * @fileoverview Logique principale d'initialisation et menu
 */

/**
 * S'exécute à l'ouverture du document.
 * Crée le menu personnalisé.
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('🛠️ Suivi PE')
    .addItem('Ouvrir le panneau de contrôle', 'showSidebar')
    .addItem('Lister les modèles Gemini disponibles', 'showAvailableModels')
    .addItem('Relancer l\'analyse Gemini (Ligne sél.)', 'relaunchGemini')
    .addSeparator()
    .addItem('Initialiser la feuille (Créer les colonnes)', 'setupSheet')
    .addItem('À propos', 'showAbout')
    .addToUi();
}

/**
 * Initialise la feuille de suivi avec les bonnes colonnes et validations
 */
function setupSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEET_NAME);
  }
  
  // Ajouter les en-têtes si vides
  const currentHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn() || 1).getValues()[0];
  if (currentHeaders[0] === "") {
    sheet.getRange(1, 1, 1, CONFIG.COLUMNS.length).setValues([CONFIG.COLUMNS]);
    sheet.getRange(1, 1, 1, CONFIG.COLUMNS.length).setFontWeight("bold").setBackground("#e0e0e0");
    sheet.setFrozenRows(1);
    
    // Formater la colonne ID en gras
    sheet.getRange("A:A").setFontWeight("bold");
    
    // Mettre en place la validation de données pour le statut
    const statusColIndex = CONFIG.COLUMNS.indexOf("Statut") + 1;
    if (statusColIndex > 0) {
      const rule = SpreadsheetApp.newDataValidation()
        .requireValueInList(CONFIG.STATUSES, true)
        .build();
      sheet.getRange(2, statusColIndex, 1000, 1).setDataValidation(rule);
    }
    
    // Ajuster la largeur des colonnes
    sheet.setColumnWidth(2, 120); // Date
    sheet.setColumnWidth(3, 300); // URL
    sheet.setColumnWidth(4, 120); // Produit
    sheet.setColumnWidth(5, 400); // Titre
    sheet.setColumnWidth(6, 400); // Question
    sheet.setColumnWidth(7, 150); // Auteur
    sheet.setColumnWidth(8, 150); // Statut
    sheet.setColumnWidth(9, 400); // Résumé
  }
  
  SpreadsheetApp.getUi().alert('✅ Initialisation terminée. La feuille est prête à recevoir les questions de l\'extension.');
}

/**
 * Relance l'analyse Gemini pour la ligne actuellement sélectionnée
 */
function relaunchGemini() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getActiveSheet();
  
  if (sheet.getName() !== CONFIG.SHEET_NAME) {
    SpreadsheetApp.getUi().alert('❌ Veuillez vous placer sur la feuille de suivi.');
    return;
  }

  const activeRange = sheet.getActiveRange();
  const row = activeRange.getRow();
  
  if (row <= 1) {
    SpreadsheetApp.getUi().alert('❌ Veuillez sélectionner une ligne de données (pas l\'en-tête).');
    return;
  }

  // Récupérer le titre (colonne 5) comme contexte pour l'analyse
  const title = sheet.getRange(row, 5).getValue();
  
  if (!title) {
    SpreadsheetApp.getUi().alert('❌ Le titre de la question est manquant sur cette ligne.');
    return;
  }

  const ui = SpreadsheetApp.getUi();
  const response = ui.alert('Analyse en cours', 'Gemini va relancer une recherche pour ce thread :\\n\\n"' + title + '"', ui.ButtonSet.OK_CANCEL);
  
  if (response === ui.Button.OK) {
    // On met un indicateur visuel (Le résumé est maintenant en colonne 9)
    const summaryCell = sheet.getRange(row, 9);
    summaryCell.setValue('⏳ Analyse Gemini en cours...');
    SpreadsheetApp.flush();
    
    // On relance la génération en passant la question ou le titre
    const product = sheet.getRange(row, 4).getValue() || "Inconnu";
    const questionText = sheet.getRange(row, 6).getValue();
    const author = sheet.getRange(row, 7).getValue() || "Auteur inconnu";
    const promptText = questionText ? "Question : " + questionText : "Titre : " + title;
    
    const newSummary = generateSummaryWithGemini(promptText, author, product);
    
    // Application du RichText pour gérer le Gras et les puces
    const richText = formatMarkdownToRichText(newSummary);
    summaryCell.setRichTextValue(richText);
  }
}

/**
 * Affiche la liste des modèles Gemini disponibles
 */
function showAvailableModels() {
  const ui = SpreadsheetApp.getUi();
  try {
    const models = listGeminiModels();
    if (models.length === 0) {
      ui.alert('Information', 'Aucun modèle compatible avec la génération de contenu n\'a été trouvé.', ui.ButtonSet.OK);
      return;
    }
    
    const html = `
      <div style="font-family: 'Outfit', 'Inter', sans-serif; padding: 10px;">
        <h3 style="color:#1a73e8; margin-top:0;">Modèles disponibles :</h3>
        <ul style="background:#f1f3f4; padding:15px 30px; border-radius:8px;">
          ${models.map(m => '<li style="margin-bottom:8px;"><code>' + m + '</code></li>').join('')}
        </ul>
        <p style="font-size:12px; color:#555;">Copiez l'un de ces noms et collez-le dans le Panneau de contrôle.</p>
      </div>
    `;
    
    const htmlOutput = HtmlService.createHtmlOutput(html)
      .setWidth(400)
      .setHeight(400);
      
    ui.showModalDialog(htmlOutput, 'Modèles Gemini (API)');
    
  } catch (error) {
    ui.alert('Erreur', error.message, ui.ButtonSet.OK);
  }
}

/**
 * Fonction de debug pour tester le RichText
 */
function testRichText() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getActiveSheet();
  const row = sheet.getActiveRange().getRow();
  if (row <= 1) return;
  
  const text = `Voici un test avec **du gras** et :
* Puce 1
* Puce 2
### Titre 3`;
  
  const richText = formatMarkdownToRichText(text);
  sheet.getRange(row, 9).setRichTextValue(richText);
}
