/**
 * @fileoverview Intégration de l'API Google Gemini
 */

/**
 * Exécute UrlFetchApp.fetch avec tentatives et backoff exponentiel en cas d'erreur transitoire (429, 500, 503, etc.)
 * @param {string} url L'URL à appeler
 * @param {Object} options Les options de la requête HTTP
 * @param {number} maxRetries Nombre maximal de tentatives (défaut: 3)
 * @returns {GoogleAppsScript.URL_Fetch.HTTPResponse}
 */
function fetchWithRetry(url, options, maxRetries = 3) {
  let delay = 1000;
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = UrlFetchApp.fetch(url, options);
      const code = response.getResponseCode();
      if (code < 429 || (code >= 400 && code !== 429 && code !== 500 && code !== 502 && code !== 503 && code !== 504)) {
        return response;
      }
      console.warn(`Tentative ${i + 1}/${maxRetries} : code HTTP ${code}. Nouvelle tentative dans ${delay}ms...`);
    } catch (e) {
      console.warn(`Tentative ${i + 1}/${maxRetries} échouée : ${e.toString()}. Nouvelle tentative dans ${delay}ms...`);
    }
    Utilities.sleep(delay);
    delay *= 2;
  }
  return UrlFetchApp.fetch(url, options);
}

/**
 * Vérifie si une URL est accessible et ne renvoie pas une erreur 404 ou 4xx.
 * @param {string} url L'URL à tester
 * @returns {boolean} true si l'URL répond avec un statut HTTP valide (< 400)
 */
function isUrlValid(url) {
  if (!url || typeof url !== 'string' || !url.startsWith('http')) return false;
  try {
    const response = UrlFetchApp.fetch(url, {
      method: 'get',
      headers: { 'Range': 'bytes=0-1024' },
      followRedirects: true,
      muteHttpExceptions: true
    });
    const code = response.getResponseCode();
    return code >= 200 && code < 400;
  } catch (e) {
    console.warn("Impossible de valider l'URL (" + url + ") : " + e.toString());
    return false;
  }
}

/**
 * Résout les URL de redirection Vertex AI Search vers l'URL cible directe (ex. support.google.com).
 * @param {string} url L'URL pouvant être un lien de redirection Vertex AI
 * @returns {string} L'URL finale résolue ou l'URL d'origine en cas d'échec
 */
function resolveRedirectUrl(url) {
  if (!url || typeof url !== 'string') return url;
  if (!url.includes('vertexaisearch.cloud.google.com')) {
    return url;
  }
  
  try {
    const response = UrlFetchApp.fetch(url, {
      method: 'get',
      followRedirects: false,
      muteHttpExceptions: true,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    const headers = response.getHeaders();
    let location = null;

    for (const key in headers) {
      if (key.toLowerCase() === 'location') {
        location = headers[key];
        break;
      }
    }

    if (location && typeof location === 'string' && location.startsWith('http')) {
      return location;
    }
  } catch (e) {
    console.warn("Impossible de résoudre la redirection Vertex (" + url + ") : " + e.toString());
  }

  return url;
}

/**
 * Nettoie les URL générées par Gemini en s'appuyant sur le grounding et en éliminant les liens 404 et redirections Vertex.
 * @param {string} text Le texte brut généré par Gemini
 * @param {Object} candidate Le candidat retourné par l'API Gemini
 * @returns {string} Le texte avec les URL corrigées ou nettoyées
 */
function cleanAndValidateUrls(text, candidate) {
  if (!text) return "";

  // 1. Extraire et résoudre les URL de redirection Vertex AI depuis les groundingChunks
  const verifiedUrls = [];
  if (candidate && candidate.groundingMetadata && candidate.groundingMetadata.groundingChunks) {
    candidate.groundingMetadata.groundingChunks.forEach(chunk => {
      if (chunk.web && chunk.web.uri) {
        const resolvedUri = resolveRedirectUrl(chunk.web.uri);
        verifiedUrls.push(resolvedUri);
      }
    });
  }

  const urlCache = {};

  // 2. Traiter et remplacer les liens Markdown [Titre](URL) par Titre : URL (sans crochets ni parenthèses)
  const markdownLinkRegex = /\[([^\]]+)\]\((https?:\/\/[^\s\)]+)\)/g;
  let cleanedText = text.replace(markdownLinkRegex, (match, label, url) => {
    let targetUrl = resolveRedirectUrl(url);

    if (verifiedUrls.includes(targetUrl) || verifiedUrls.includes(url)) {
      return `${label} : ${targetUrl}`;
    }

    if (urlCache[targetUrl] === undefined) {
      urlCache[targetUrl] = isUrlValid(targetUrl);
    }

    if (urlCache[targetUrl]) {
      return `${label} : ${targetUrl}`;
    }

    if (verifiedUrls.length > 0) {
      const fallbackUrl = verifiedUrls[0];
      return `${label} : ${fallbackUrl}`;
    }

    return label;
  });

  // 3. Remplacer TOUTES les URL brutes restant dans le texte (notamment les redirections Vertex AI)
  const rawUrlRegex = /https?:\/\/[^\s\)\],]+/g;
  cleanedText = cleanedText.replace(rawUrlRegex, (url) => {
    let targetUrl = resolveRedirectUrl(url);

    if (targetUrl !== url) {
      return targetUrl;
    }

    if (urlCache[targetUrl] === undefined) {
      urlCache[targetUrl] = isUrlValid(targetUrl);
    }

    if (urlCache[targetUrl]) {
      return targetUrl;
    }

    if (verifiedUrls.length > 0) {
      return verifiedUrls[0];
    }

    return targetUrl;
  });

  // 4. Éliminer les crochets et parenthèses résiduels autour des URL
  cleanedText = cleanedText.replace(/\[(https?:\/\/[^\s\]]+)\]/g, '$1');
  cleanedText = cleanedText.replace(/\((https?:\/\/[^\s\)]+)\)/g, '$1');

  return cleanedText;
}

/**
 * Anonymise et masque les données personnelles identifiables (PII) dans un texte.
 * @param {string} text Le texte à analyser
 * @returns {string} Le texte où les e-mails, téléphones et secrets sont masqués
 */
function sanitizePii(text) {
  if (!text || typeof text !== 'string') return "";

  let cleaned = text;

  // 1. Masquer les adresses e-mail
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi;
  cleaned = cleaned.replace(emailRegex, '[EMAIL MASQUÉ]');

  // 2. Masquer les numéros de téléphone (Format Français et International)
  const phoneRegex = /(?:\+33|0)[1-9](?:[\s.-]?\d{2}){4}|\+\d{1,4}(?:[\s.-]?\d{2,4}){3,4}/g;
  cleaned = cleaned.replace(phoneRegex, '[TÉLÉPHONE MASQUÉ]');

  // 3. Masquer les clés API, tokens et mots de passe évidents
  const secretRegex = /\b(password|mot de passe|api_key|apikey|secret|access_token|token)\s*[:=]\s*([^\s,;]+)/gi;
  cleaned = cleaned.replace(secretRegex, '$1: [DONNÉE SENSIBLE MASQUÉE]');

  return cleaned;
}

/**
 * Fait appel à l'API Gemini pour résumer un thread.
 * @param {string} content Le texte brut de la question.
 * @param {string} author L'auteur de la question.
 * @param {string} product Le nom du produit Google.
 * @param {string} [passedApiKey] Clé API Gemini optionnelle transmise dynamiquement.
 * @returns {string} Le résumé généré ou un message d'erreur/d'absence de clé.
 */
function generateSummaryWithGemini(content, author = "Utilisateur", product = "Google", passedApiKey = "") {
  const apiKey = (passedApiKey && passedApiKey.trim()) ? passedApiKey.trim() : getGeminiApiKey();
  if (!apiKey) {
    return "Clé API Gemini manquante. Veuillez la configurer dans l'extension Chrome ou via 'Ouvrir le panneau de contrôle'.";
  }

  const modelName = getGeminiModelName();
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

  const authorName = (author && author.trim()) ? author.trim() : "Utilisateur";

  // Nettoyage préalable des PII dans le contenu transmis
  const sanitizedContent = sanitizePii(content);

  const prompt = `Tu es un assistant pour un "Product Expert" sur les forums Google.
L'utilisateur s'appelle "${authorName}" et pose une question concernant le produit "${product}".
Voici son message :
"${sanitizedContent}"

Génère une réponse complète, claire, directement utile et synthétique pour résoudre son problème.

RÈGLES DE FORMATAGE STRICTES :
1. Réponds DANS LA MÊME LANGUE que la question (français, anglais, allemand, espagnol, italien, etc.).
2. Ne rédige AUCUNE formule de politesse au début ou à la fin (pas de bonjour/hello/hallo/hola/ciao, pas de salutations). Donne UNIQUEMENT le corps de la réponse technique.
3. N'utilise JAMAIS de lignes de séparation (pas de --- ni de ___).
4. N'utilise JAMAIS de caractères backticks (\`), ni d'astérisques (*) pour les puces. Utilise des tirets (-) pour les listes.
5. Sois synthétique : donne les étapes essentielles de manière claire, sans introduire de blabla théorique inutile, mais veille à ce que la réponse soit complète et finie.
6. Indique obligatoirement les sources officielles et liens vers les articles du Centre d'aide Google pertinents (trouvés via googleSearch) pour étayer ta réponse. ATTENTION STRICTE : N'invente JAMAIS d'URL ni d'identifiant d'article (ne devine pas des numéros d'anecdote ou d'article comme /answer/123456). N'utilise QUE les URL réelles et exactes retournées par les résultats de recherche googleSearch. N'utilise JAMAIS de crochets [...] ni de parenthèses (...) autour des liens. Format obligatoire des liens : Titre de l'article : https://URL_EXACTE.
7. PROTECTION DES DONNÉES PERSONNELLES (PII) : Ne mentionne et ne répète JAMAIS de données personnelles (email, téléphone, mot de passe, adresse, clé API, etc.) dans ta réponse. Si la question d'origine contenait des PII ou si l'utilisateur semblait partager des données confidentielles, ajoute impérativement un court avertissement amical à la fin pour lui rappeler que le forum est public et qu'il ne faut jamais y partager d'informations personnelles.
8. RECOMMANDATIONS SPÉCIFIQUES POUR LA PERTE D'ACCÈS AU COMPTE GOOGLE (GOOGLE ACCOUNT RECOVERY) :
Si la question concerne une perte d'accès à un Compte Google ou une impossibilité de récupération (numéro obsolète, e-mail de secours inaccessible, mot de passe oublié, 2FA bloqué) :
- Accuse réception des détails spécifiques (Acknowledge specific details first) : Commence les 1 ou 2 premières phrases en récapitulant les faits précis mentionnés par l'utilisateur (ex. "Puisque vous avez indiqué ne plus avoir accès à votre ancien numéro ni à votre adresse de secours..."). Cela prouve que son message a été lu et compris.
- Soyez direct dès le début (Be direct about reality early) : Si la récupération est manifestement impossible au vu des éléments, annonce-le clairement d'emblée au lieu d'envoyer des liens génériques qui mèneront à une impasse.
- Expliquez la contrainte de sécurité (Explain why clearly) : Expliquez brièvement la raison système (ex. "Le système automatisé de sécurité de Google exige au moins un moyen de récupération actif pour vérifier la propriété du compte.").`;

  const payload = {
    "contents": [{
      "parts": [{
        "text": prompt
      }]
    }],
    "tools": [{
      "googleSearch": {}
    }]
  };

  const options = {
    "method": "post",
    "contentType": "application/json",
    "payload": JSON.stringify(payload),
    "muteHttpExceptions": true
  };

  try {
    const response = fetchWithRetry(apiUrl, options);
    const json = JSON.parse(response.getContentText());

    if (json.error) {
      console.error("Erreur API Gemini : " + json.error.message);
      return `Erreur API : ${json.error.message}`;
    }

    if (json.candidates && json.candidates.length > 0) {
      const candidate = json.candidates[0];
      const rawText = candidate.content.parts[0].text.trim();

      // Valider et filtrer les URL pour éliminer les erreurs 404
      const technicalResponse = cleanAndValidateUrls(rawText, candidate);

      const lang = detectLanguage(content);
      const displayName = authorName;

      return buildFormattedResponse(lang, displayName, product, technicalResponse);
    }
    return "Aucune réponse n'a pu être générée.";

  } catch (e) {
    console.error("Exception lors de l'appel Gemini: " + e.toString());
    return "Erreur lors de la communication avec l'API Gemini.";
  }
}

/**
 * Détecte la langue principale du texte (français, anglais, allemand, espagnol, italien).
 * @param {string} text Le texte à analyser
 * @returns {string} Code de langue ('fr', 'en', 'de', 'es', 'it')
 */
function detectLanguage(text) {
  if (!text || typeof text !== 'string') return 'fr';

  const wordLists = {
    fr: /\b(le|la|les|un|une|des|et|du|en|est|dans|pour|sur|avec|par|ce|cette|que|qui|pas|mon|ma|mes|bonjour|souhaite|compte|problème|comment|merci)\b/gi,
    en: /\b(the|is|and|to|in|you|that|it|of|for|on|with|as|this|was|at|by|an|be|from|or|have|my|not|your|can|how|what|why|help|account|issue|problem|please)\b/gi,
    de: /\b(der|die|das|und|ist|in|den|von|zu|mit|sich|des|auf|für|im|dem|nicht|ein|eine|einer|einem|als|auch|es|an|werden|aus|er|hat|dass|sie|nach|wie|bitte|konto|problem|hilfe|hallo)\b/gi,
    es: /\b(el|la|los|las|un|una|unos|unas|y|de|en|que|es|por|para|con|no|su|sus|como|mas|pero|le|ya|este|esta|hola|cuenta|problema|ayuda|gracias)\b/gi,
    it: /\b(il|lo|la|i|gli|le|un|uno|una|e|di|da|in|con|su|per|tra|fra|che|non|si|del|della|dei|delle|questo|questa|come|ciao|conto|problema|aiuto|grazie)\b/gi
  };

  const scores = { fr: 0, en: 0, de: 0, es: 0, it: 0 };

  for (const lang in wordLists) {
    const matches = text.match(wordLists[lang]);
    scores[lang] = matches ? matches.length : 0;
  }

  let maxLang = 'fr';
  let maxScore = 0;

  for (const lang in scores) {
    if (scores[lang] > maxScore) {
      maxScore = scores[lang];
      maxLang = lang;
    }
  }

  return maxLang;
}

/**
 * Formate la réponse globale adaptée à la langue détectée avec salutations et signature.
 * @param {string} lang Le code de langue ('fr', 'en', 'de', 'es', 'it')
 * @param {string} displayName Nom de l'utilisateur
 * @param {string} product Produit Google
 * @param {string} technicalResponse Corps technique généré par l'IA
 * @returns {string} La réponse complète mise en forme
 */
function buildFormattedResponse(lang, displayName, product, technicalResponse) {
  switch (lang) {
    case 'en':
      return `Hello ${displayName}, and welcome to the ${product} User Community!
 
I am a user like you, and I will do my best to help you resolve this issue.

${technicalResponse}

I hope, ${displayName}, that this answer will be helpful to you.
 
If you have further questions or if anything remains unclear, feel free to reply, we will do everything we can to help you.
 
Fabrice
https://atelier-informatique.com/`;

    case 'de':
      return `Hallo ${displayName} und willkommen in der ${product}-Nutzercommunity!
 
Ich bin ein Nutzer wie Sie und werde mein Bestes tun, um Ihnen bei der Lösung dieses Problems zu helfen.

${technicalResponse}

Ich hoffe, ${displayName}, dass Ihnen diese Antwort weiterhilft.
 
Wenn Sie weitere Fragen haben oder etwas unklar geblieben ist, können Sie gerne antworten. Wir werden alles tun, um Ihnen zu helfen.
 
Fabrice
https://atelier-informatique.com/`;

    case 'es':
      return `Hola ${displayName}, ¡y le damos la bienvenida a la comunidad de usuarios de ${product}!
 
Soy un usuario como usted y haré todo lo posible para ayudarle a resolver este problema.

${technicalResponse}

Espero, ${displayName}, que esta respuesta le sea de utilidad.
 
Si tiene más preguntas o si algo no le queda claro, no dude en responder, haremos todo lo posible para ayudarle.
 
Fabrice
https://atelier-informatique.com/`;

    case 'it':
      return `Ciao ${displayName} e benvenuto/a nella community degli utenti di ${product}!
 
Sono un utente come te e farò del mio meglio per aiutarti a risolvere questo problema.

${technicalResponse}

Spero, ${displayName}, che questa risposta ti sia utile.
 
Se hai altre domande o se qualcosa non è chiaro, non esitare a rispondere, faremo tutto il possibile per aiutarti.
 
Fabrice
https://atelier-informatique.com/`;

    case 'fr':
    default:
      return `Bonjour ${displayName}, et bienvenue sur la communauté des utilisateurs de ${product} !
 
Je suis un utilisateur comme vous, et je vais faire de mon mieux pour vous aider à résoudre ce problème.

${technicalResponse}

J’espère, ${displayName}, que cette réponse vous sera utile.

Si vous avez d’autres questions ou si des points restent flous, n’hésitez pas à revenir vers nous, nous ferons tout pour vous aider.
 
Fabrice
https://atelier-informatique.com/`;
  }
}

/**
 * Récupère la liste des modèles Gemini disponibles pour la clé API actuelle
 * @returns {Array<string>} Liste des noms de modèles supportant generateContent
 */
function listGeminiModels() {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error("Veuillez d'abord configurer votre clé API dans le panneau de contrôle.");
  }

  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;

  const options = {
    "method": "get",
    "muteHttpExceptions": true
  };

  try {
    const response = fetchWithRetry(apiUrl, options);
    const json = JSON.parse(response.getContentText());

    if (json.error) {
      throw new Error(json.error.message);
    }

    if (json.models) {
      // Filtrer les modèles qui supportent generateContent et extraire le nom court (sans "models/")
      const availableModels = json.models
        .filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes("generateContent"))
        .map(m => m.name.replace("models/", ""));
      return availableModels;
    }

    return [];
  } catch (e) {
    throw new Error("Impossible de lister les modèles : " + e.toString());
  }
}

/**
 * Convertit le texte markdown généré par Gemini en RichTextValue pour Google Sheets.
 * Gère le gras (**), les liens markdown [Libellé](URL), nettoie les séparateurs (---), guillemets doublés ("") et backticks (`).
 * @param {string} text Le texte markdown
 * @returns {GoogleAppsScript.Spreadsheet.RichTextValue} La valeur formatée
 */
function formatMarkdownToRichText(text) {
  if (!text) return SpreadsheetApp.newRichTextValue().setText("").build();

  // 1. Supprimer tous les backticks (`) et corriger les guillemets doublés ("")
  let processedText = text.replace(/`/g, '').replace(/""/g, '"');

  // 2. Supprimer les lignes de séparation Markdown (---, ___, ***)
  processedText = processedText.replace(/^[\s\-_*]{3,}$/gm, '');

  // 3. Transformer les titres markdown (### Titre) en gras (**Titre**)
  processedText = processedText.replace(/^#+\s*(.*)$/gm, '**$1**');

  // 4. Remplacer les listes à puces markdown (*) par des tirets (-)
  processedText = processedText.replace(/^(\s*)\*\s+/gm, '$1- ');

  // 5. Nettoyer les sauts de ligne multiples consécutifs (plus de 2 de suite)
  processedText = processedText.replace(/\n{3,}/g, '\n\n');

  // Expression régulière pour capturer :
  // Groupe 1: **[label](url)** (Gras + Lien)
  // Groupe 2/3: label/url de Groupe 1
  // Groupe 4: [label](url) (Lien seul)
  // Groupe 5/6: label/url de Groupe 4
  // Groupe 7: **texte** (Gras seul)
  // Groupe 8: texte de Groupe 7
  // Groupe 9: URL brute (https://...)
  const combinedRegex = /(\*\*\[([^\]]+)\]\((https?:\/\/[^\s\)]+)\)\*\*)|(\[([^\]]+)\]\((https?:\/\/[^\s\)]+)\))|(\*\*([^*]+)\*\*)|(https?:\/\/[^\s\)\],]+)/g;

  let finalString = "";
  let boldRanges = [];
  let linkRanges = [];
  let currentPos = 0;
  let lastIndex = 0;
  let match;

  while ((match = combinedRegex.exec(processedText)) !== null) {
    // Ajouter le texte brut situé avant le motif
    const plainBefore = processedText.substring(lastIndex, match.index);
    if (plainBefore.length > 0) {
      finalString += plainBefore;
      currentPos += plainBefore.length;
    }

    let displayText = "";
    let isBold = false;
    let linkUrl = null;

    if (match[1]) {
      // **[label](url)** -> Gras + Lien
      displayText = match[2];
      linkUrl = match[3];
      isBold = true;
    } else if (match[4]) {
      // [label](url) -> Lien seul
      displayText = match[5];
      linkUrl = match[6];
    } else if (match[7]) {
      // **texte** -> Gras seul
      displayText = match[8];
      isBold = true;
    } else if (match[9]) {
      // URL brute -> Lien cliquable sur l'URL
      displayText = match[9];
      linkUrl = match[9];
    }

    const start = currentPos;
    const end = currentPos + displayText.length;

    finalString += displayText;
    currentPos += displayText.length;

    if (isBold) {
      boldRanges.push([start, end]);
    }
    if (linkUrl) {
      linkRanges.push([start, end, linkUrl]);
    }

    lastIndex = combinedRegex.lastIndex;
  }

  // Ajouter le reste du texte
  const remaining = processedText.substring(lastIndex);
  if (remaining.length > 0) {
    finalString += remaining;
  }

  const builder = SpreadsheetApp.newRichTextValue().setText(finalString);
  const boldStyle = SpreadsheetApp.newTextStyle().setBold(true).build();

  for (let i = 0; i < boldRanges.length; i++) {
    builder.setTextStyle(boldRanges[i][0], boldRanges[i][1], boldStyle);
  }

  for (let i = 0; i < linkRanges.length; i++) {
    builder.setLinkUrl(linkRanges[i][0], linkRanges[i][1], linkRanges[i][2]);
  }

  return builder.build();
}

