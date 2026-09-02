/**
 * Service Worker de l'extension Community Console PE Tracker.
 * Relaie les requêtes vers la WebApp Apps Script sans se heurter au blocage CORS.
 */

/**
 * Explique une réponse qui n'est pas le JSON attendu.
 *
 * Ces réponses étaient auparavant transmises telles quelles avec `status: "success"`
 * et le corps brut en guise de proposition : la page d'erreur HTML de Google se
 * retrouvait placée dans le champ de réponse du forum, présentée comme le texte
 * rédigé par Gemini. Une erreur doit se lire comme une erreur.
 *
 * @param {string} texte Le corps de la réponse
 * @param {number} statut Le code HTTP
 * @returns {string} Un message expliquant la cause probable et la manœuvre à faire
 */
function expliquerReponseInattendue(texte, statut) {
  const corps = String(texte || '');
  const estHtml = /^\s*<(?:!doctype|html)\b/i.test(corps);

  // Apps Script sert cette page lorsque l'URL ne correspond à aucun déploiement actif
  if (/Page introuvable|Impossible d'ouvrir le fichier|Sorry, unable to open the file/i.test(corps)) {
    return "La WebApp est introuvable à cette adresse.\n\n" +
      "Causes habituelles :\n" +
      "• l'URL enregistrée dans l'extension n'est pas celle du déploiement actif ;\n" +
      "• le déploiement a été archivé ou supprimé ;\n" +
      "• l'URL a été tronquée à la copie (elle doit se terminer par /exec).\n\n" +
      "Dans l'éditeur Apps Script : Déployer > Gérer les déploiements, copiez l'URL " +
      "de l'application web, puis recollez-la dans les options de l'extension.";
  }

  // Redirection vers l'écran de connexion : le déploiement n'est pas public
  if (/accounts\.google\.com|ServiceLogin|<title>[^<]*(Connexion|Sign in)/i.test(corps)) {
    return "Google demande une connexion au lieu de répondre.\n\n" +
      "Le déploiement n'est probablement pas accessible à « N'importe qui ».\n" +
      "Dans l'éditeur Apps Script : Déployer > Gérer les déploiements > ✏️ > " +
      "Qui a accès : N'importe qui.";
  }

  if (statut >= 500) {
    return "Le serveur Apps Script a renvoyé une erreur " + statut + ".\n\n" +
      "Il s'agit le plus souvent d'un incident passager : réessayez dans quelques instants.";
  }

  if (statut >= 400) {
    return "La WebApp a répondu avec le code HTTP " + statut + ".\n\n" +
      "Vérifiez l'URL enregistrée dans les options de l'extension.";
  }

  if (estHtml) {
    return "La WebApp a renvoyé une page HTML au lieu de données.\n\n" +
      "L'URL enregistrée ne pointe probablement pas vers un déploiement d'application web " +
      "(elle doit se terminer par /exec).";
  }

  return "Réponse inattendue de la WebApp :\n\n" + corps.slice(0, 300);
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action !== 'sendToWebapp') return;

  console.log("📡 Service Worker : envoi de la requête à", request.webappUrl);

  if (!request.webappUrl) {
    sendResponse({ success: false, error: "URL de la WebApp manquante." });
    return false;
  }

  fetch(request.webappUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(request.payload)
  })
    .then(async (response) => {
      const texte = await response.text();
      console.log("Réponse HTTP reçue de la WebApp, statut :", response.status);

      let data = null;
      try {
        data = JSON.parse(texte);
      } catch (jsonErr) {
        // Ni JSON, ni exploitable : on ne fait surtout pas passer ce corps pour une réponse
        console.warn("Réponse non-JSON reçue :", texte.slice(0, 300));
        sendResponse({
          success: false,
          httpStatus: response.status,
          error: expliquerReponseInattendue(texte, response.status)
        });
        return;
      }

      // Du JSON servi avec un code d'erreur reste une erreur
      if (!response.ok) {
        sendResponse({
          success: false,
          httpStatus: response.status,
          error: "La WebApp a répondu avec le code HTTP " + response.status +
                 (data && data.message ? " :\n\n" + data.message : ".")
        });
        return;
      }

      sendResponse({ success: true, data: data });
    })
    .catch((error) => {
      console.error("Erreur réseau dans le Service Worker :", error);
      sendResponse({
        success: false,
        error: "La WebApp n'a pas pu être contactée.\n\n" + error +
               "\n\nVérifiez votre connexion et l'URL enregistrée dans les options de l'extension."
      });
    });

  return true; // Maintient le canal ouvert pour la réponse asynchrone
});
