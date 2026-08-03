/**
 * Service Worker Background pour l'extension Community Console PE Tracker.
 * Gère les requêtes HTTP Cross-Origin vers Google Apps Script WebApp sans blocage CORS.
 */

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'sendToWebapp') {
    console.log("📡 Service Worker : Envoi de la requête à :", request.webappUrl);

    if (!request.webappUrl) {
      sendResponse({ success: false, error: "URL de la WebApp manquante." });
      return false;
    }

    fetch(request.webappUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify(request.payload)
    })
    .then(async (response) => {
      console.log("Réponse HTTP reçue du WebApp, statut :", response.status);
      const text = await response.text();
      try {
        const data = JSON.parse(text);
        console.log("Données JSON analysées :", data);
        sendResponse({ success: true, data: data });
      } catch (jsonErr) {
        console.warn("Réponse brute non-JSON reçue :", text);
        sendResponse({ success: true, data: { status: "success", summary: text } });
      }
    })
    .catch((error) => {
      console.error("Erreur Fetch dans Service Worker :", error);
      sendResponse({ success: false, error: error.toString() });
    });

    return true; // Maintient la communication asynchrone ouverte
  }
});
