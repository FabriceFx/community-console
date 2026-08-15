console.log("Community Console PE Tracker activé.");

// Longueur de question transmise à Gemini lorsque le sélecteur précis a fonctionné
const MAX_CONTENT = 10000;
// Plafond bien plus bas pour le repli générique sur les <p> de la page, très bruité
const MAX_FALLBACK_CONTENT = 2000;

/**
 * Enveloppe chrome.storage.local.get dans une Promise, avec repli sur l'ancien
 * stockage synchronisé pour les configurations antérieures à la v1.6.0.
 * @param {Array<string>} keys
 * @returns {Promise<Object>}
 */
function getStorage(keys) {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get(keys, (result) => {
        const local = result || {};
        if (Object.keys(local).some((k) => local[k])) {
          resolve(local);
          return;
        }
        chrome.storage.sync.get(keys, (legacy) => resolve(legacy || {}));
      });
    } catch (e) {
      resolve({});
    }
  });
}

/**
 * Enveloppe chrome.runtime.sendMessage dans une Promise.
 * @param {Object} message
 * @returns {Promise<Object>}
 */
function sendMessage(message) {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(response);
        }
      });
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * Vérifie si un élément du DOM est visible à l'écran.
 * @param {HTMLElement} el
 * @returns {boolean}
 */
function estVisible(el) {
  if (!el) return false;
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;
  const style = window.getComputedStyle(el);
  return style.visibility !== 'hidden' && style.display !== 'none';
}

// Libellés du bouton qui publie effectivement le message.
// « Répondre » / « Reply » en sont volontairement absents : dans la Community Console,
// ce bouton OUVRE l'éditeur, il ne publie pas — c'est même celui que injecterReponse()
// clique par programme. L'y inclure enregistrerait comme publiés des textes qui ne le sont pas.
const LIBELLES_PUBLICATION = [
  'publier',
  'envoyer',
  'poster',
  'publish',
  'post',
  'send',
  'submit'
];

// Libellés à écarter même s'ils contiennent un mot de publication
const LIBELLES_EXCLUS = /annul|cancel|brouillon|draft|supprim|delete|aperçu|preview|modifier|edit\b/;

/**
 * Détermine si un élément cliqué correspond au bouton de publication du forum.
 *
 * On exige que le libellé COMMENCE par un verbe de publication, plutôt que de le
 * contenir : « Publier » et « Publier la réponse » sont acceptés, « Répondre à ce
 * message » ou « Signaler ce post » ne le sont pas.
 *
 * @param {HTMLElement} el L'élément cliqué
 * @returns {boolean}
 */
function estBoutonPublier(el) {
  const texte = (el.innerText || el.textContent || '').trim().toLowerCase();
  const aria = (el.getAttribute('aria-label') || '').trim().toLowerCase();

  return [texte, aria].some((label) => {
    if (!label || label.length > 40) return false;
    if (LIBELLES_EXCLUS.test(label)) return false;

    return LIBELLES_PUBLICATION.some((verbe) =>
      label === verbe || label.startsWith(verbe + ' ')
    );
  });
}

/**
 * Enregistre dans Google Sheets le texte réellement publié sur le forum.
 *
 * C'est la boucle de retour : l'écart entre la proposition de Gemini et le message
 * finalement publié est ce qui décrit le mieux le style du Product Expert. Ces réponses
 * sont ensuite réinjectées dans le prompt comme exemples, et l'outil s'aligne peu à peu.
 *
 * Une réponse publiée sans retouche n'est pas conservée : elle n'apprendrait au modèle
 * que sa propre production, dont les tics se renforceraient à chaque génération. Le
 * backend compare le texte publié à la proposition et ne garde que ce qui a été réécrit.
 *
 * @param {string} text Le texte final présent dans l'éditeur au moment de la publication
 * @returns {Promise<{ok: boolean, modified: boolean, editRatio: number}>}
 */
async function enregistrerReponsePubliee(text) {
  const echec = { ok: false, modified: false, editRatio: 0 };

  const propre = (text || '').trim();
  if (propre.length < 40) return echec;

  try {
    const config = await getStorage(['webappUrl', 'sharedSecret']);
    if (!config.webappUrl || !config.sharedSecret) return echec;

    const response = await sendMessage({
      action: 'sendToWebapp',
      webappUrl: config.webappUrl,
      payload: {
        action: 'recordPublished',
        url: window.location.href,
        publishedText: propre,
        secret: config.sharedSecret
      }
    });

    const data = (response && response.success) ? response.data : null;
    const ok = !!(data && data.status === 'success');

    if (ok) {
      // `modified: false` = proposition reprise telle quelle : rien n'est stocké, et
      // rien n'alimente le style — une réponse non retouchée n'apprend rien au modèle.
      console.log(data.modified
        ? `📝 Réponse retouchée enregistrée (${data.editRatio} % réécrit) : elle servira d'exemple de style.`
        : '📝 Proposition publiée telle quelle : rien à apprendre, rien de stocké.');
    } else {
      console.log('📝 Enregistrement non abouti :', response);
    }

    return { ok: ok, modified: !!(data && data.modified), editRatio: data ? data.editRatio : 0 };
  } catch (e) {
    console.warn("Enregistrement de la réponse publiée impossible :", e);
    return { ok: false, modified: false, editRatio: 0 };
  }
}

// Surveillance de la publication.
// Écoute en phase de capture : le contenu de l'éditeur doit être lu AVANT que le forum
// ne vide le champ. Rien n'est publié par l'extension, on ne fait qu'observer.
let dernierTexteCapture = '';

// Dernier contenu connu de l'éditeur.
// Indispensable : une fois le message publié, le forum retire l'éditeur du DOM. Sans cette
// mémoire, toute capture postérieure à la publication est impossible — c'est précisément
// le moment où l'on pense à cliquer sur « Enregistrer ma version ».
let contenuEditeurMemorise = '';
let captureDejaReussie = false;

/**
 * Lit le texte d'un élément d'édition, qu'il s'agisse d'un champ de formulaire
 * ou d'une zone `contenteditable`.
 * @param {HTMLElement} el
 * @returns {string}
 */
function lireTexteEditeur(el) {
  if (!el) return '';
  return String(el.value !== undefined ? el.value : (el.innerText || '')).trim();
}

/**
 * Choisit le meilleur texte disponible entre l'éditeur encore présent à l'écran
 * et le dernier contenu mémorisé.
 *
 * @param {string} texteLive Texte lu dans l'éditeur au moment du clic ('' s'il a disparu)
 * @param {string} texteMemorise Dernier contenu connu de l'éditeur
 * @returns {string} Le texte à enregistrer, ou '' si aucun n'est exploitable
 */
function choisirTexteACapturer(texteLive, texteMemorise) {
  const live = String(texteLive || '').trim();
  const memo = String(texteMemorise || '').trim();

  // L'éditeur vidé après publication ne doit pas écraser ce que l'on avait mémorisé
  if (live.length >= 40) return live;
  if (memo.length >= 40) return memo;
  return '';
}

/**
 * Mémorise en continu le contenu de la zone de réponse pendant la saisie.
 * C'est ce qui permet d'enregistrer la version finale même après sa publication.
 */
document.addEventListener('input', (event) => {
  const el = event.target;
  if (!el || el.id === 'pe-tracker-btn' || el.id === 'pe-capture-btn') return;

  const estZoneEdition =
    el.tagName === 'TEXTAREA' ||
    el.isContentEditable ||
    (el.getAttribute && el.getAttribute('role') === 'textbox');

  if (!estZoneEdition) return;

  const texte = lireTexteEditeur(el);
  if (texte.length >= 40) {
    contenuEditeurMemorise = texte;
  }
}, true);

document.addEventListener('click', (event) => {
  const cible = event.target.closest ? event.target.closest('button, [role="button"], a, input[type="submit"]') : null;
  if (!cible || cible.id === 'pe-tracker-btn' || cible.id === 'pe-capture-btn') return;
  if (!estBoutonPublier(cible)) return;

  const texte = choisirTexteACapturer(lireTexteEditeur(trouverEditeurReponse()), contenuEditeurMemorise);
  if (!texte || texte === dernierTexteCapture) return;

  dernierTexteCapture = texte;
  enregistrerReponsePubliee(texte).then((res) => {
    if (res.ok) captureDejaReussie = true;
  });
}, true);

/**
 * Recherche le bouton "Répondre" / "Reply" dans le DOM de la Community Console.
 * @returns {HTMLElement|null}
 */
function trouverBoutonRepondre() {
  const selectors = [
    'button[aria-label*="Répondre"]',
    'button[aria-label*="Reply"]',
    '[role="button"][aria-label*="Répondre"]',
    '[role="button"][aria-label*="Reply"]',
    '.scTailwindThreadPostReplybutton',
    '.scTailwindThreadQuestionQuestioncardreply-button',
    '.scTailwindThreadPost_footerReplybutton',
    '[data-stats-id="reply-button"]',
    'button.reply-button',
    '.thread-reply-button',
    'a.reply-button'
  ];

  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el && estVisible(el)) return el;
  }

  const candidateNodes = Array.from(document.querySelectorAll('button, [role="button"], a, div.button'));
  for (const el of candidateNodes) {
    if (el.id === 'pe-tracker-btn') continue;
    const text = (el.innerText || el.textContent || '').trim().toLowerCase();
    const aria = (el.getAttribute('aria-label') || '').toLowerCase();
    if ((text.includes('répondre') || text.includes('reply') || aria.includes('répondre') || aria.includes('reply')) && estVisible(el)) {
      return el;
    }
  }

  return null;
}

/**
 * Recherche l'élément d'édition de la réponse (Contenteditable ou Textarea).
 * @returns {HTMLElement|null}
 */
function trouverEditeurReponse() {
  const editables = Array.from(document.querySelectorAll('[contenteditable="true"], [role="textbox"], textarea'));
  for (const el of editables) {
    if (el.id === 'pe-tracker-btn') continue;
    if (estVisible(el)) {
      return el;
    }
  }

  const selectors = [
    '.scTailwindEditorEditorcontent [contenteditable="true"]',
    '.scTailwindEditorEditorcontent',
    '.editor-content [contenteditable="true"]',
    '.editor-content',
    'textarea'
  ];

  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el && estVisible(el)) return el;
  }

  const iframes = Array.from(document.querySelectorAll('iframe'));
  for (const iframe of iframes) {
    try {
      if (iframe.contentDocument && iframe.contentDocument.body) {
        const body = iframe.contentDocument.body;
        if (body.isContentEditable || body.getAttribute('contenteditable') === 'true') {
          return body;
        }
      }
    } catch (e) {
      // Ignorer iframes cross-domain
    }
  }

  return null;
}

/**
 * Attend l'apparition de l'éditeur de réponse après un clic.
 * @param {number} timeoutMs
 * @returns {Promise<HTMLElement|null>}
 */
function attendreEditeur(timeoutMs = 5000) {
  return new Promise((resolve) => {
    const start = Date.now();
    const interval = setInterval(() => {
      const el = trouverEditeurReponse();
      if (el) {
        clearInterval(interval);
        resolve(el);
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(interval);
        resolve(null);
      }
    }, 200);
  });
}

/**
 * Échappe le HTML pour une insertion sécurisée.
 * @param {string} str
 * @returns {string}
 */
function echapperHtml(str) {
  const div = document.createElement('div');
  div.innerText = str;
  return div.innerHTML;
}

/**
 * Clique sur le bouton Répondre et insère le texte généré dans la zone de réponse.
 * @param {string} text Le texte de la réponse.
 * @returns {Promise<boolean>}
 */
async function injecterReponse(text) {
  if (!text) return false;

  try {
    let editorEl = trouverEditeurReponse();

    if (!editorEl) {
      const replyBtn = trouverBoutonRepondre();
      if (replyBtn) {
        console.log("📌 Clic sur le bouton Répondre...", replyBtn);
        replyBtn.click();
        replyBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
        editorEl = await attendreEditeur(5000);
      }
    }

    if (!editorEl) {
      console.warn("❌ Éditeur de réponse introuvable.");
      return false;
    }

    console.log("✅ Éditeur de réponse localisé :", editorEl);
    editorEl.focus();

    let success = false;

    if (editorEl.isContentEditable || editorEl.getAttribute('contenteditable') === 'true' || editorEl.tagName === 'DIV') {
      try {
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(editorEl);
        selection.removeAllRanges();
        selection.addRange(range);

        success = document.execCommand('insertText', false, text);
      } catch (cmdErr) {
        console.warn("execCommand insertText a échoué, fallback sur innerHTML :", cmdErr);
      }

      if (!success || !editorEl.innerText.trim()) {
        const paragraphsHtml = text
          .split('\n')
          .map(line => line.trim() ? `<p>${echapperHtml(line)}</p>` : '<br>')
          .join('');
        editorEl.innerHTML = paragraphsHtml;
      }

      editorEl.dispatchEvent(new Event('input', { bubbles: true }));
      editorEl.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (editorEl.tagName === 'TEXTAREA' || editorEl.tagName === 'INPUT') {
      editorEl.value = text;
      editorEl.dispatchEvent(new Event('input', { bubbles: true }));
      editorEl.dispatchEvent(new Event('change', { bubbles: true }));
    }

    editorEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return true;

  } catch (e) {
    console.error("Erreur lors de l'injection dans la zone de réponse :", e);
    return false;
  }
}

/**
 * Affiche le bouton de capture manuelle de la réponse publiée.
 * Complément à la détection automatique du clic sur « Publier », qui peut échouer
 * si le forum change ses libellés ou si l'envoi se fait au clavier.
 */
function afficherBoutonCapture() {
  if (document.getElementById('pe-capture-btn')) return;

  const btn = document.createElement('button');
  btn.id = 'pe-capture-btn';
  btn.innerHTML = '📝 Enregistrer ma version';
  btn.title = "Enregistrer le texte actuellement dans l'éditeur comme réponse publiée (alimente le style de l'outil)";

  btn.addEventListener('click', async () => {
    // L'éditeur peut avoir disparu (message déjà publié) : on retombe alors
    // sur le dernier contenu mémorisé pendant la saisie.
    const texte = choisirTexteACapturer(lireTexteEditeur(trouverEditeurReponse()), contenuEditeurMemorise);

    if (!texte) {
      if (captureDejaReussie) {
        alert("✅ Votre réponse a déjà été enregistrée pour ce thread.\n\nElle figure dans la colonne « Réponse publiée » de votre feuille de suivi.");
      } else {
        alert(
          "Aucun texte à enregistrer.\n\n" +
          "L'éditeur est vide ou a déjà été fermé par le forum, et rien n'a été mémorisé pendant la saisie.\n\n" +
          "Si vous avez déjà publié : copiez votre message depuis le fil, collez-le dans la colonne " +
          "« Réponse publiée » de la feuille de suivi. Il alimentera le style au même titre."
        );
      }
      return;
    }

    if (texte === dernierTexteCapture && captureDejaReussie) {
      alert("✅ Cette version a déjà été enregistrée.");
      return;
    }

    btn.disabled = true;
    btn.innerHTML = '⏳ Enregistrement...';

    dernierTexteCapture = texte;
    const res = await enregistrerReponsePubliee(texte);
    if (res.ok) captureDejaReussie = true;

    if (!res.ok) {
      btn.innerHTML = '❌ Échec de l\'enregistrement';
      alert("L'enregistrement a échoué.\n\nVérifiez l'URL de la WebApp et le secret partagé dans les options de l'extension, puis réessayez.");
    } else if (res.modified) {
      btn.innerHTML = `✅ Retouche enregistrée (${res.editRatio} %)`;
    } else {
      // Rien n'est stocké : une proposition publiée telle quelle n'apprend rien au modèle
      btn.innerHTML = 'ℹ️ Proposition non modifiée';
    }

    setTimeout(() => {
      btn.innerHTML = '📝 Enregistrer ma version';
      btn.disabled = false;
    }, 3000);
  });

  document.body.appendChild(btn);
}

/**
 * Extrait les messages du fil, dans l'ordre d'affichage.
 * @returns {Array<string>} Les textes des messages successifs
 */
function extraireMessagesDuFil() {
  const selecteurs = [
    '.scTailwindThreadPostcontentroot',
    '.scTailwindThreadMessageroot',
    '.thread-message-content',
    '.message-content'
  ];

  for (const sel of selecteurs) {
    const noeuds = Array.from(document.querySelectorAll(sel));
    if (noeuds.length) {
      return noeuds
        .map((n) => (n.innerText || '').trim())
        .filter((t) => t.length > 10);
    }
  }

  return [];
}

/**
 * Isole les messages postés APRÈS la réponse du Product Expert.
 *
 * On repère sa réponse par recouvrement de mots plutôt que par égalité stricte :
 * le forum reformate les retours à la ligne et les espaces, et le texte a pu être
 * retouché avant publication.
 *
 * @param {Array<string>} messages Les messages du fil dans l'ordre
 * @param {string} reponsePe La réponse publiée par le Product Expert
 * @returns {string} Les messages postérieurs, concaténés
 */
function isolerRelance(messages, reponsePe) {
  if (!messages || !messages.length) return '';

  const normaliser = (t) => String(t || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const reference = normaliser(reponsePe);

  let indexPe = -1;
  if (reference) {
    const motsRef = reference.split(' ').filter((m) => m.length > 4);

    for (let i = messages.length - 1; i >= 0; i--) {
      const courant = normaliser(messages[i]);
      if (!motsRef.length) break;

      const communs = motsRef.filter((m) => courant.indexOf(m) !== -1).length;
      if (communs / motsRef.length >= 0.5) {
        indexPe = i;
        break;
      }
    }
  }

  // Réponse du PE introuvable : on retient le dernier message du fil, qui est la relance
  const posterieurs = indexPe === -1
    ? messages.slice(-1)
    : messages.slice(indexPe + 1);

  return posterieurs.join('\n\n').trim();
}

/**
 * Affiche le bouton de traitement d'une relance.
 * Présent dès qu'un fil compte plusieurs messages : le Product Expert décide lui-même
 * si la situation s'y prête, plutôt que de laisser une heuristique trancher à sa place.
 */
function afficherBoutonRelance() {
  if (document.getElementById('pe-followup-btn')) return;
  if (extraireMessagesDuFil().length < 2) return;

  const btn = document.createElement('button');
  btn.id = 'pe-followup-btn';
  btn.innerHTML = '💬 Répondre à la relance';
  btn.title = "Générer une réponse au dernier message, sans répéter ce qui a déjà été dit";

  btn.addEventListener('click', async () => {
    const config = await getStorage(['webappUrl', 'sharedSecret']);
    if (!config.webappUrl || !config.sharedSecret) {
      alert("Configurez d'abord l'URL de la WebApp et le secret partagé dans les options de l'extension.");
      return;
    }

    const messages = extraireMessagesDuFil();
    if (messages.length < 2) {
      alert("Ce fil ne contient pas encore de message postérieur à votre réponse.");
      return;
    }

    // Le texte de sa propre réponse sert de repère pour isoler ce qui a suivi
    const relance = isolerRelance(messages, contenuEditeurMemorise || dernierTexteCapture);
    if (!relance) {
      alert("Aucun message postérieur à votre réponse n'a été trouvé dans ce fil.");
      return;
    }

    btn.disabled = true;
    btn.innerHTML = '⏳ Analyse de la relance...';

    try {
      const response = await sendMessage({
        action: 'sendToWebapp',
        webappUrl: config.webappUrl,
        payload: {
          action: 'followUp',
          url: window.location.href,
          followUpText: relance.substring(0, MAX_CONTENT),
          secret: config.sharedSecret
        }
      });

      const data = (response && response.success) ? response.data : null;

      if (!data || data.status !== 'success') {
        alert("Échec : " + (data ? data.message : "réponse invalide du backend"));
        btn.innerHTML = '💬 Répondre à la relance';
        btn.disabled = false;
        return;
      }

      if (data.suite === 'RESOLU') {
        alert("✅ Relance classée « résolue »\n\nLa personne confirme que c'est réglé. La proposition est un simple accusé de réception, et le suivi passe en « Résolue ».");
      }
      if (data.repeatsPrevious) {
        alert("⚠️ Redite détectée\n\nLa proposition reprend " + data.overlap + " % de votre réponse précédente. La personne vient justement d'indiquer que cela n'a pas fonctionné : réécrivez ce texte plutôt que de le publier.");
      }
      if (!data.hadPreviousAnswer) {
        alert("ℹ️ Votre réponse précédente n'est pas enregistrée dans la feuille.\n\nLa proposition a été rédigée sans savoir précisément ce que vous aviez déjà écrit : relisez-la attentivement pour éviter une redite.");
      }
      if (data.truncated) {
        alert("❌ Réponse incomplète : ne publiez pas ce texte tel quel.");
      }

      const texte = data.summary || '';
      if (texte && !data.truncated) {
        const place = await injecterReponse(texte);
        if (!place) {
          try { await navigator.clipboard.writeText(texte); } catch (e) { /* presse-papier indisponible */ }
        }
        btn.innerHTML = place ? '✅ Réponse placée' : '✅ Réponse copiée 📋';
      } else if (texte) {
        try { await navigator.clipboard.writeText(texte); } catch (e) { /* presse-papier indisponible */ }
        btn.innerHTML = '❌ Incomplète (copiée)';
      }
    } catch (e) {
      console.error("Erreur lors du traitement de la relance :", e);
      btn.innerHTML = '❌ Erreur';
    }

    setTimeout(() => {
      btn.innerHTML = '💬 Répondre à la relance';
      btn.disabled = false;
    }, 4000);
  });

  document.body.appendChild(btn);
}

/**
 * Fonction principale : extraire les données et injecter le bouton
 */
function initTracker() {
  if (!window.location.pathname.includes('/thread/')) {
    return;
  }
  
  if (document.getElementById('pe-tracker-btn')) {
    return;
  }

  const btn = document.createElement('button');
  btn.id = 'pe-tracker-btn';
  btn.innerHTML = '📌 Suivre dans Sheets';
  btn.title = "Envoyer ce thread vers votre Google Sheets et préparer la réponse";
  
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.innerHTML = '⏳ Analyse Gemini & Envoi...';
    
    try {
      const storageData = await getStorage(['webappUrl', 'geminiApiKey', 'sharedSecret']);
      const webappUrl = storageData.webappUrl;
      const geminiApiKey = storageData.geminiApiKey || "";
      const sharedSecret = storageData.sharedSecret || "";

      if (!webappUrl) {
        alert("Veuillez d'abord configurer l'URL de la WebApp Google Apps Script dans les options de l'extension (clic sur l'icône de l'extension dans Chrome).");
        btn.disabled = false;
        btn.innerHTML = '📌 Suivre dans Sheets';
        return;
      }

      if (!sharedSecret) {
        alert("Secret partagé manquant.\n\nGénérez-le dans Google Sheets via « 🛠️ Suivi PE > Ouvrir le panneau de contrôle », puis recopiez-le dans les options de l'extension.");
        btn.disabled = false;
        btn.innerHTML = '📌 Suivre dans Sheets';
        return;
      }

      let title = "Titre inconnu";
      let author = "Auteur inconnu";
      let product = "Inconnu";
      let content = "";
      
      try {
        const titleEl = document.querySelector('.scTailwindThreadQuestionQuestioncardtitle, h1');
        if (titleEl) title = titleEl.innerText.trim();
        else title = document.title;
        
        const authorEl = document.querySelector('.scTailwindThreadPost_headerUserinfoname, .user-name, [data-stats-id="user-name"]');
        if (authorEl) {
          author = authorEl.innerText.trim();
        } else {
          const authorNode = document.evaluate('//*[contains(text(), "Auteur d\'origine")]/preceding-sibling::* | //*[contains(text(), "Auteur d\'origine")]/..', document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
          if (authorNode && authorNode.innerText) author = authorNode.innerText.replace("Auteur d'origine", "").trim();
        }

        const productEl = document.querySelector('.scTailwindThreadQuestionForumtitleroot, a[href^="/s/community/forum/"]');
        if (productEl) product = productEl.innerText.trim();
        
        const contentEl = document.querySelector('.scTailwindThreadPostcontentroot, .message-content, .thread-message-content');
        if (contentEl) {
          content = contentEl.innerText.trim();
        } else {
          // Repli très imprécis : il ramasse aussi la navigation, le pied de page et les
          // autres réponses du fil. On le plafonne bas pour ne pas noyer la vraie question.
          const contentEls = document.querySelectorAll('p');
          if (contentEls && contentEls.length > 0) {
            content = Array.from(contentEls)
              .map(el => el.innerText.trim())
              .filter(t => t)
              .join('\n\n')
              .substring(0, MAX_FALLBACK_CONTENT);
          }
        }

        const detailsEl = document.querySelector('.scTailwindThreadQuestionQuestiondetailsdetails');
        if (detailsEl) {
          content += "\n\nDétails techniques : " + detailsEl.innerText.trim();
        } else {
          const detailsNode = document.evaluate('//*[text()="Détails"]/following-sibling::*', document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
          if (detailsNode) content += "\n\nDétails techniques : " + detailsNode.innerText.trim();
        }
        
      } catch (e) {
        console.error("Erreur lors de l'extraction des données DOM :", e);
      }
      
      content = content.substring(0, MAX_CONTENT);

      const payload = {
        title: title,
        url: window.location.href,
        author: author,
        product: product,
        content: content,
        apiKey: geminiApiKey,
        secret: sharedSecret
      };

      console.log("📡 Transmission au Service Worker (" + content.length + " caractères de contenu)");

      let response;
      try {
        response = await sendMessage({
          action: 'sendToWebapp',
          webappUrl: webappUrl,
          payload: payload
        });
      } catch (msgErr) {
        console.error("Erreur de communication avec l'extension :", msgErr);
        if (msgErr.message && msgErr.message.includes('invalidated')) {
          alert("L'extension a été rechargée. Veuillez simplement rafraîchir cette page (F5) et cliquer à nouveau sur le bouton.");
        } else {
          alert("Erreur de communication avec l'extension Chrome : " + (msgErr.message || msgErr));
        }
        btn.disabled = false;
        btn.innerHTML = '📌 Suivre dans Sheets';
        return;
      }

      console.log("Réponse reçue :", response);

      const data = (response && response.success && response.data) ? response.data : null;

      if (data && data.status === 'error') {
        alert("Le backend a refusé la demande :\n\n" + (data.message || 'Erreur inconnue'));
        btn.innerHTML = '❌ Refusé';
        btn.style.backgroundColor = '#d93025';
        return;
      }

      const summaryText = data ? (data.summary || "") : "";

      // Avertir AVANT relecture quand la proposition ne doit pas être publiée telle quelle.
      // C'est ce garde-fou qui évite de poster une procédure générique sur une question
      // à laquelle il manque un élément (source de données, message d'erreur, version...).
      if (data && data.truncated) {
        alert("❌ Réponse incomplète\n\nLa génération s'est interrompue en cours de rédaction, même après une relance avec un budget doublé.\n\nLe texte n'a pas été placé dans le champ de réponse pour éviter toute publication accidentelle : il a été copié dans le presse-papier. Relancez l'analyse ou rédigez la réponse à la main.");
      } else if (data && data.replyStatus === 'CLARIFICATION') {
        alert("⚠️ Informations insuffisantes\n\nCe thread ne contient pas les éléments nécessaires pour une réponse fiable.\n\nGemini a rédigé une demande de précisions plutôt qu'une procédure : une procédure générique serait plausible mais inapplicable.");
      } else if (data && data.replyStatus === 'HORS_SUJET') {
        alert("⚠️ Demande hors sujet\n\nRelisez entièrement la proposition avant toute publication.");
      } else if (data && data.uiPathUnsourced) {
        alert("⚠️ Chemin d'interface non sourcé\n\nLa réponse décrit une suite d'étapes (« cliquez sur… puis sélectionnez… ») sans qu'aucune source n'ait été consultée : les libellés viennent de la mémoire du modèle, donc d'un état passé de l'interface.\n\nVérifiez chaque nom de menu dans l'interface réelle avant de publier. Les options Google sont fréquemment renommées, déplacées ou supprimées.");
      } else if (data && data.confidence === 'FAIBLE') {
        alert("⚠️ Confiance faible\n\nGemini signale qu'il extrapole sur cette réponse. Vérifiez chaque affirmation avant de publier.");
      }

      if (summaryText && data && data.truncated) {
        // Une phrase coupée en plein milieu ne doit pas atterrir dans le champ de
        // réponse : le risque de la publier par réflexe est trop élevé.
        try { await navigator.clipboard.writeText(summaryText); } catch (clipErr) { /* presse-papier indisponible */ }
        btn.innerHTML = '❌ Réponse incomplète';
        btn.style.backgroundColor = '#d93025';
      } else if (summaryText) {
        const reponsePlacee = await injecterReponse(summaryText);

        if (reponsePlacee) {
          btn.innerHTML = '✅ Envoyé & Réponse placée !';
          btn.style.backgroundColor = '#0f9d58';
          // Amorcer la mémoire avec le texte injecté : si le PE publie sans rien modifier,
          // aucun événement `input` ne se déclenche et il n'y aurait rien à enregistrer.
          contenuEditeurMemorise = summaryText.trim();
          // Filet de sécurité : si la détection automatique du clic sur « Publier »
          // échoue (libellé inattendu, envoi au clavier), la capture reste possible à la main.
          afficherBoutonCapture();
        } else {
          try {
            await navigator.clipboard.writeText(summaryText);
            btn.innerHTML = '✅ Envoyé (Réponse copiée 📋)';
            btn.style.backgroundColor = '#0f9d58';
            alert("Thread enregistré dans Sheets ! La réponse générée a été copiée dans votre presse-papier.");
          } catch (clipErr) {
            btn.innerHTML = '✅ Envoyé dans Sheets !';
            btn.style.backgroundColor = '#0f9d58';
          }
        }
      } else {
        btn.innerHTML = '✅ Envoyé dans Sheets !';
        btn.style.backgroundColor = '#0f9d58';
      }

    } catch (globalError) {
      console.error("Erreur fatale dans le script de suivi :", globalError);
      btn.innerHTML = '❌ Erreur Script';
      btn.style.backgroundColor = '#d93025';
    } finally {
      setTimeout(() => {
        btn.innerHTML = '📌 Suivre dans Sheets';
        btn.style.backgroundColor = '';
        btn.disabled = false;
      }, 4000);
    }
  });

  document.body.appendChild(btn);
}

// Observation DOM pour la gestion SPA.
// Throttle et non debounce : sur une page qui mute en continu (horodatages relatifs,
// indicateurs de présence), un debounce se réarme indéfiniment et le bouton n'apparaît jamais.
let throttleTimer = null;
const observer = new MutationObserver(() => {
  if (throttleTimer) return;
  initTracker();
  throttleTimer = setTimeout(() => {
    throttleTimer = null;
  }, 300);
});

observer.observe(document.body, { childList: true, subtree: true });

// Lancement initial
setTimeout(initTracker, 1500);
