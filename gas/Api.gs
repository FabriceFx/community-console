/**
 * @fileoverview Réception des requêtes externes (Webhook doPost).
 *
 * Le service est sans état : chaque requête est traitée puis oubliée. Aucune
 * question, aucune réponse, aucun suivi n'est conservé — le classeur Google Sheets
 * n'héberge plus que le panneau de réglages, dont la WebApp mobile a besoin.
 *
 * Conséquence sur les relances : le contexte du fil ne peut plus être relu côté
 * serveur, il doit être transmis par l'appelant. L'extension le lit déjà dans la
 * page, c'est même la source la plus fiable — la feuille pouvait, elle, ignorer
 * une réponse rédigée hors de l'outil.
 */

/**
 * Construit une réponse JSON normalisée.
 * @param {Object} obj Le contenu à sérialiser
 * @returns {GoogleAppsScript.Content.TextOutput}
 */
function jsonOutput_(obj) {
  // La version accompagne chaque réponse : elle permet à l'extension de détecter
  // un backend non redéployé, cause de pannes autrement indéchiffrables.
  const charge = obj || {};
  charge.backendVersion = CONFIG.VERSION;

  return ContentService.createTextOutput(JSON.stringify(charge))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Point d'entrée pour les requêtes POST provenant de l'extension Chrome et du bookmarklet.
 *
 * La WebApp étant déployée en accès « N'importe qui », chaque requête doit présenter le
 * secret partagé configuré dans le panneau de contrôle. Sans cette barrière, un tiers
 * connaissant l'URL /exec pourrait consommer le quota Gemini.
 *
 * @param {Object} e Objet d'événement contenant les données POST
 */
function doPost(e) {
  try {
    let data;
    try {
      data = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      return jsonOutput_({ status: "error", message: "Charge utile JSON invalide." });
    }

    // Autorisation d'abord — avant tout appel à Gemini, pour ne pas consommer de quota
    try {
      assertAuthorized_(data.secret);
    } catch (authErr) {
      console.warn("Requête doPost refusée : " + authErr.message);
      return jsonOutput_({ status: "error", code: "unauthorized", message: authErr.message });
    }

    if (data.action === 'followUp') {
      return handleFollowUp_(data);
    }

    return handleNouvelleQuestion_(data);

  } catch (error) {
    // Ce filet attrape aussi les exceptions d'UrlFetchApp, dont le message contient
    // l'URL appelée : il traverse redactSecrets_ avant d'être journalisé ET renvoyé.
    const message = redactSecrets_(error);
    console.error("Erreur critique dans doPost : " + message);
    return jsonOutput_({ status: "error", message: message });
  }
}

/**
 * Rédige une proposition de réponse à une question, sans rien conserver.
 *
 * @param {Object} data La charge utile reçue (author, product, content, apiKey)
 * @returns {GoogleAppsScript.Content.TextOutput}
 */
function handleNouvelleQuestion_(data) {
  const content = String(data.content || '').trim();

  if (!content) {
    return jsonOutput_({ status: "error", message: "Aucun texte de question n'a été transmis." });
  }

  // La clé transmise ne sert qu'à la requête en cours : elle n'est jamais persistée côté
  // serveur, sinon un appelant pourrait écraser la clé API du propriétaire du script.
  const reply = generateReply(
    content,
    data.author || "Auteur inconnu",
    data.product || "Inconnu",
    String(data.apiKey || '').trim()
  );

  return jsonOutput_({
    status: reply.ok ? "success" : "error",
    message: reply.ok ? "Proposition générée." : reply.text,
    summary: reply.text || "",
    replyStatus: reply.status,
    confidence: reply.confidence,
    uiPathUnsourced: !!reply.uiPathUnsourced,
    truncated: !!reply.truncated,
    lang: reply.lang
  });
}

/**
 * Traite une relance : la personne a répondu après le message du Product Expert.
 *
 * Tout le contexte vient de l'appelant, qui a le fil sous les yeux : la question
 * d'origine et la réponse déjà publiée. C'est ce qui permet au garde-fou anti-redite
 * de disposer d'une référence sans qu'aucune donnée ne soit conservée entre deux appels.
 *
 * @param {Object} data La charge utile reçue
 * @returns {GoogleAppsScript.Content.TextOutput}
 */
function handleFollowUp_(data) {
  const followUpText = String(data.followUpText || '').trim();

  if (!followUpText) {
    return jsonOutput_({ status: "error", message: "Aucun message de relance n'a été transmis." });
  }

  // Le texte relevé dans le fil est la seule source possible : sans lui, le garde-fou
  // anti-redite n'a pas de référence et la proposition peut répéter ce qui a déjà
  // été dit. L'appelant en est averti par hadPreviousAnswer.
  const previousAnswer = String(data.previousAnswerFromThread || '').trim();

  const reply = generateFollowUp({
    question: String(data.question || data.title || '').trim(),
    previousAnswer: previousAnswer,
    followUp: followUpText,
    author: data.author || "Utilisateur",
    product: data.product || "Google",
    // Détermine le cadrage : réponse à une relance, ou première intervention
    // sur un fil auquel un autre bénévole a déjà répondu.
    peADejaRepondu: data.peADejaRepondu !== false,
    apiKey: String(data.apiKey || '').trim()
  });

  return jsonOutput_({
    status: reply.ok ? "success" : "error",
    message: reply.ok ? "Proposition générée." : reply.text,
    summary: reply.text || "",
    suite: reply.suite,
    confidence: reply.confidence,
    nothingToAdd: reply.suite === 'RIEN_A_AJOUTER',
    repeatsPrevious: !!reply.repeatsPrevious,
    overlap: reply.overlap || 0,
    truncated: !!reply.truncated,
    hadPreviousAnswer: !!previousAnswer
  });
}

/**
 * Point d'entrée pour la WebApp Mobile (iPhone/iPad/Navigateurs)
 * Servie automatiquement lorsqu'un utilisateur ouvre l'URL WebApp dans son navigateur mobile
 */
function doGet(e) {
  if (e && e.parameter && e.parameter.api === 'json') {
    return jsonOutput_({
      status: "success",
      message: "L'API Community Console PE Tracker est fonctionnelle."
    });
  }

  const template = HtmlService.createTemplateFromFile('MobileUi');
  return template.evaluate()
    .setTitle('Suivi PE - Community Console Mobile')
    .setFaviconUrl('https://www.gstatic.com/images/branding/product/1x/sheets_48dp.png')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
