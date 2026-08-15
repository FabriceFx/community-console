/**
 * @fileoverview Intégration de l'API Google Gemini
 */

/**
 * Retire toute clé d'API d'une chaîne avant journalisation ou affichage.
 * Indispensable : les messages d'exception d'Apps Script contiennent l'URL appelée.
 * @param {*} value La valeur à assainir
 * @returns {string} La chaîne sans secret exploitable
 */
function redactSecrets_(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/([?&]key=)[^&\s"']+/gi, '$1[MASQUÉE]')
    .replace(/AIza[0-9A-Za-z\-_]{10,}/g, '[CLÉ MASQUÉE]');
}

/**
 * Exécute UrlFetchApp.fetch avec tentatives et backoff exponentiel en cas d'erreur transitoire (429, 500, 503, etc.)
 * @param {string} url L'URL à appeler
 * @param {Object} options Les options de la requête HTTP
 * @param {number} maxRetries Nombre maximal de tentatives (défaut: 3)
 * @returns {GoogleAppsScript.URL_Fetch.HTTPResponse}
 */
function fetchWithRetry(url, options, maxRetries = 3) {
  let delay = 1000;
  let lastError = null;
  let lastResponse = null;

  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = UrlFetchApp.fetch(url, options);
      const code = response.getResponseCode();
      if (![429, 500, 502, 503, 504].includes(code)) {
        return response;
      }
      lastResponse = response;
      console.warn(`Tentative ${i + 1}/${maxRetries} : code HTTP ${code}. Nouvelle tentative dans ${delay}ms...`);
    } catch (e) {
      lastError = e;
      console.warn(`Tentative ${i + 1}/${maxRetries} échouée : ${redactSecrets_(e)}. Nouvelle tentative dans ${delay}ms...`);
    }
    if (i < maxRetries - 1) {
      Utilities.sleep(delay);
      delay *= 2;
    }
  }

  if (lastResponse) {
    return lastResponse;
  }
  throw new Error(
    lastError
      ? `Échec de la requête après ${maxRetries} tentatives : ${redactSecrets_(lastError)}`
      : `Échec de la requête après ${maxRetries} tentatives.`
  );
}

/**
 * Vérifie l'état d'une URL en distinguant trois cas.
 *
 * Cette distinction est essentielle : ne pas AVOIR PU vérifier un lien n'est pas la même
 * chose que l'avoir trouvé mort. Confondre les deux faisait disparaître silencieusement
 * des articles du Centre d'aide parfaitement valides au moindre incident réseau.
 *
 * @param {string} url L'URL à tester
 * @returns {string} 'valide' (2xx/3xx), 'morte' (4xx confirmé) ou 'inconnue' (vérification impossible)
 */
function checkUrlStatus_(url) {
  if (!url || typeof url !== 'string' || !url.startsWith('http')) return 'morte';

  try {
    const response = UrlFetchApp.fetch(url, {
      method: 'get',
      followRedirects: true,
      muteHttpExceptions: true,
      // Certains serveurs répondent 416 à un en-tête Range : on n'en envoie plus.
      // Un User-Agent de navigateur évite les refus opposés aux clients automatisés.
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    const code = response.getResponseCode();
    if (code >= 200 && code < 400) return 'valide';
    if (code >= 400 && code < 500) return 'morte';

    // 5xx : problème côté serveur, pas une preuve que la page n'existe pas
    return 'inconnue';
  } catch (e) {
    console.warn("Vérification impossible pour l'URL (" + url + ") : " + redactSecrets_(e));
    return 'inconnue';
  }
}

/**
 * Vérifie si une URL est accessible et ne renvoie pas une erreur 4xx.
 * @param {string} url L'URL à tester
 * @returns {boolean} true si l'URL répond avec un statut HTTP valide (< 400)
 */
function isUrlValid(url) {
  return checkUrlStatus_(url) === 'valide';
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
    console.warn("Impossible de résoudre la redirection Vertex (" + url + ") : " + redactSecrets_(e));
  }

  return url;
}

/**
 * Nettoie les URL générées par Gemini en s'appuyant sur le grounding et en éliminant les liens 404 et redirections Vertex.
 *
 * Un lien mort n'est JAMAIS remplacé par une autre URL : une source sans rapport avec son libellé
 * produit une réponse crédible mais trompeuse, ce qui est pire qu'une absence de lien.
 *
 * @param {string} text Le texte brut généré par Gemini
 * @param {Object} candidate Le candidat retourné par l'API Gemini
 * @returns {string} Le texte avec les URL vérifiées ou supprimées
 */
function cleanAndValidateUrls(text, candidate) {
  if (!text) return "";

  // Marqueur interne (caractère NUL, absent de tout texte généré) repérant l'emplacement
  // d'une URL supprimée. Il permet de ne nettoyer la ponctuation qu'à cet endroit précis,
  // sans jamais toucher aux deux-points légitimes du texte (« Procédez comme suit : »).
  const DROPPED = '\u0000';

  // 1. Extraire et résoudre les URL de redirection Vertex AI depuis les groundingChunks
  const verifiedUrls = [];
  if (candidate && candidate.groundingMetadata && candidate.groundingMetadata.groundingChunks) {
    candidate.groundingMetadata.groundingChunks.forEach(chunk => {
      if (chunk.web && chunk.web.uri) {
        verifiedUrls.push(resolveRedirectUrl(chunk.web.uri));
      }
    });
  }

  const urlCache = {};
  const isVerified = (a, b) =>
    verifiedUrls.includes(a) || verifiedUrls.includes(b) || isTrustedUrl_(a) || isTrustedUrl_(b);

  // On ne supprime un lien que si son inexistence est PROUVÉE (4xx confirmé).
  // Une vérification impossible (réseau, 5xx, blocage) conserve le lien : un article
  // du Centre d'aide valide ne doit pas disparaître à cause d'un incident passager.
  const isKeepable = (u) => {
    if (urlCache[u] === undefined) urlCache[u] = checkUrlStatus_(u);
    return urlCache[u] !== 'morte';
  };

  // 2. Traiter les liens Markdown [Titre](URL) -> Titre : URL (sans crochets ni parenthèses)
  const markdownLinkRegex = /\[([^\]]+)\]\((https?:\/\/[^\s\)]+)\)/g;
  let cleanedText = text.replace(markdownLinkRegex, (match, label, url) => {
    const targetUrl = resolveRedirectUrl(url);

    if (isVerified(targetUrl, url) || isKeepable(targetUrl)) {
      return `${label} : ${targetUrl}`;
    }

    // Lien invalide : on garde le libellé seul, sans injecter d'URL de remplacement sans rapport
    return label;
  });

  // 3. Traiter les URL brutes restantes (redirections Vertex AI, liens inventés, liens morts)
  const rawUrlRegex = /https?:\/\/[^\s\)\],]+/g;
  cleanedText = cleanedText.replace(rawUrlRegex, (url) => {
    // Un lien officiel ponctué en fin de phrase est rétabli dans sa forme exacte,
    // la ponctuation restant en dehors de l'URL cliquable.
    const trailing = (url.match(/[.,;:!?]+$/) || [''])[0];
    const bareUrl = trailing ? url.slice(0, -trailing.length) : url;
    if (isTrustedUrl_(bareUrl)) {
      return canonicalTrustedUrl_(bareUrl) + trailing;
    }

    const targetUrl = resolveRedirectUrl(url);

    if (isVerified(targetUrl, url) || isKeepable(targetUrl)) {
      return targetUrl;
    }

    return DROPPED;
  });

  // 4. Éliminer les crochets et parenthèses résiduels autour des URL conservées
  cleanedText = cleanedText.replace(/\[(https?:\/\/[^\s\]]+)\]/g, '$1');
  cleanedText = cleanedText.replace(/\((https?:\/\/[^\s\)]+)\)/g, '$1');

  // 5. Nettoyer UNIQUEMENT autour des URL supprimées.
  //    Les deux-points légitimes du texte (« Procédez comme suit : ») ne sont jamais touchés.
  cleanedText = cleanedText
    // Ligne de source devenue vide : « Titre de l'article : <url supprimée> »
    .replace(/^[^\n]*[:：][ \t]*\u0000[ \t]*$/gm, '')
    // Marqueur en milieu de phrase : on retire l'URL et l'éventuel deux-points qui l'introduisait
    .replace(/[ \t]*[:：]?[ \t]*\u0000/g, '')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

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
 * Mesure l'écart entre la proposition de l'IA et le texte finalement publié.
 *
 * Enjeu : une réponse publiée sans retouche ne dit rien du style du Product Expert.
 * La réinjecter comme exemple ferait apprendre au modèle sa propre production, et ses
 * tics d'écriture se renforceraient d'eux-mêmes à chaque génération. Seule la partie
 * réécrite porte de l'information.
 *
 * @param {string} propose Le texte proposé par l'IA
 * @param {string} publie Le texte réellement publié
 * @returns {number} 0 = strictement identique, 1 = entièrement différent
 */
function tauxDeModification_(propose, publie) {
  const normaliser = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

  const a = normaliser(propose);
  const b = normaliser(publie);

  // Sans proposition de référence (ligne mobile, génération en échec), le texte publié
  // est intégralement de la main du PE : on le considère comme entièrement réécrit.
  if (!a || !b) return 1;
  if (a === b) return 0;

  const motsProposes = a.split(' ');
  const motsPublies = b.split(' ');

  const restants = {};
  motsProposes.forEach((mot) => { restants[mot] = (restants[mot] || 0) + 1; });

  let communs = 0;
  motsPublies.forEach((mot) => {
    if (restants[mot] > 0) {
      restants[mot]--;
      communs++;
    }
  });

  const total = Math.max(motsProposes.length, motsPublies.length);
  return total ? 1 - (communs / total) : 1;
}

/**
 * Vide le cache des exemples de style (appelé après l'enregistrement d'une réponse publiée).
 */
function invalidateStyleExamplesCache_() {
  try {
    CacheService.getScriptCache().remove('PE_STYLE_EXAMPLES');
  } catch (e) {
    // Cache indisponible : les exemples seront simplement relus à la prochaine génération
  }
}

/**
 * Retire de la coquille automatique (accueil, clôture, signature) le corps d'une réponse publiée.
 * Seul le corps a valeur d'exemple : la coquille est déjà générée par buildFormattedResponse,
 * et l'accueil contient le prénom de l'auteur, qui n'a rien à faire dans un prompt.
 *
 * @param {string} published Le message publié dans son intégralité
 * @returns {string} Le corps du message, débarrassé de son emballage
 */
function stripReplyShell_(published) {
  let lines = String(published || '').split('\n');

  // Retirer la formule d'accueil initiale, quelle que soit la langue
  while (lines.length && !lines[0].trim()) lines.shift();
  if (lines.length && /^(bonjour|bonsoir|hi|hello|hallo|hola|ciao|salut)\b/i.test(lines[0].trim())) {
    lines.shift();
  }

  // Retirer la signature finale et tout ce qui la suit
  for (let i = lines.length - 1; i >= 0; i--) {
    if (/^fabrice\s*$/i.test(lines[i].trim())) {
      lines = lines.slice(0, i);
      break;
    }
  }

  // Retirer la phrase de clôture, systématiquement en dernière ligne non vide
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  if (lines.length > 1) lines.pop();

  return lines.join('\n').trim();
}

/**
 * Récupère les dernières réponses réellement publiées par le Product Expert,
 * pour les présenter au modèle comme exemples de style.
 *
 * C'est le levier le plus efficace contre le « ça sent l'IA » : une consigne décrit
 * ce qu'il faut éviter, un exemple montre comment la personne écrit vraiment.
 * Le corpus s'enrichit tout seul à mesure que le PE publie.
 *
 * @returns {Array<string>} Les corps de messages publiés, du plus récent au plus ancien
 */
function getStyleExamples_() {
  let cache = null;
  try {
    cache = CacheService.getScriptCache();
    const cached = cache.get('PE_STYLE_EXAMPLES');
    if (cached) return JSON.parse(cached);
  } catch (e) {
    // Cache indisponible : lecture directe de la feuille
  }

  const examples = [];

  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_NAME);
    if (!sheet) return examples;

    const lastRow = sheet.getLastRow();
    if (lastRow < 2 || sheet.getLastColumn() < CONFIG.COL.PUBLISHED) return examples;

    const values = sheet.getRange(2, CONFIG.COL.PUBLISHED, lastRow - 1, 1).getValues();

    for (let i = values.length - 1; i >= 0 && examples.length < CONFIG.STYLE_EXAMPLES_COUNT; i--) {
      const body = stripReplyShell_(values[i][0]);
      // Une réponse très courte n'apprend rien au modèle sur un style d'écriture
      if (body.length < 80) continue;
      // Les exemples traversent le prompt : ils sont expurgés comme le reste
      examples.push(sanitizePii(body).substring(0, 900));
    }
  } catch (e) {
    console.warn("Lecture des exemples de style impossible : " + e.toString());
  }

  try {
    if (cache) cache.put('PE_STYLE_EXAMPLES', JSON.stringify(examples), 1800);
  } catch (e) {
    // Sans cache, la feuille sera relue à chaque génération
  }

  return examples;
}

/**
 * Construit la section d'exemples de style à insérer dans les instructions système.
 * @returns {string} La section, ou une chaîne vide si aucun exemple n'est disponible
 */
function buildStyleExamplesSection_() {
  const examples = getStyleExamples_();
  if (!examples.length) return '';

  const blocks = examples.map(function (example, index) {
    return `Exemple ${index + 1} :\n"""\n${example}\n"""`;
  }).join('\n\n');

  return `

EXEMPLES DU STYLE RÉEL DE CE PRODUCT EXPERT — À IMITER EN PRIORITÉ
Voici ${examples.length === 1 ? 'un message' : 'des messages'} qu'il a réellement publié${examples.length === 1 ? '' : 's'} sur le forum. C'est la référence : longueur, rythme des phrases, niveau de détail, façon d'aller au but, manière de nuancer. Ces exemples priment sur toute description de style donnée plus haut.
N'en recopie ni le contenu technique ni les tournures mot pour mot : seule la manière d'écrire est à reprendre.

${blocks}`;
}

/**
 * Construit les instructions système du modèle.
 *
 * Objectif n°1 : ne jamais produire une procédure générique quand la question est incomplète.
 * Une réponse « plausible mais inapplicable » est immédiatement identifiée comme du remplissage
 * automatique par les autres Product Experts, et n'aide pas la personne qui pose la question.
 *
 * Objectif n°2 : écrire comme un bénévole qui répond vite et bien, pas comme un article de documentation.
 *
 * @returns {string} L'instruction système complète
 */
function buildSystemInstruction_() {
  return `Tu rédiges à la place d'un Product Expert bénévole des forums d'aide Google. Ton texte est publié tel quel sur un forum public, lu par d'autres Product Experts expérimentés qui repèrent immédiatement une réponse générée automatiquement.

RÈGLE ABSOLUE N°1 — NE JAMAIS RÉPONDRE À CÔTÉ
Avant d'écrire quoi que ce soit, vérifie que tu disposes réellement des éléments nécessaires pour donner une réponse juste et applicable.
S'il te manque un élément — source de données non fournie, formule ou message d'erreur non communiqué, version ou plateforme non précisée, contexte ambigu, étapes déjà tentées inconnues — alors tu NE RÉDIGES PAS de procédure. Tu poses une ou deux questions précises, et rien d'autre.
Exemple de ce qu'il ne faut jamais faire : quelqu'un demande comment extraire des données avec IMPORTXML sans indiquer la page source ni ce qu'il veut en extraire. Décrire la syntaxe d'IMPORTXML dans ce cas est inutile : sans source de données, la réponse ne veut rien dire. La bonne réponse est de demander l'URL visée et le contenu recherché.
Une procédure plausible mais inapplicable est le pire résultat possible. Dans le doute, demande.

RÈGLE ABSOLUE N°2 — NE JAMAIS INVENTER
Aucune URL, aucun identifiant d'article, aucun nom de menu, d'option ou de paramètre dont tu n'es pas certain. Utilise uniquement les URL exactes renvoyées par googleSearch. Si tu n'es pas sûr d'un intitulé d'interface, décris l'emplacement sans le nommer précisément.

FORMAT DE SORTIE OBLIGATOIRE
Commence impérativement par ces trois lignes, puis une ligne contenant uniquement ---, puis le message :
LANG: <code de la langue du message d'origine : fr, en, de, es, it, pt, nl...>
STATUT: <REPONSE si tu peux réellement résoudre le problème | CLARIFICATION s'il te manque un élément | HORS_SUJET si la demande ne relève pas de ce forum>
CONFIANCE: <HAUTE si tu es certain | MOYENNE si tu extrapoles un peu | FAIBLE si tu n'es pas sûr>
---
CONFIANCE ne peut être HAUTE que si tu t'appuies sur une source vérifiée ou sur un fonctionnement que tu connais avec certitude.

STYLE DU MESSAGE
- N'écris ni salutation d'ouverture ni formule de clôture ni signature : elles sont ajoutées automatiquement autour de ton texte. Commence directement par le fond.
- 150 mots maximum. 60 mots maximum en mode CLARIFICATION. La ou les lignes de sources ne comptent pas dans cette limite : ne sacrifie jamais un lien officiel pour tenir dans le quota de mots.
- Commence par ce qui débloque réellement la personne, pas par du contexte ni par une reformulation de sa question.
- Si tu reprends un fait précis de son message, fais-le en une demi-phrase, pas en paragraphe.
- Écris en phrases. N'utilise une liste que pour de véritables étapes à exécuter dans l'ordre, cinq au maximum, introduites par des tirets.
- Emploie « je » quand tu donnes un avis ou une limite : « je ne crois pas que ce soit possible sans... ». C'est un bénévole qui parle, pas le support officiel de Google.
- Si la demande est impossible à satisfaire, dis-le dans la première phrase, sans détour et sans compensation artificielle.

FORMULATIONS INTERDITES
N'écris jamais : « Voici les étapes à suivre », « En résumé », « Il est important de noter que », « Il convient de noter que », « N'hésitez pas à », « Je comprends votre frustration », « Bien sûr », « Bien entendu », « Malheureusement », « J'espère que cela vous aidera », « En espérant que cela vous aide », ni aucune phrase qui commente ta propre réponse.
Pas de titres en gras au-dessus des paragraphes, pas de numérotation décorative, pas d'emoji, pas de backticks, pas d'astérisques comme puces, pas de lignes de séparation dans le message.

SOURCES — À FOURNIR SYSTÉMATIQUEMENT DÈS QU'ELLES EXISTENT
Dès que la recherche googleSearch fait remonter un article du Centre d'aide Google pertinent, tu DOIS le citer en fin de réponse. Un lien officiel permet à la personne d'aller plus loin par elle-même et de vérifier ce que tu avances : c'est une plus-value réelle, pas un ornement.
Deux liens au maximum, un seul dans la plupart des cas. Format exact, sur sa propre ligne :
Titre réel de l'article : https://url-exacte
Ni crochets, ni parenthèses autour des liens.
La règle « ne jamais inventer » ne t'autorise pas à te passer de source : elle t'impose de reprendre EXACTEMENT les URL renvoyées par googleSearch, sans en deviner ni en reconstruire aucune. Une URL issue des résultats de recherche est fiable par construction — utilise-la. N'omets un lien que si la recherche n'a réellement rien remonté de pertinent.
Privilégie support.google.com aux blogs et forums tiers.
La procédure officielle de récupération de compte ci-dessous s'ajoute à ce quota, elle ne le consomme pas.

DONNÉES PERSONNELLES
Ne répète jamais une donnée personnelle présente dans la question. Si le message d'origine en contenait, ajoute une seule phrase à la fin rappelant que le forum est public.

CAS PARTICULIER — PERTE D'ACCÈS À UN COMPTE GOOGLE
Reprends en une demi-phrase les moyens de récupération que la personne indique avoir perdus. Si la récupération est manifestement impossible au vu de ces éléments, annonce-le dès la première phrase. Explique la contrainte en une phrase : le système automatisé exige au moins un moyen de récupération actif pour prouver la propriété du compte.

Termine TOUJOURS ce type de réponse par la procédure officielle, sur sa propre ligne et à ce format exact :
Procédure officielle de récupération : https://g.co/recover

C'est le seul canal existant : aucune autre voie, aucun formulaire alternatif, aucun contact humain ne permet de récupérer un compte Google, et il n'existe pas de support téléphonique pour cela. Ne propose jamais de solution de contournement.
Ce lien ne remplace pas la réponse : il la termine. Un message qui se limiterait à ce lien serait sans valeur.
Adapte la phrase qui l'introduit au cas de la personne :
- si elle n'a pas encore tenté la procédure, indique-lui de la suivre depuis un appareil et un lieu qu'elle utilise habituellement pour ce compte, et de répondre à un maximum de questions même approximativement ;
- si elle indique l'avoir déjà tentée sans succès, dis-le clairement : c'est malgré tout la seule voie possible, et la réessayer depuis un appareil déjà utilisé pour se connecter à ce compte, sur son réseau habituel, augmente réellement les chances d'aboutir ;
- si les éléments montrent que la récupération est sans issue, indique que la procédure reste le seul recours mais qu'elle a peu de chances d'aboutir en l'état, plutôt que de laisser espérer.` + buildStyleExamplesSection_();
}

/**
 * Analyse l'en-tête structuré renvoyé par le modèle (LANG / STATUT / CONFIANCE).
 * Tolérant : si l'en-tête est absent ou malformé, le texte entier est traité comme le corps du message.
 *
 * @param {string} raw Le texte brut renvoyé par Gemini
 * @returns {{lang: string, status: string, confidence: string, body: string}}
 */
function parseModelEnvelope_(raw) {
  const text = String(raw || '').replace(/^﻿/, '').trim();
  const result = { lang: '', status: 'REPONSE', confidence: 'MOYENNE', body: text };

  const langMatch = text.match(/^[ \t]*LANG[ \t]*:[ \t]*([A-Za-z\-]{2,5})[ \t]*$/mi);
  const statusMatch = text.match(/^[ \t]*STATUT[ \t]*:[ \t]*(REPONSE|CLARIFICATION|HORS_SUJET)[ \t]*$/mi);
  const confidenceMatch = text.match(/^[ \t]*CONFIANCE[ \t]*:[ \t]*(HAUTE|MOYENNE|FAIBLE)[ \t]*$/mi);

  if (langMatch) result.lang = langMatch[1].toLowerCase();
  if (statusMatch) result.status = statusMatch[1].toUpperCase();
  if (confidenceMatch) result.confidence = confidenceMatch[1].toUpperCase();

  if (!langMatch && !statusMatch && !confidenceMatch) {
    return result;
  }

  // Le séparateur doit suivre immédiatement l'en-tête, pas apparaître au milieu du message
  const separatorIndex = text.search(/^[ \t]*-{3,}[ \t]*$/m);
  if (separatorIndex !== -1 && separatorIndex < 200) {
    result.body = text.slice(separatorIndex).replace(/^[ \t]*-{3,}[ \t]*$/m, '').trim();
  } else {
    result.body = text
      .replace(/^[ \t]*LANG[ \t]*:.*$/mi, '')
      .replace(/^[ \t]*STATUT[ \t]*:.*$/mi, '')
      .replace(/^[ \t]*CONFIANCE[ \t]*:.*$/mi, '')
      .trim();
  }

  return result;
}

/**
 * Filet de sécurité stylistique : supprime les tics d'écriture d'IA qui auraient survécu
 * aux consignes du prompt. Ne touche jamais au fond technique de la réponse.
 *
 * @param {string} body Le corps du message généré
 * @returns {string} Le corps nettoyé
 */
function humanizeBody_(body) {
  if (!body) return "";

  let text = String(body);

  // Formules d'ouverture serviles, en début de message
  text = text.replace(/^(?:Bien sûr|Bien entendu|Certainement|Absolument|Sure|Certainly|Of course|Claro|Natürlich|Certo)\s*[,!.:]\s*/i, '');
  text = text.replace(/^(?:Je comprends (?:votre|ta) frustration|I understand your frustration|Entiendo su frustración)[^.!?]*[.!?]\s*/i, '');

  // Annonces creuses avant une liste
  text = text.replace(/(^|\n)[ \t]*(?:Voici les étapes à suivre|Voici la marche à suivre|Voici comment procéder|Here are the steps(?: to follow)?|Here's how to proceed)[ \t]*:?[ \t]*(?=\n)/gi, '$1');

  // Locutions de remplissage en tête de phrase (la suite est recapitalisée)
  const fillers = [
    'Il est important de noter que',
    'Il convient de noter que',
    'Il est à noter que',
    'À noter que',
    'En résumé,?',
    'Pour résumer,?',
    'It(?:\'|’)s important to note that',
    'Please note that',
    'In summary,?',
    'To summarize,?'
  ];
  fillers.forEach(function (filler) {
    const regex = new RegExp('(^|[.!?]\\s+|\\n)' + filler + '\\s+(\\S)', 'gi');
    text = text.replace(regex, function (match, prefix, firstChar) {
      return prefix + firstChar.toUpperCase();
    });
  });

  // Méta-commentaires de clôture (la coquille en fournit déjà un)
  text = text.replace(/(?:^|\n|\s)(?:J(?:'|’)espère que (?:cela|ceci)[^.!?]*|En espérant que (?:cela|ceci)[^.!?]*|I hope (?:this|that) helps[^.!?]*|Hope this helps[^.!?]*|Espero que (?:esto|ello)[^.!?]*)[.!?]\s*/gi, ' ');

  // « N'hésitez pas à » en phrase autonome uniquement (jamais au milieu d'une phrase utile)
  text = text.replace(/(^|\n)[ \t]*N(?:'|’)hésitez pas à [^.!?\n]*[.!?][ \t]*(?=\n|$)/gi, '$1');

  // Résidus de mise en forme interdits par le prompt
  text = text.replace(/^[ \t]*[-_*]{3,}[ \t]*$/gm, '');
  text = text.replace(/`/g, '');
  text = text.replace(/^[ \t]*\*[ \t]+/gm, '- ');

  // Espaces et lignes vides en excès
  text = text.replace(/[ \t]{2,}/g, ' ');
  text = text.replace(/[ \t]+$/gm, '');
  text = text.replace(/\n{3,}/g, '\n\n');

  return text.trim();
}

/**
 * Sélectionne une variante en évitant de répéter celle utilisée à l'appel précédent.
 * C'est ce qui empêche les réponses successives d'un même Product Expert d'être
 * reconnaissables à leur formule d'accueil et de clôture identiques.
 *
 * @param {Array<string>} list Les variantes disponibles
 * @param {string} memoKey La clé de mémorisation du dernier choix
 * @returns {string} La variante retenue
 */
function pickVariant_(list, memoKey) {
  if (!list || list.length === 0) return '';
  if (list.length === 1) return list[0];

  let previous = '';
  try {
    previous = PropertiesService.getScriptProperties().getProperty(memoKey) || '';
  } catch (e) {
    // Propriétés indisponibles : on se contente d'un tirage aléatoire
  }

  let index = Math.floor(Math.random() * list.length);
  if (list[index] === previous) {
    index = (index + 1) % list.length;
  }

  try {
    PropertiesService.getScriptProperties().setProperty(memoKey, list[index]);
  } catch (e) {
    // Sans mémorisation, la variation reste aléatoire
  }

  return list[index];
}

/**
 * Coquilles de message par langue : accueils et clôtures en plusieurs variantes.
 * Le prénom n'est employé qu'une seule fois (une répétition dans un message court
 * trahit immédiatement un modèle de publipostage).
 */
const REPLY_SHELLS = {
  fr: {
    greetings: ['Bonjour {name},'],
    greetingsWithProduct: [
      'Bonjour {name}, et bienvenue sur la communauté des utilisateurs de {product} !',
      'Bonjour {name}, bienvenue sur le forum {product} !'
    ],
    closings: [
      "Si ça ne débloque rien, redonnez-moi le détail et on regarde ensemble.",
      "Dites-moi si ça avance de votre côté.",
      "Si un point reste flou, répondez ici, j'y reviendrai.",
      "Tenez-moi au courant de ce que ça donne."
    ],
    clarifications: [
      "Avec ces éléments, je pourrai vous répondre précisément.",
      "Dès que j'ai ces informations, je regarde ça.",
      "Répondez-moi avec ces précisions et on avance."
    ]
  },
  en: {
    greetings: ['Hi {name},'],
    greetingsWithProduct: [
      'Hi {name}, and welcome to the {product} community!',
      'Hello {name}, welcome to the {product} forum!'
    ],
    closings: [
      "If that doesn't sort it out, post the details back here and we'll dig further.",
      "Let me know how it goes.",
      "If anything is unclear, just reply here.",
      "Keep me posted."
    ],
    clarifications: [
      "With those details I can give you a precise answer.",
      "Once I have that, I'll take another look.",
      "Reply with those details and we'll move forward."
    ]
  },
  de: {
    greetings: ['Hallo {name},'],
    greetingsWithProduct: [
      'Hallo {name}, und willkommen in der {product}-Community!',
      'Hallo {name}, willkommen im {product}-Forum!'
    ],
    closings: [
      "Wenn das nicht hilft, schreiben Sie die Details hier hinein, dann schauen wir weiter.",
      "Sagen Sie mir gern Bescheid, wie es läuft.",
      "Falls etwas unklar bleibt, antworten Sie einfach hier.",
      "Halten Sie mich auf dem Laufenden."
    ],
    clarifications: [
      "Damit kann ich Ihnen eine genaue Antwort geben.",
      "Sobald ich diese Angaben habe, sehe ich es mir an.",
      "Antworten Sie mit diesen Angaben, dann kommen wir weiter."
    ]
  },
  es: {
    greetings: ['Hola {name}:'],
    greetingsWithProduct: [
      '¡Hola {name}, y bienvenido a la comunidad de {product}!',
      'Hola {name}, ¡bienvenido al foro de {product}!'
    ],
    closings: [
      "Si con eso no se resuelve, cuénteme los detalles y seguimos mirándolo.",
      "Dígame cómo le va.",
      "Si algo no queda claro, responda por aquí.",
      "Manténgame al tanto."
    ],
    clarifications: [
      "Con esos datos podré darle una respuesta precisa.",
      "En cuanto tenga esa información, lo reviso.",
      "Respóndame con esos detalles y avanzamos."
    ]
  },
  it: {
    greetings: ['Ciao {name},'],
    greetingsWithProduct: [
      'Ciao {name}, e benvenuto nella community di {product}!',
      'Ciao {name}, benvenuto sul forum di {product}!'
    ],
    closings: [
      "Se non si sblocca, riscrivi qui i dettagli e ci guardiamo insieme.",
      "Fammi sapere come va.",
      "Se qualcosa non è chiaro, rispondi pure qui.",
      "Tienimi aggiornato."
    ],
    clarifications: [
      "Con questi elementi posso darti una risposta precisa.",
      "Appena ho queste informazioni, ci guardo.",
      "Rispondi con questi dettagli e andiamo avanti."
    ]
  }
};

/**
 * Détecte la langue principale du texte (français, anglais, allemand, espagnol, italien).
 * Utilisé uniquement en repli lorsque le modèle n'a pas renvoyé d'en-tête LANG exploitable.
 * @param {string} text Le texte à analyser
 * @returns {string} Code de langue ('fr', 'en', 'de', 'es', 'it')
 */
function detectLanguage(text) {
  if (!text || typeof text !== 'string') return 'fr';

  const wordLists = {
    fr: /\b(vous|votre|vos|nous|notre|nos|dans|avec|pour|plus|pas|cette|sont|avez|êtes|fait|faire|bonjour|merci|compte|réponse|problème|souhaite|étapes)\b/gi,
    en: /\b(you|your|yours|we|our|ours|with|for|more|not|this|are|have|been|do|make|hello|thanks|account|answer|issue|problem|steps|please)\b/gi,
    de: /\b(sie|ihr|ihre|wir|unser|mit|für|mehr|nicht|diese|sind|haben|sein|tun|machen|hallo|danke|konto|antwort|problem|hilfe|bitte|schritte)\b/gi,
    es: /\b(usted|ustedes|su|sus|nosotros|nuestro|con|para|más|esta|están|hola|gracias|cuenta|respuesta|problema|ayuda|hacer|tengo|pasos)\b/gi,
    it: /\b(voi|vostro|vostra|noi|nostro|con|per|più|non|questa|sono|avete|ciao|grazie|conto|risposta|problema|aiuto|fare|passi)\b/gi
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
 * Assemble le message final : accueil variable + corps généré + clôture variable + signature.
 *
 * @param {string} lang Le code de langue ('fr', 'en', 'de', 'es', 'it')
 * @param {string} displayName Prénom ou pseudo de l'auteur de la question
 * @param {string} product Produit Google concerné
 * @param {string} technicalResponse Corps du message généré par l'IA
 * @param {string} [status] STATUT renvoyé par le modèle (REPONSE, CLARIFICATION, HORS_SUJET)
 * @returns {string} Le message complet prêt à être relu puis publié
 */
function buildFormattedResponse(lang, displayName, product, technicalResponse, status) {
  const shell = REPLY_SHELLS[lang] || REPLY_SHELLS.fr;
  const langKey = REPLY_SHELLS[lang] ? lang : 'fr';
  const name = String(displayName || '').trim();

  // Une clarification avec un grand message de bienvenue sonnerait faux : accueil sobre.
  const isClarification = String(status || '').toUpperCase() === 'CLARIFICATION';

  let greetingPool = shell.greetings.slice();
  if (!isClarification && isKnownProduct_(product)) {
    greetingPool = greetingPool.concat(shell.greetingsWithProduct);
  }

  const greeting = pickVariant_(greetingPool, 'PE_LAST_GREETING_' + langKey)
    .replace('{name}', name)
    .replace('{product}', String(product || '').trim());

  const closingPool = isClarification ? shell.clarifications : shell.closings;
  const closing = pickVariant_(closingPool, 'PE_LAST_CLOSING_' + langKey);

  return [greeting, '', String(technicalResponse || '').trim(), '', closing, '', 'Fabrice'].join('\n');
}

/**
 * Fait appel à l'API Gemini pour rédiger une proposition de réponse à un thread.
 *
 * @param {string} content Le texte brut de la question.
 * @param {string} author L'auteur de la question.
 * @param {string} product Le nom du produit Google.
 * @param {string} [passedApiKey] Clé API Gemini optionnelle transmise dynamiquement (jamais persistée).
 * @returns {{status: string, confidence: string, lang: string, text: string, ok: boolean}}
 */
function generateReply(content, author = "Utilisateur", product = "Google", passedApiKey = "") {
  const apiKey = (passedApiKey && passedApiKey.trim()) ? passedApiKey.trim() : getGeminiApiKey();
  if (!apiKey) {
    return {
      ok: false,
      status: 'ERREUR',
      confidence: 'FAIBLE',
      lang: 'fr',
      text: "Clé API Gemini manquante. Veuillez la configurer via « 🛠️ Suivi PE > Ouvrir le panneau de contrôle »."
    };
  }

  const modelName = getGeminiModelName();
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`;

  const authorName = (author && author.trim()) ? author.trim() : "Utilisateur";
  const sanitizedContent = sanitizePii(content);

  const userTurn = `Produit concerné : ${product}
Prénom affiché de la personne : ${authorName}

Message publié sur le forum :
"""
${sanitizedContent}
"""`;

  const payload = {
    "systemInstruction": {
      "parts": [{ "text": buildSystemInstruction_() }]
    },
    "contents": [{
      "role": "user",
      "parts": [{ "text": userTurn }]
    }],
    "tools": [{
      "googleSearch": {}
    }],
    "generationConfig": {
      // Une température basse produit des tournures quasi identiques d'une réponse à l'autre,
      // ce qui rend la série de messages reconnaissable comme automatisée.
      "temperature": 0.85,
      "topP": 0.95,
      "maxOutputTokens": 1200
    }
  };

  const options = {
    "method": "post",
    "contentType": "application/json",
    // La clé transite par un en-tête et jamais par l'URL : les messages d'exception
    // d'Apps Script incluent l'URL appelée et finiraient dans les journaux et l'interface.
    "headers": { "x-goog-api-key": apiKey },
    "payload": JSON.stringify(payload),
    "muteHttpExceptions": true
  };

  try {
    const response = fetchWithRetry(apiUrl, options);
    const json = JSON.parse(response.getContentText());

    if (json.error) {
      console.error("Erreur API Gemini : " + redactSecrets_(json.error.message));
      return {
        ok: false,
        status: 'ERREUR',
        confidence: 'FAIBLE',
        lang: 'fr',
        text: `Erreur API : ${redactSecrets_(json.error.message)}`
      };
    }

    if (json.candidates && json.candidates.length > 0) {
      const candidate = json.candidates[0];
      const rawText = (candidate.content && candidate.content.parts && candidate.content.parts[0].text)
        ? candidate.content.parts[0].text.trim()
        : '';

      if (!rawText) {
        return {
          ok: false,
          status: 'ERREUR',
          confidence: 'FAIBLE',
          lang: 'fr',
          text: "Le modèle n'a renvoyé aucun texte exploitable."
        };
      }

      const envelope = parseModelEnvelope_(rawText);
      const validated = cleanAndValidateUrls(envelope.body, candidate);
      const humanized = humanizeBody_(validated);

      const lang = REPLY_SHELLS[envelope.lang]
        ? envelope.lang
        : detectLanguage((content || "") + "\n" + humanized);

      return {
        ok: true,
        status: envelope.status,
        confidence: envelope.confidence,
        lang: lang,
        text: buildFormattedResponse(lang, authorName, product, humanized, envelope.status)
      };
    }

    return {
      ok: false,
      status: 'ERREUR',
      confidence: 'FAIBLE',
      lang: 'fr',
      text: "Aucune réponse n'a pu être générée."
    };

  } catch (e) {
    console.error("Exception lors de l'appel Gemini : " + redactSecrets_(e));
    return {
      ok: false,
      status: 'ERREUR',
      confidence: 'FAIBLE',
      lang: 'fr',
      text: "Erreur lors de la communication avec l'API Gemini."
    };
  }
}

/**
 * Ancienne signature conservée pour compatibilité : renvoie uniquement le texte du message.
 * @param {string} content Le texte brut de la question.
 * @param {string} author L'auteur de la question.
 * @param {string} product Le nom du produit Google.
 * @param {string} [passedApiKey] Clé API Gemini optionnelle.
 * @returns {string} Le message généré
 */
function generateSummaryWithGemini(content, author, product, passedApiKey) {
  return generateReply(content, author, product, passedApiKey).text;
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

  const apiUrl = 'https://generativelanguage.googleapis.com/v1beta/models';

  const options = {
    "method": "get",
    "headers": { "x-goog-api-key": apiKey },
    "muteHttpExceptions": true
  };

  try {
    const response = fetchWithRetry(apiUrl, options);
    const json = JSON.parse(response.getContentText());

    if (json.error) {
      throw new Error(redactSecrets_(json.error.message));
    }

    if (json.models) {
      // Filtrer les modèles qui supportent generateContent et extraire le nom court (sans "models/")
      return json.models
        .filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes("generateContent"))
        .map(m => m.name.replace("models/", ""));
    }

    return [];
  } catch (e) {
    throw new Error("Impossible de lister les modèles : " + redactSecrets_(e));
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
