/**
 * @fileoverview Traitement côté serveur des requêtes soumises depuis la WebApp Mobile (iPhone/iPad)
 */

/**
 * Reçoit l'URL d'un thread soumise depuis l'interface mobile, extrait les informations côté serveur
 * via UrlFetchApp, génère la proposition de réponse Gemini, enregistre la ligne dans Google Sheets
 * et retourne le message formaté au mobile.
 *
 * @param {string} threadUrl L'URL complète du thread Google Community Console
 * @param {string} [providedAuthor] Prénom ou nom de l'auteur fourni manuellement
 * @param {string} [providedContent] Texte intégral de la question collé manuellement si disponible
 * @param {string} [providedSecret] Secret partagé protégeant la WebApp publique
 * @returns {Object} Statut, titre, produit, niveau de fiabilité et proposition de réponse
 */
function processMobileThreadUrl(threadUrl, providedAuthor, providedContent, providedSecret) {
  // 1. Autorisation — la WebApp est accessible à quiconque connaît son URL
  assertAuthorized_(providedSecret);

  if (!threadUrl || typeof threadUrl !== 'string') {
    throw new Error("L'URL du thread fournie est invalide.");
  }

  let cleanUrl = threadUrl.trim();
  if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
    cleanUrl = 'https://' + cleanUrl;
  }

  // 2. Restreindre les domaines récupérables : sans ce contrôle, la WebApp serait un
  //    proxy HTTP ouvert agissant au nom du compte Google propriétaire du script.
  assertAllowedHost_(cleanUrl);

  console.log("processMobileThreadUrl :", cleanUrl, "| auteur fourni :", !!providedAuthor, "| contenu fourni :", !!providedContent);

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

  // 3. Extraire le titre du thread
  let title = "Thread Community Console";
  const titleMatch = htmlText.match(/<title[^>]*>([^<]+)<\/title>/i) || htmlText.match(/property="og:title"\s+content="([^"]+)"/i);
  if (titleMatch && titleMatch[1]) {
    title = titleMatch[1].replace(/\s*-\s*Communauté Google.*$/i, '').trim();
  }

  // 4. Extraire le nom du produit Google
  let product = "Google";
  if (cleanUrl.includes('/mail/')) product = "Gmail";
  else if (cleanUrl.includes('/accounts/')) product = "Compte Google";
  else if (cleanUrl.includes('/drive/')) product = "Google Drive";
  else if (cleanUrl.includes('/photos/')) product = "Google Photos";
  else if (cleanUrl.includes('/maps/')) product = "Google Maps";
  else if (cleanUrl.includes('/chrome/')) product = "Google Chrome";
  else if (cleanUrl.includes('/android/')) product = "Android";
  else if (cleanUrl.includes('/youtube/')) product = "YouTube";
  else if (cleanUrl.includes('/docs/')) product = "Google Docs";

  // 5. Utiliser le contenu collé manuellement, sinon retomber sur les métadonnées de la page.
  //    La Community Console étant rendue côté client, ces métadonnées sont souvent très pauvres :
  //    c'est précisément la raison d'être du champ manuel côté interface mobile.
  let content = String(providedContent || "").trim();
  let contentIsThin = false;

  if (!content) {
    const metaDesc = htmlText.match(/name="description"\s+content="([^"]+)"/i) || htmlText.match(/property="og:description"\s+content="([^"]+)"/i);
    if (metaDesc && metaDesc[1]) {
      content = metaDesc[1].trim();
    }
  }
  if (!content || content.length < 15) {
    content = title;
    contentIsThin = true;
  }

  // 6. Extraire le nom de l'auteur de la question
  let author = String(providedAuthor || "").trim();

  if (!author) {
    // A. Recherche dans le payload de données Google (avatar + nom d'affichage)
    const avatarMatch = htmlText.match(/googleusercontent\.com\/[^"]*",\s*"([^"]{2,60})"/i);
    if (avatarMatch && avatarMatch[1] && !avatarMatch[1].startsWith('http')) {
      author = avatarMatch[1].trim();
    }
  }

  if (!author) {
    // B. Lien vers le profil utilisateur de la communauté
    const userLinkMatch = htmlText.match(/<a\s+[^>]*href=["']\/s\/community\/user\/[^"']+["'][^>]*>([^<]+)<\/a>/i);
    if (userLinkMatch && userLinkMatch[1]) {
      author = userLinkMatch[1].trim();
    }
  }

  if (!author) {
    // C. Balises data-stats-id ou classes CSS de la Community Console
    const cssMatch = htmlText.match(/(?:data-stats-id=["']user-name["']|class=["'][^"']*(?:user-name|Userinfoname)[^"']*["'])[^>]*>([^<]+)/i);
    if (cssMatch && cssMatch[1]) {
      author = cssMatch[1].trim();
    }
  }

  if (!author) {
    // D. Titre ou meta og:title s'il contient « de [Auteur] » ou « par [Auteur] »
    const ogTitleMatch = htmlText.match(/property=["']og:title["']\s+content=["']([^"']+)["']/i);
    if (ogTitleMatch && ogTitleMatch[1]) {
      const matchDe = ogTitleMatch[1].match(/(?:par|de|by)\s+([^-–—|]+)/i);
      if (matchDe && matchDe[1]) {
        author = matchDe[1].trim();
      }
    }
  }

  if (!author) {
    author = "Utilisateur inconnu";
  }

  // 7. Générer la proposition de réponse
  const reply = generateReply(content, author, product);
  const summary = reply.text || "";

  // 8. Enregistrer la ligne sous verrou
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) {
    throw new Error("Le serveur traite déjà une autre demande. Réessayez dans quelques secondes.");
  }

  const newId = Utilities.getUuid().substring(0, 8);

  try {
    const sheet = getTrackingSheet_();

    sheet.appendRow([
      newId,
      new Date(),
      cleanUrl,
      product,
      title,
      content,
      author,
      CONFIG.STATUSES[0], // "Nouvelle"
      "",
      "",
      buildNote_("Ajouté via WebApp Mobile (iPhone)", reply),
      "" // Réponse publiée, non applicable depuis le mobile
    ]);

    const row = sheet.getLastRow();
    if (summary) {
      sheet.getRange(row, CONFIG.COL.SUMMARY).setRichTextValue(formatMarkdownToRichText(summary));
    }
  } finally {
    lock.releaseLock();
  }

  return {
    status: "success",
    id: newId,
    title: title,
    author: author,
    product: product,
    summary: summary,
    replyStatus: reply.status,
    confidence: reply.confidence,
    // Signale à l'interface que Gemini n'a travaillé que sur le titre du thread
    contentIsThin: contentIsThin
  };
}
