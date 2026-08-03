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
    "Notes"
  ],
  
  // Statuts par défaut
  STATUSES: [
    "Nouvelle",
    "En attente (User)",
    "Escaladée",
    "Résolue",
    "Verrouillée",
    "Abandonnée"
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
 * @returns {string} Le nom du modèle ou 'gemini-pro' par défaut
 */
function getGeminiModelName() {
  return PropertiesService.getUserProperties().getProperty('GEMINI_MODEL') || 'gemini-pro';
}

/**
 * Enregistre le nom du modèle Gemini
 * @param {string} modelName Le modèle à sauvegarder
 */
function setGeminiModelName(modelName) {
  PropertiesService.getUserProperties().setProperty('GEMINI_MODEL', modelName);
}
