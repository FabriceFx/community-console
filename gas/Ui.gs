/**
 * @fileoverview Gestion de l'interface utilisateur (UI)
 */

/**
 * Affiche la barre latérale "Panneau de contrôle"
 */
function showSidebar() {
  const template = HtmlService.createTemplateFromFile('Sidebar');
  const htmlOutput = template.evaluate()
    .setTitle('Configuration PE')
    .setWidth(300);
  
  SpreadsheetApp.getUi().showSidebar(htmlOutput);
}

/**
 * Affiche la boîte de dialogue "À propos"
 */
function showAbout() {
  const html = `
    <div style="font-family: 'Outfit', 'Inter', sans-serif; padding: 20px; color: #333;">
      <h2 style="color: #1a73e8; margin-top:0;">Outil de suivi Community Console</h2>
      <p>Cet outil est conçu pour aider les <b>Product Experts</b> à suivre efficacement les questions sur les forums de Google.</p>
      <p>Il fonctionne en synergie avec une extension Chrome qui transmet les données de la page vers ce classeur Google Sheets, tout en utilisant l'IA Gemini pour résumer le problème.</p>
      <hr style="border: 0; border-top: 1px solid #ddd; margin: 20px 0;">
      <p style="font-size: 12px; color: #666;">
        Développé par : <strong>Fabrice Faucheux</strong><br>
        <a href="https://faucheux.bzh" target="_blank" style="color: #1a73e8; text-decoration: none;">https://faucheux.bzh</a>
      </p>
    </div>
  `;
  const htmlOutput = HtmlService.createHtmlOutput(html)
    .setWidth(400)
    .setHeight(250);
  SpreadsheetApp.getUi().showModalDialog(htmlOutput, 'À propos');
}

/**
 * Expose la méthode de sauvegarde pour le HTML (Côté Client -> Serveur)
 */
function saveSettings(settings) {
  if (settings.apiKey) {
    setGeminiApiKey(settings.apiKey);
  }
  if (settings.modelName) {
    setGeminiModelName(settings.modelName);
  }
  if (settings.sharedSecret !== undefined) {
    setSharedSecret(settings.sharedSecret);
  }
  if (settings.closingsFr !== undefined) {
    setCustomClosings('fr', settings.closingsFr);
  }
  if (settings.closingsEn !== undefined) {
    setCustomClosings('en', settings.closingsEn);
  }
  return true;
}

/**
 * Récupère la configuration courante (Côté Serveur -> Client)
 */
function getSettings() {
  return {
    apiKey: getGeminiApiKey(),
    modelName: getGeminiModelName(),
    sharedSecret: getSharedSecret(),
    closingsFr: (getCustomClosings('fr') || DEFAULT_CLOSINGS_FOR_UI('fr')).join('\n').replace(/^$/gm, '-'),
    closingsEn: (getCustomClosings('en') || DEFAULT_CLOSINGS_FOR_UI('en')).join('\n').replace(/^$/gm, '-')
  };
}

/**
 * Renvoie les formules de clôture livrées par défaut pour une langue,
 * afin de préremplir le panneau de contrôle.
 * @param {string} lang Code de langue
 * @returns {Array<string>} Les formules par défaut
 */
function DEFAULT_CLOSINGS_FOR_UI(lang) {
  const shell = REPLY_SHELLS[lang] || REPLY_SHELLS.fr;
  return shell.closings;
}

/**
 * Génère un secret partagé aléatoire à recopier dans l'extension et sur le mobile.
 * @returns {string} Le secret généré et déjà enregistré côté serveur
 */
function generateSharedSecret() {
  const secret = Utilities.getUuid().replace(/-/g, '');
  setSharedSecret(secret);
  return secret;
}
