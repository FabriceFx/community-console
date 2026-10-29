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
      <h2 style="color: #1a73e8; margin-top:0;">Assistant de réponse Community Console</h2>
      <p>Cet outil aide les <b>Product Experts</b> à rédiger une proposition de réponse aux fils de la Community Console, avec Gemini. La proposition est placée dans le champ de réponse, jamais publiée : la relecture reste la vôtre.</p>
      <p><b>Rien n'est conservé</b> : ni question, ni réponse, ni historique. Ce classeur ne porte que le panneau de réglages.</p>
      <p style="font-size: 12px; color: #666;">Version du backend : <b>${CONFIG.VERSION}</b> — l'extension Chrome doit afficher la même. Si ce n'est pas le cas, redéployez une <i>nouvelle version</i> de la WebApp.</p>
      <hr style="border: 0; border-top: 1px solid #ddd; margin: 20px 0;">
      <p style="font-size: 12px; color: #666;">
        Développé par : <strong>Fabrice Faucheux</strong><br>
        <a href="https://faucheux.bzh" target="_blank" style="color: #1a73e8; text-decoration: none;">https://faucheux.bzh</a>
      </p>
    </div>
  `;
  const htmlOutput = HtmlService.createHtmlOutput(html)
    .setWidth(400)
    .setHeight(330);
  SpreadsheetApp.getUi().showModalDialog(htmlOutput, 'À propos');
}

/**
 * Intitulés des langues gérées, pour l'affichage du panneau de contrôle.
 */
const LANG_LABELS = {
  fr: 'Français',
  en: 'Anglais',
  de: 'Allemand',
  es: 'Espagnol',
  it: 'Italien'
};

/**
 * Liste les langues réellement gérées par les coquilles de message.
 *
 * Dérivée de REPLY_SHELLS plutôt que recopiée : le panneau de contrôle suit
 * automatiquement toute langue ajoutée aux coquilles. Le panneau n'exposait que
 * le français et l'anglais alors que cinq langues étaient gérées : les trois
 * autres restaient bloquées sur des formules par défaut non modifiables.
 *
 * @returns {Array<string>} Les codes de langue, dans leur ordre de déclaration
 */
function languesGerees_() {
  return (typeof REPLY_SHELLS === 'object' && REPLY_SHELLS) ? Object.keys(REPLY_SHELLS) : ['fr'];
}

/**
 * Nom du champ transportant les formules d'une langue entre le client et le serveur.
 * @param {string} lang Code de langue
 * @returns {string} Par exemple « closingsDe »
 */
function champCloture_(lang) {
  return 'closings' + lang.charAt(0).toUpperCase() + lang.slice(1);
}

/**
 * Refuse l'appel s'il ne vient pas d'une personne identifiée agissant sous sa propre autorité.
 *
 * Pourquoi ce garde : `google.script.run` peut appeler toute fonction publique du projet
 * depuis N'IMPORTE QUELLE page HtmlService qu'il sert — y compris MobileUi, que doGet
 * livre à des visiteurs anonymes. getSettings, saveSettings et generateSharedSecret
 * doivent rester publiques pour le panneau du classeur ; sans ce contrôle, n'importe qui
 * ouvrant l'URL /exec lisait la clé API et le secret depuis la console du navigateur,
 * ou remplaçait le secret par le sien.
 *
 * Dans la WebApp (« exécuter en tant que moi »), l'adresse de l'utilisateur actif est
 * vide pour un visiteur anonyme, et diffère de l'utilisateur effectif pour tout autre
 * compte que le propriétaire. Dans la barre latérale, les deux coïncident.
 *
 * @throws {Error} Si l'appelant n'est pas celui sous l'autorité duquel le script s'exécute
 */
function assertDepuisLeClasseur_() {
  const actif = Session.getActiveUser().getEmail();
  const effectif = Session.getEffectiveUser().getEmail();

  if (!actif || actif !== effectif) {
    throw new Error(
      "Accès refusé : les réglages ne se consultent et ne se modifient que depuis le classeur, " +
      "par « 🛠️ Suivi PE > Ouvrir le panneau de contrôle »."
    );
  }
}

/**
 * Expose la méthode de sauvegarde pour le HTML (Côté Client -> Serveur)
 */
function saveSettings(settings) {
  assertDepuisLeClasseur_();

  if (settings.apiKey) {
    setGeminiApiKey_(settings.apiKey);
  }
  if (settings.modelName) {
    setGeminiModelName_(settings.modelName);
  }
  if (settings.sharedSecret !== undefined) {
    setSharedSecret_(settings.sharedSecret);
  }
  if (settings.signature !== undefined) {
    setSignature_(settings.signature);
  }

  languesGerees_().forEach(function (lang) {
    const champ = champCloture_(lang);
    if (settings[champ] !== undefined) {
      setCustomClosings_(lang, settings[champ]);
    }
  });

  return true;
}

/**
 * Récupère la configuration courante (Côté Serveur -> Client)
 */
function getSettings() {
  assertDepuisLeClasseur_();

  // Le panneau construit ses champs à partir de cette liste : ajouter une langue
  // aux coquilles suffit à la voir apparaître, sans toucher au HTML.
  const closings = languesGerees_().map(function (lang) {
    return {
      lang: lang,
      label: LANG_LABELS[lang] || lang.toUpperCase(),
      champ: champCloture_(lang),
      // Une ligne vide se saisit « - » dans l'interface : c'est ainsi qu'une clôture
      // vide se déclare explicitement, sans être confondue avec une absence de réglage.
      valeur: (getCustomClosings_(lang) || DEFAULT_CLOSINGS_FOR_UI_(lang)).join('\n').replace(/^$/gm, '-')
    };
  });

  return {
    apiKey: getGeminiApiKey_(),
    modelName: getGeminiModelName_(),
    sharedSecret: getSharedSecret_(),
    signature: getSignature_(),
    closings: closings
  };
}

/**
 * Renvoie les formules de clôture livrées par défaut pour une langue,
 * afin de préremplir le panneau de contrôle.
 * @param {string} lang Code de langue
 * @returns {Array<string>} Les formules par défaut
 */
function DEFAULT_CLOSINGS_FOR_UI_(lang) {
  const shell = REPLY_SHELLS[lang] || REPLY_SHELLS.fr;
  return shell.closings;
}

/**
 * Génère un secret partagé aléatoire à recopier dans l'extension et sur le mobile.
 * @returns {string} Le secret généré et déjà enregistré côté serveur
 */
function generateSharedSecret() {
  assertDepuisLeClasseur_();
  const secret = Utilities.getUuid().replace(/-/g, '');
  setSharedSecret_(secret);
  return secret;
}
