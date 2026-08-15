// Le numéro de version permet de vérifier d'un coup d'œil que le rechargement de
// l'extension a bien pris effet — un content script obsolète reste sinon invisible.
console.log(
  "%c[PE Tracker] v" +
  ((chrome.runtime && chrome.runtime.getManifest) ? chrome.runtime.getManifest().version : '?') +
  " activé.",
  'color:#1a73e8;font-weight:bold'
);

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
 * Recherche la commande « Ajouter un commentaire » qui suit un message donné.
 *
 * Dans la Community Console, « Répondre » ouvre une NOUVELLE réponse au fil : c'est la
 * commande de la première intervention. Une relance se commente, et la commande à
 * actionner est celle placée SOUS le message du demandeur — pas celle de la réponse
 * du Product Expert, qui se trouve plus haut dans le fil.
 *
 * @param {HTMLElement} [messageCible] Le message après lequel chercher la commande
 * @returns {HTMLElement|null}
 */
function trouverBoutonCommenter(messageCible) {
  const estCommande = (el) => {
    const texte = ((el.innerText || el.textContent || '') + ' ' + (el.getAttribute('aria-label') || ''))
      .trim().toLowerCase();
    return /ajouter un commentaire|add a comment|commenter\b|^comment$/.test(texte) && texte.length < 40;
  };

  const candidats = Array.from(document.querySelectorAll('button, [role="button"], a'))
    .filter((el) => estCommande(el) && estVisible(el));

  if (!candidats.length) return null;

  // La bonne commande est la première qui suit le message visé dans l'ordre du document
  if (messageCible && messageCible.compareDocumentPosition) {
    const SUIT = (typeof Node !== 'undefined' && Node.DOCUMENT_POSITION_FOLLOWING) ? Node.DOCUMENT_POSITION_FOLLOWING : 4;
    const apres = candidats.filter((c) => (messageCible.compareDocumentPosition(c) & SUIT) !== 0);
    if (apres.length) return apres[0];
  }

  // À défaut, la dernière commande de la page correspond à l'échange le plus récent
  return candidats[candidats.length - 1];
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
 * Ouvre la zone d'édition appropriée et y insère le texte généré.
 *
 * Deux commandes distinctes selon le contexte :
 *  - « Répondre » ouvre une NOUVELLE réponse au fil : c'est la première intervention ;
 *  - « Ajouter un commentaire » poursuit l'échange sous une réponse existante, ce qui
 *    est le geste attendu pour traiter une relance.
 *
 * @param {string} text Le texte de la réponse.
 * @param {string} [mode] 'reponse' (défaut) ou 'commentaire'
 * @param {HTMLElement} [messageCible] Message sous lequel commenter (le dernier du fil)
 * @returns {Promise<boolean>}
 */
async function injecterReponse(text, mode, messageCible) {
  if (!text) return false;

  const enCommentaire = mode === 'commentaire';

  try {
    // En mode commentaire, on ouvre systématiquement la zone visée : un éditeur déjà
    // présent serait celui d'une nouvelle réponse, au mauvais endroit du fil.
    let editorEl = enCommentaire ? null : trouverEditeurReponse();

    if (!editorEl) {
      const bouton = enCommentaire ? trouverBoutonCommenter(messageCible) : trouverBoutonRepondre();

      if (!bouton && enCommentaire) {
        console.warn("❌ Commande « Ajouter un commentaire » introuvable.");
        return false;
      }

      if (bouton) {
        console.log((enCommentaire ? "💬 Clic sur Ajouter un commentaire..." : "📌 Clic sur le bouton Répondre..."), bouton);
        bouton.click();
        bouton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
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
        console.log("[PE Tracker] execCommand insertText indisponible, repli sur innerHTML.", cmdErr);
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
 * Extrait les informations du thread depuis le DOM : titre, auteur, produit, question.
 * @returns {{title: string, author: string, product: string, content: string}}
 */
function extraireInfosThread() {
  let title = "Titre inconnu";
  let author = "Auteur inconnu";
  let product = "Inconnu";
  let content = "";

  try {
    const titleEl = document.querySelector('.scTailwindThreadQuestionQuestioncardtitle, h1');
    title = titleEl ? titleEl.innerText.trim() : document.title;

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
      const contentEls = document.querySelectorAll('p');
      if (contentEls && contentEls.length > 0) {
        content = Array.from(contentEls).map(el => el.innerText.trim()).filter(t => t).join('\n\n').substring(0, MAX_FALLBACK_CONTENT);
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

  return { title: title, author: author, product: product, content: content.substring(0, MAX_CONTENT) };
}

/**
 * Retrouve l'auteur d'un bloc de message en remontant dans ses ancêtres.
 *
 * On s'arrête dès qu'un ancêtre contient PLUSIEURS noms d'utilisateur : cela signifie
 * qu'on a dépassé le message et atteint le conteneur du fil entier. Sans cette garde,
 * tous les messages se verraient attribuer le nom du premier intervenant.
 *
 * @param {HTMLElement} contenu Le nœud de contenu du message
 * @returns {string} Le nom de l'auteur, ou '' s'il est introuvable
 */
function auteurDuBloc(contenu) {
  const SELECTEUR_NOM = '.scTailwindThreadPost_headerUserinfoname, [data-stats-id="user-name"], .user-name, .scTailwindUserUsername';

  let el = contenu;
  let dernierNom = '';

  for (let niveau = 0; niveau < 8 && el; niveau++) {
    const noms = el.querySelectorAll ? Array.from(el.querySelectorAll(SELECTEUR_NOM)) : [];

    if (noms.length === 1) {
      dernierNom = (noms[0].innerText || '').trim();
    } else if (noms.length > 1) {
      // Conteneur englobant plusieurs messages : on ne monte pas plus haut
      break;
    }

    el = el.parentElement;
  }

  return dernierNom;
}

// Marqueurs d'interface à retirer du corps d'un message : badges, horodatages, actions.
const LIGNES_PARASITES = [
  // Badges d'auteur
  /^expert produit/i,
  /^product expert/i,
  /^auteur d[e'’ ]origine$/i,
  /^original poster$/i,
  // Horodatages
  /^il y a .{1,20}$/i,
  /^\d+\s*(min|h|j|mois|an)s?$/i,
  /^\d+\s*(minute|hour|day|month|year)s?$/i,
  // Actions proposées sous chaque message
  /^recommander$/i,
  /^recommend$/i,
  /^ajouter un commentaire$/i,
  /^add a comment$/i,
  /^répondre( au post d[e'’ ]origine)?$/i,
  /^reply( to original post)?$/i,
  /^j[e'’ ]ai la même question/i,
  /^i have the same question/i,
  /^se désabonner$/i,
  /^s[e'’ ]abonner$/i,
  /^(un)?subscribe$/i,
  // Compteurs et états affichés dans la carte de question
  /^\d+\s*(vue|view)/i,
  /^\d+\s*(recommandation|réponse|reponse|answer|repl)/i,
  /^verrouillé/i,
  /^locked/i,
  /^cette question est partiellement verrouillée/i,
  /^this question is partially locked/i,
  // Avertissement de bas de carte
  /^il se peut que les contenus de la communauté/i,
  /^community content may not be verified/i,
  /^en savoir plus$/i,
  /^learn more$/i,
  /^détails$/i,
  /^details$/i,
  // Niveaux d'expertise apparaissant entre parenthèses à côté du nom
  /^\(expert produit[^)]*\)$/i,
  /^\(product expert[^)]*\)$/i
];

// Cartes qui ne sont pas des messages : notifications système comportant elles aussi
// un lien vers un profil, ce qui les fait passer pour des réponses.
// Note : \b est fondé sur l'alphabet ASCII en JavaScript. Après « recommandé », le « é »
// n'étant pas un caractère de mot, aucune limite de mot n'existe à cet endroit et un
// motif terminé par \b n'y correspond jamais. Les mots accentués sont donc laissés nus.
const CARTES_NON_MESSAGES = [
  /^.{0,90}\ba recommandé/i,
  /^.{0,90}\brecommended this\b/i,
  /^.{0,90}\ba marqué.{0,40}réponse/i,
  /^.{0,90}\bmarked this as\b/i,
  /^.{0,90}\ba épinglé/i,
  /^.{0,90}\bpinned this\b/i
];

/**
 * Nettoie un nom d'auteur extrait du lien de profil.
 *
 * Les badges (« Auteur d'origine », niveau d'expertise) sont imbriqués dans le lien :
 * leur texte remonte avec le nom et donnait des libellés du type
 * « Ornella PASSAAuteur d'origine ».
 *
 * @param {string} brut Le texte du lien de profil
 * @returns {string} Le nom seul
 */
function nettoyerNomAuteur(brut) {
  const lignes = String(brut || '')
    .replace(/\u00a0/g, ' ')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !LIGNES_PARASITES.some((r) => r.test(l)));

  return lignes.length ? lignes[0] : '';
}

// Mentions signalant qu'un fil est verrouillé, totalement ou en partie
const MARQUEURS_VERROU = /verrouill[ée]|partially locked|this question is locked/i;

/**
 * Détecte l'état de verrouillage du fil.
 *
 * Un fil partiellement verrouillé n'accepte que les réponses des Product Experts et
 * de l'auteur d'origine : c'est une information utile au suivi, et elle explique
 * pourquoi personne d'autre n'intervient.
 *
 * @returns {boolean}
 */
function filVerrouille() {
  const texte = (document.body && document.body.innerText) ? document.body.innerText : '';
  return MARQUEURS_VERROU.test(texte);
}

/**
 * Nettoie le texte d'une carte de message des éléments d'interface qui l'entourent.
 * @param {string} texte Le texte brut de la carte
 * @param {string} auteur Le nom de l'auteur, à retirer de l'en-tête
 * @returns {string}
 */
function nettoyerCorpsMessage(texte, auteur) {
  // Cette interface emploie des espaces insécables : sans normalisation, les motifs
  // écrits avec une espace ordinaire ne reconnaissent pas « 2<nbsp>vues ».
  return String(texte || '')
    .replace(/\u00a0/g, ' ')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => {
      if (!l) return false;
      if (auteur && l === auteur) return false;
      return !LIGNES_PARASITES.some((r) => r.test(l));
    })
    .join('\n')
    .trim();
}

/**
 * Repère les cartes de réponse à partir des liens vers les profils utilisateurs.
 *
 * Cette voie ne dépend d'aucun nom de classe : elle s'appuie sur la structure même
 * de la page — chaque réponse porte un lien vers le profil de son auteur. Les classes
 * `scTailwind*` sont générées et peuvent changer sans préavis.
 *
 * @returns {Array<{author: string, text: string, isOriginalPoster: boolean}>}
 */
function cartesParLienProfil() {
  const SELECTEUR_PROFIL = 'a[href*="/community/user/"], a[href*="/profile/"], a[href*="/user/"]';
  const liens = Array.from(document.querySelectorAll(SELECTEUR_PROFIL));
  const cartes = [];
  const dejaVues = [];

  liens.forEach((lien) => {
    const auteur = nettoyerNomAuteur(lien.innerText);
    if (!auteur || auteur.length > 60) return;

    let el = lien.parentElement;
    let carte = null;

    for (let niveau = 0; niveau < 8 && el; niveau++) {
      // Un ancêtre contenant plusieurs liens de profil englobe plusieurs réponses :
      // on ne monte pas plus haut sous peine de fusionner les messages.
      if (el.querySelectorAll(SELECTEUR_PROFIL).length > 1) break;
      if ((el.innerText || '').trim().length > 60) carte = el;
      el = el.parentElement;
    }

    if (!carte || dejaVues.indexOf(carte) !== -1) return;
    dejaVues.push(carte);

    const brut = (carte.innerText || '').trim();
    const corps = nettoyerCorpsMessage(brut, auteur);
    if (corps.length < 10) return;

    // Écarter les notifications système : elles portent un lien de profil sans
    // constituer un message du fil.
    if (CARTES_NON_MESSAGES.some((r) => r.test(corps))) return;

    cartes.push({
      author: auteur,
      text: corps,
      // Référence conservée pour retrouver les commandes propres à cette carte
      element: carte,
      // Badge posé par le forum sur les messages de la personne ayant posé la question
      isOriginalPoster: /auteur d[e\u0027\u2019 ]origine|original poster/i.test(brut)
    });
  });

  return cartes;
}

/**
 * Extrait le fil structuré : chaque message avec son auteur, dans l'ordre d'affichage.
 *
 * Deux voies, la plus robuste d'abord : la structure de la page (liens de profil),
 * puis les noms de classes connus en secours.
 *
 * @returns {Array<{author: string, text: string, isOriginalPoster: boolean}>}
 */
function extraireFilStructure() {
  const parStructure = cartesParLienProfil();
  if (parStructure.length) return parStructure;

  const selecteurs = [
    '.scTailwindThreadPostcontentroot',
    '.scTailwindThreadMessageroot',
    '.thread-message-content',
    '.message-content'
  ];

  for (const sel of selecteurs) {
    const noeuds = Array.from(document.querySelectorAll(sel));
    if (!noeuds.length) continue;

    const messages = noeuds
      .map((n) => ({
        author: auteurDuBloc(n),
        text: (n.innerText || '').trim(),
        element: n,
        isOriginalPoster: false
      }))
      .filter((m) => m.text.length > 10);

    if (messages.length) return messages;
  }

  return [];
}

/**
 * Détermine l'auteur de la question à partir du badge « Auteur d'origine ».
 *
 * Bien plus fiable que de supposer qu'il s'agit du premier message : sous
 * « Toutes les réponses », le premier message est celui du Product Expert,
 * la question figurant dans un encart séparé au-dessus.
 *
 * @param {Array} messages Le fil structuré
 * @returns {string} Le nom du demandeur, ou '' s'il n'est pas identifiable
 */
function trouverDemandeur(messages) {
  const marque = (messages || []).filter((m) => m.isOriginalPoster);
  if (marque.length) return marque[0].author;
  return '';
}

/**
 * Diagnostic à exécuter dans la console du navigateur pour vérifier l'extraction.
 * Affiche ce qui a été reconnu, afin d'ajuster les sélecteurs si l'interface évolue.
 */
let diagnosticAffiche = false;
let tentativesDiagnostic = 0;

// La Community Console rend son contenu après coup : les premières inspections du DOM
// tombent régulièrement à vide. Le constat n'est donc établi qu'après plusieurs essais.
const MAX_TENTATIVES_DIAGNOSTIC = 12;

// Passe à true dès que le fil a été lu, ou que le quota d'essais est épuisé.
// Évite de relancer une extraction coûteuse à chaque mutation du DOM.
let analyseTerminee = false;

/**
 * Affiche une fois par page le résultat de la lecture du fil.
 *
 * Un content script s'exécute dans un monde isolé : une fonction exposée sur `window`
 * n'est pas appelable depuis la console, qui vise par défaut le contexte de la page.
 * Le diagnostic doit donc s'afficher de lui-même.
 */
function diagnostiquerUneFois() {
  if (diagnosticAffiche) return;
  diagnosticAffiche = true;

  const messages = extraireFilStructure();

  if (!messages.length) {
    tentativesDiagnostic++;

    // Tant que le quota d'essais n'est pas épuisé, l'absence de contenu signifie
    // simplement que la page n'a pas fini de se construire : rien à signaler.
    if (tentativesDiagnostic < MAX_TENTATIVES_DIAGNOSTIC) return;

    diagnosticAffiche = true;
    analyseTerminee = true;
    // console.log et non console.warn : un avertissement émis par un content script est
    // consigné comme une erreur dans la page des extensions, ce qui alarme sans raison.
    console.log(
      "%c[PE Tracker] Aucun message lu après " + MAX_TENTATIVES_DIAGNOSTIC + " tentatives. " +
      "Liens de profil trouvés : " + document.querySelectorAll('a[href*="/user/"], a[href*="/community/user/"], a[href*="/profile/"]').length +
      " — si ce nombre est nul, les sélecteurs doivent être adaptés à cette interface.",
      'color:#5f6368'
    );
    return;
  }

  analyseTerminee = true;

  const demandeur = trouverDemandeur(messages);
  console.log(
    "%c[PE Tracker] " + messages.length + " message(s) lu(s) — demandeur : " +
    (demandeur || 'non identifié') + (filVerrouille() ? ' — fil verrouillé' : ''),
    'color:#0f9d58'
  );
  messages.forEach((m, i) => {
    console.log(
      "  " + (i + 1) + ". " + (m.author || '(auteur inconnu)') +
      (m.isOriginalPoster ? ' [auteur d\'origine]' : '') +
      ' — ' + m.text.slice(0, 60).replace(/\n/g, ' ') + '…'
    );
  });

  // Expliciter la décision d'affichage du bouton de relance : sans cela, un bouton
  // absent ou présent à tort ne peut être diagnostiqué que par tâtonnement.
  getStorage(['peDisplayName']).then((config) => {
    const nom = config.peDisplayName || '';

    if (!nom) {
      console.log("%c[PE Tracker] Nom d'affichage non renseigné : vos messages ne peuvent pas être distingués. À saisir dans les options de l'extension.", 'color:#f29900');
      return;
    }

    const miens = messages.filter((m) => memeAuteur(m.author, nom));
    const posterieurs = isolerRelanceStructuree(messages, nom, '').messages;
    const affiche = doitAfficherRelance(messages, nom);

    let raison;
    if (!miens.length) raison = "vous n'êtes pas encore intervenu sur ce fil";
    else if (!posterieurs.length) raison = 'votre message est le dernier du fil';
    else raison = posterieurs.length + ' message(s) posté(s) depuis votre réponse';

    console.log(
      "%c[PE Tracker] Nom configuré : « " + nom + " » — " + miens.length + " message(s) à vous — " +
      "bouton de relance " + (affiche ? 'affiché' : 'masqué') + " (" + raison + ")",
      affiche ? 'color:#f29900' : 'color:#5f6368'
    );
  });
}

window.__peTrackerDiagnostic = function () {
  const messages = extraireFilStructure();
  console.log('%c=== Diagnostic PE Tracker ===', 'font-weight:bold');
  console.log('Messages détectés :', messages.length);
  messages.forEach((m, i) => {
    console.log(
      (i + 1) + '. ' + (m.author || '(auteur inconnu)') +
      (m.isOriginalPoster ? '  [AUTEUR D\'ORIGINE]' : '') +
      ' — ' + m.text.slice(0, 70).replace(/\n/g, ' ') + '…'
    );
  });
  console.log('Demandeur identifié :', trouverDemandeur(messages) || '(aucun)');
  console.log('Fil verrouillé :', filVerrouille() ? 'oui' : 'non');
  return messages;
};

/**
 * Conserve la compatibilité avec les appels ne nécessitant que les textes.
 * @returns {Array<string>}
 */
function extraireMessagesDuFil() {
  return extraireFilStructure().map((m) => m.text);
}

/**
 * Compare deux noms d'affichage de façon tolérante (casse, accents, espaces).
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function memeAuteur(a, b) {
  const normaliser = (v) => String(v || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]/g, '');

  const x = normaliser(a);
  const y = normaliser(b);
  return !!x && !!y && (x === y || x.indexOf(y) !== -1 || y.indexOf(x) !== -1);
}

/**
 * Isole les messages postés APRÈS le dernier message du Product Expert.
 *
 * Trois stratégies, de la plus fiable à la plus dégradée :
 *  1. par nom d'affichage du PE — le seul repère stable d'une session à l'autre ;
 *  2. par recouvrement de mots avec sa réponse, si elle est encore en mémoire ;
 *  3. dernier message du fil, en signalant l'incertitude.
 *
 * @param {Array<{author: string, text: string}>} messages Le fil structuré
 * @param {string} nomPe Nom d'affichage du Product Expert sur le forum
 * @param {string} reponsePe Sa réponse publiée, si elle est connue
 * @returns {{messages: Array, methode: string, fiable: boolean}}
 */
function isolerRelanceStructuree(messages, nomPe, reponsePe) {
  if (!messages || !messages.length) {
    return { messages: [], methode: 'aucun message', fiable: false };
  }

  // 1. Repérage par nom d'affichage
  if (nomPe) {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (memeAuteur(messages[i].author, nomPe)) {
        return { messages: messages.slice(i + 1), methode: 'nom du Product Expert', fiable: true };
      }
    }
  }

  // 2. Repérage par recouvrement avec la réponse publiée
  const normaliser = (t) => String(t || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const reference = normaliser(reponsePe);

  if (reference) {
    const motsRef = reference.split(' ').filter((m) => m.length > 4);
    if (motsRef.length) {
      for (let i = messages.length - 1; i >= 0; i--) {
        const courant = normaliser(messages[i].text);
        const communs = motsRef.filter((m) => courant.indexOf(m) !== -1).length;
        if (communs / motsRef.length >= 0.5) {
          return { messages: messages.slice(i + 1), methode: 'contenu de votre réponse', fiable: true };
        }
      }
    }
  }

  // 3. Repli : le dernier message, sans certitude sur son auteur
  return { messages: messages.slice(-1), methode: 'dernier message du fil', fiable: false };
}

/**
 * Met en forme les messages de relance en indiquant qui parle.
 *
 * L'attribution est indispensable : un fil peut contenir la réponse d'un autre Product
 * Expert en plus de celle du demandeur, et les deux n'appellent pas le même traitement.
 *
 * @param {Array<{author: string, text: string}>} messages
 * @param {string} demandeur Nom de l'auteur de la question d'origine
 * @returns {string}
 */
function formaterRelance(messages, demandeur) {
  return messages.map((m) => {
    const auteur = m.author || 'Intervenant inconnu';
    const role = (demandeur && memeAuteur(auteur, demandeur))
      ? ' (auteur de la question)'
      : (m.author ? ' (autre intervenant)' : '');
    return auteur + role + ' :\n' + m.text;
  }).join('\n\n---\n\n');
}

/**
 * Affiche le bouton de traitement d'une relance.
 * Présent dès qu'un fil compte plusieurs messages : le Product Expert décide lui-même
 * si la situation s'y prête, plutôt que de laisser une heuristique trancher à sa place.
 */
function afficherBoutonRelance() {
  if (document.getElementById('pe-followup-btn') || boutonRelanceEnCours) return;

  const messages = extraireFilStructure();
  if (messages.length < 2) return;

  // La décision dépend du nom d'affichage, lu de façon asynchrone : un drapeau évite
  // que l'observateur du DOM ne déclenche deux créations pendant cette attente.
  boutonRelanceEnCours = true;

  getStorage(['peDisplayName']).then((config) => {
    if (!doitAfficherRelance(messages, config.peDisplayName)) {
      boutonRelanceEnCours = false;
      return;
    }
    const premiere = !!config.peDisplayName &&
      !messages.some((m) => memeAuteur(m.author, config.peDisplayName));
    creerBoutonRelance(premiere);
    boutonRelanceEnCours = false;
  });
}

let boutonRelanceEnCours = false;

/**
 * Détermine s'il y a réellement une relance à traiter sur ce fil.
 *
 * Trois situations ne le justifient pas : une question sans aucune réponse, un fil où
 * le Product Expert n'est pas encore intervenu, et un fil où sa réponse est le dernier
 * message. Afficher le bouton dans ces cas n'apporte rien et brouille la lecture.
 *
 * @param {Array} messages Le fil structuré
 * @param {string} nomPe Nom d'affichage du Product Expert
 * @returns {boolean}
 */
function doitAfficherRelance(messages, nomPe) {
  // Une seule carte : la question, sans échange
  if (!messages || messages.length < 2) return false;

  // Sans nom d'affichage, l'appartenance des messages est indéterminable :
  // le bouton reste proposé, et le clic explique ce qui manque.
  if (!nomPe) return true;

  const estIntervenu = messages.some((m) => memeAuteur(m.author, nomPe));

  // Fil auquel un autre bénévole a répondu sans que le Product Expert soit intervenu :
  // il peut légitimement compléter, à condition de ne rien répéter. Une réponse
  // initiale générée à l'aveugle reproduirait justement le message du collègue.
  if (!estIntervenu) return messages.length >= 2;

  return isolerRelanceStructuree(messages, nomPe, '').messages.length > 0;
}

/**
 * Crée et pose le bouton de traitement d'une relance.
 */
function creerBoutonRelance(premiereIntervention) {
  if (document.getElementById('pe-followup-btn')) return;

  const btn = document.createElement('button');
  btn.id = 'pe-followup-btn';
  btn.innerHTML = premiereIntervention ? '💬 Compléter le fil' : '💬 Répondre à la relance';
  btn.title = premiereIntervention
    ? "Intervenir sur ce fil sans répéter la réponse déjà publiée par un autre bénévole"
    : "Générer une réponse au dernier message, sans répéter ce qui a déjà été dit";
  const libelleInitial = btn.innerHTML;

  btn.addEventListener('click', async () => {
    const config = await getStorage(['webappUrl', 'sharedSecret', 'peDisplayName']);
    if (!config.webappUrl || !config.sharedSecret) {
      alert("Configurez d'abord l'URL de la WebApp et le secret partagé dans les options de l'extension.");
      return;
    }

    const messages = extraireFilStructure();
    if (!messages.length) {
      alert("Aucune réponse n'a pu être lue dans ce fil.\n\nOuvrez la console du navigateur (F12) et exécutez __peTrackerDiagnostic() pour voir ce qui est détecté.");
      return;
    }

    if (!config.peDisplayName) {
      alert("Votre nom d'affichage sur le forum n'est pas renseigné.\n\nSans lui, votre propre message ne peut pas être identifié de façon fiable dans le fil. Ajoutez-le dans les options de l'extension (par exemple « Fabrice_Fx »).");
    }

    const isolation = isolerRelanceStructuree(
      messages,
      config.peDisplayName,
      contenuEditeurMemorise || dernierTexteCapture
    );

    if (!isolation.messages.length) {
      alert("Aucun message postérieur à votre réponse n'a été trouvé dans ce fil.");
      return;
    }

    if (!isolation.fiable) {
      const suite = confirm(
        "⚠️ Votre message n'a pas pu être localisé dans le fil.\n\n" +
        "Seul le dernier message a été retenu comme relance : s'il provient d'un autre Product Expert, " +
        "la réponse générée portera à côté.\n\n" +
        "Continuer quand même ?"
      );
      if (!suite) return;
    }

    // Le badge « Auteur d'origine » désigne le demandeur ; à défaut, le premier message
    const demandeur = trouverDemandeur(messages) || (messages[0] ? messages[0].author : '');
    const relance = formaterRelance(isolation.messages, demandeur);
    console.log("💬 Relance isolée par « " + isolation.methode + " » — " + isolation.messages.length + " message(s).");

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
          locked: filVerrouille(),
          peADejaRepondu: !premiereIntervention,
          secret: config.sharedSecret
        }
      });

      let data = (response && response.success) ? response.data : null;

      // Fil pas encore suivi : on l'enregistre sans générer de réponse initiale
      // (inutile ici, et coûteuse en quota), puis on relance le traitement.
      if (data && data.code === 'untracked') {
        btn.innerHTML = '⏳ Enregistrement du fil...';

        const infos = extraireInfosThread();
        const inscription = await sendMessage({
          action: 'sendToWebapp',
          webappUrl: config.webappUrl,
          payload: {
            action: 'registerOnly',
            url: window.location.href,
            title: infos.title,
            author: demandeur || infos.author,
            product: infos.product,
            content: messages[0] ? messages[0].text.substring(0, MAX_CONTENT) : infos.content,
            secret: config.sharedSecret
          }
        });

        const okInscription = inscription && inscription.success && inscription.data && inscription.data.status === 'success';
        if (!okInscription) {
          alert("Impossible d'enregistrer ce fil : " + ((inscription && inscription.data) ? inscription.data.message : 'erreur inconnue'));
          btn.innerHTML = libelleInitial;
          btn.disabled = false;
          return;
        }

        btn.innerHTML = '⏳ Analyse de la relance...';
        const seconde = await sendMessage({
          action: 'sendToWebapp',
          webappUrl: config.webappUrl,
          payload: {
            action: 'followUp',
            url: window.location.href,
            followUpText: relance.substring(0, MAX_CONTENT),
            locked: filVerrouille(),
            peADejaRepondu: !premiereIntervention,
            secret: config.sharedSecret
          }
        });
        data = (seconde && seconde.success) ? seconde.data : null;
      }

      if (!data || data.status !== 'success') {
        alert("Échec : " + (data ? data.message : "réponse invalide du backend"));
        btn.innerHTML = libelleInitial;
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

      if (data.nothingToAdd) {
        alert("ℹ️ Rien à ajouter\n\nLa réponse déjà publiée traite correctement la demande. Aucun texte n'a été inséré : un message redondant encombrerait le fil.\n\nConstat de l'analyse :\n" + (data.summary || ''));
        btn.innerHTML = 'ℹ️ Rien à ajouter';
        setTimeout(() => { btn.innerHTML = libelleInitial; btn.disabled = false; }, 4000);
        return;
      }

      const texte = data.summary || '';
      if (texte && !data.truncated) {
        // On commente sous le dernier message du fil, c'est-à-dire celui du demandeur
        const dernier = isolation.messages[isolation.messages.length - 1];
        const place = await injecterReponse(texte, 'commentaire', dernier ? dernier.element : null);
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
      btn.innerHTML = libelleInitial;
      btn.disabled = false;
    }, 4000);
  });

  document.body.appendChild(btn);
}

/**
 * Crée le bouton principal s'il n'est pas déjà présent.
 */
function creerBoutonPrincipal() {
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

/**
 * Point d'entrée, appelé au chargement puis à chaque mutation du DOM.
 *
 * La création du bouton principal est distincte de l'analyse du fil : la première
 * n'a lieu qu'une fois, la seconde doit pouvoir se répéter tant que la Community
 * Console n'a pas fini de construire sa page. Les réunir sous une même garde
 * empêchait toute réévaluation dès le bouton posé.
 */
function initTracker() {
  if (!window.location.pathname.includes('/thread/')) {
    return;
  }

  creerBoutonPrincipal();

  // L'analyse s'arrête d'elle-même une fois le fil lu, ou le quota d'essais épuisé :
  // elle lit beaucoup de `innerText`, ce qui force un recalcul de mise en page.
  if (analyseTerminee) return;

  afficherBoutonRelance();
  diagnostiquerUneFois();
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

// Le rendu de la Community Console peut s'achever bien après le chargement, sans
// qu'aucune mutation ne relance l'observateur. Ces reprises différées couvrent ce cas.
setTimeout(initTracker, 4000);
setTimeout(initTracker, 9000);
