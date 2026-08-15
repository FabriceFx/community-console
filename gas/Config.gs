/**
 * @fileoverview Fichier de configuration et gestion des propriétés
 */

const CONFIG = {
  // Nom de la feuille de calcul principale
  SHEET_NAME: "Suivi Questions",

  // Colonnes de la feuille
  COLUMNS: [
    "ID",
    "Date d'ajout",
    "URL du Thread",
    "Produit",
    "Titre",
    "Question",
    "Auteur",
    "Statut",
    "Résumé / Action (Gemini)",
    "Date de relance",
    "Notes",
    "Réponse publiée"
  ],

  // Index des colonnes (1-based), pour ne plus les coder en dur dans le reste du projet
  COL: {
    ID: 1,
    DATE: 2,
    URL: 3,
    PRODUCT: 4,
    TITLE: 5,
    QUESTION: 6,
    AUTHOR: 7,
    STATUS: 8,
    SUMMARY: 9,
    FOLLOWUP: 10,
    NOTES: 11,
    PUBLISHED: 12
  },

  // Nombre d'exemples de style réinjectés dans le prompt (voir getStyleExamples_)
  STYLE_EXAMPLES_COUNT: 3,

  // Part minimale de mots réécrits pour qu'une réponse publiée compte comme retouchée.
  // En deçà, elle n'apprend rien au modèle sur le style du PE et n'est pas conservée.
  MIN_EDIT_RATIO: 0.05,

  // Statuts par défaut
  STATUSES: [
    "Nouvelle",
    "En attente (User)",
    "Escaladée",
    "Résolue",
    "Verrouillée",
    "Abandonnée"
  ],

  // Domaines autorisés pour l'extraction serveur (anti-SSRF sur la WebApp mobile)
  ALLOWED_HOSTS: [
    "support.google.com"
  ],

  // Valeurs de produit considérées comme « non identifié »
  // (évite les accueils du type « bienvenue sur la communauté de Inconnu »)
  UNKNOWN_PRODUCTS: ["", "inconnu", "unknown", "google", "n/a"],

  // URL officielles et stables, jamais soumises à la validation HTTP.
  // Ce sont des raccourcis de redirection : une vérification réseau y est à la fois
  // inutile (l'URL est connue exacte) et risquée (un échec réseau ponctuel ferait
  // silencieusement disparaître un lien que l'on veut systématiquement présent).
  TRUSTED_URLS: [
    "https://g.co/recover"
  ]
};

/**
 * Récupère la clé API Gemini enregistrée par l'utilisateur
 * @returns {string} La clé API ou une chaîne vide
 */
function getGeminiApiKey() {
  return PropertiesService.getUserProperties().getProperty('GEMINI_API_KEY') || '';
}

/**
 * Enregistre la clé API Gemini
 * @param {string} key La clé API à sauvegarder
 */
function setGeminiApiKey(key) {
  PropertiesService.getUserProperties().setProperty('GEMINI_API_KEY', key);
}

/**
 * Récupère le nom du modèle Gemini enregistré
 * @returns {string} Le nom du modèle ou 'gemini-3.7-flash' par défaut
 */
function getGeminiModelName() {
  return PropertiesService.getUserProperties().getProperty('GEMINI_MODEL') || 'gemini-3.7-flash';
}

/**
 * Enregistre le nom du modèle Gemini
 * @param {string} modelName Le modèle à sauvegarder
 */
function setGeminiModelName(modelName) {
  PropertiesService.getUserProperties().setProperty('GEMINI_MODEL', modelName);
}

/**
 * Récupère le secret partagé protégeant la WebApp publique.
 * Stocké dans les propriétés du SCRIPT (et non de l'utilisateur) car la WebApp
 * s'exécute au nom du propriétaire pour des appelants anonymes.
 * @returns {string} Le secret, ou une chaîne vide s'il n'est pas configuré
 */
function getSharedSecret() {
  return PropertiesService.getScriptProperties().getProperty('PE_SHARED_SECRET') || '';
}

/**
 * Enregistre le secret partagé protégeant la WebApp publique.
 * @param {string} secret Le secret à sauvegarder
 */
function setSharedSecret(secret) {
  PropertiesService.getScriptProperties().setProperty('PE_SHARED_SECRET', String(secret || '').trim());
}

/**
 * Vérifie qu'un appelant externe est autorisé à utiliser la WebApp.
 * La WebApp étant déployée en accès « N'importe qui », c'est la seule barrière
 * empêchant un tiers de consommer le quota Gemini et d'écrire dans la feuille.
 *
 * @param {string} providedSecret Le secret transmis par l'appelant
 * @throws {Error} Si aucun secret n'est configuré, ou si le secret transmis est incorrect
 */
function assertAuthorized_(providedSecret) {
  const expected = getSharedSecret();

  if (!expected) {
    throw new Error(
      "Accès refusé : aucun secret partagé n'est configuré côté serveur. " +
      "Ouvrez « 🛠️ Suivi PE > Ouvrir le panneau de contrôle » dans Google Sheets pour en définir un."
    );
  }

  if (String(providedSecret || '').trim() !== expected) {
    throw new Error("Accès refusé : secret partagé invalide ou manquant.");
  }
}

/**
 * Vérifie qu'une URL cible appartient à un domaine autorisé avant toute récupération serveur.
 * Empêche l'utilisation de la WebApp comme proxy HTTP ouvert au nom du compte Google propriétaire.
 *
 * @param {string} url L'URL à contrôler
 * @throws {Error} Si le domaine n'est pas autorisé
 */
function assertAllowedHost_(url) {
  const match = String(url || '').match(/^https?:\/\/([^\/\?#:]+)/i);
  const host = match ? match[1].toLowerCase() : '';

  const allowed = CONFIG.ALLOWED_HOSTS.some(function (allowedHost) {
    return host === allowedHost || host.endsWith('.' + allowedHost);
  });

  if (!allowed) {
    throw new Error("Domaine non autorisé. Seules les URL " + CONFIG.ALLOWED_HOSTS.join(', ') + " sont acceptées.");
  }
}

/**
 * Indique si une URL fait partie des liens officiels de confiance.
 * Ces URL contournent la validation HTTP et ne peuvent jamais être supprimées d'une réponse.
 *
 * @param {string} url L'URL à tester
 * @returns {boolean} true si l'URL est un lien officiel connu
 */
function isTrustedUrl_(url) {
  const normalized = String(url || '').trim().replace(/[.,;:!?)\]]+$/, '').replace(/\/+$/, '').toLowerCase();
  return CONFIG.TRUSTED_URLS.some(function (trusted) {
    return normalized === trusted.toLowerCase().replace(/\/+$/, '');
  });
}

/**
 * Renvoie la forme canonique d'un lien officiel (sans ponctuation ni barre oblique finale).
 * Évite qu'un point de fin de phrase ne soit intégré à l'URL cliquable dans Google Sheets.
 *
 * @param {string} url L'URL à normaliser
 * @returns {string} L'URL officielle exacte, ou l'URL d'origine si elle n'est pas connue
 */
function canonicalTrustedUrl_(url) {
  const normalized = String(url || '').trim().replace(/[.,;:!?)\]]+$/, '').replace(/\/+$/, '').toLowerCase();
  const found = CONFIG.TRUSTED_URLS.filter(function (trusted) {
    return normalized === trusted.toLowerCase().replace(/\/+$/, '');
  });
  return found.length ? found[0] : url;
}

/**
 * Indique si le nom de produit extrait est exploitable dans une formule d'accueil.
 * @param {string} product Le nom de produit
 * @returns {boolean} true si le produit est réellement identifié
 */
function isKnownProduct_(product) {
  const normalized = String(product || '').trim().toLowerCase();
  return normalized !== '' && CONFIG.UNKNOWN_PRODUCTS.indexOf(normalized) === -1;
}
