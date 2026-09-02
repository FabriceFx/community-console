/**
 * @fileoverview Menu du classeur.
 *
 * Le classeur n'héberge plus de feuille de suivi : il ne sert qu'à porter le panneau
 * de réglages, dont la WebApp mobile a besoin côté serveur. D'où la disparition des
 * entrées « Initialiser la feuille » et « Relancer l'analyse (ligne sélectionnée) ».
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
    .addSeparator()
    .addItem('À propos', 'showAbout')
    .addToUi();
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

