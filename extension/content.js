console.log("Community Console PE Tracker activé.");

/**
 * Enveloppe chrome.storage.sync.get dans une Promise.
 * @param {Array<string>} keys
 * @returns {Promise<Object>}
 */
function getStorage(keys) {
  return new Promise((resolve) => {
    try {
      chrome.storage.sync.get(keys, (result) => resolve(result || {}));
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
      const storageData = await getStorage(['webappUrl', 'geminiApiKey']);
      const webappUrl = storageData.webappUrl;
      const geminiApiKey = storageData.geminiApiKey || "";

      if (!webappUrl) {
        alert("Veuillez d'abord configurer l'URL de la WebApp Google Apps Script dans les options de l'extension (clic sur l'icône de l'extension dans Chrome).");
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
          const contentEls = document.querySelectorAll('p');
          if (contentEls && contentEls.length > 0) {
            content = Array.from(contentEls).map(el => el.innerText.trim()).filter(t => t).join('\n\n');
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
      
      content = content.substring(0, 1500);
      
      const payload = {
        title: title,
        url: window.location.href,
        author: author,
        product: product,
        content: content,
        apiKey: geminiApiKey
      };

      console.log("📡 Transmission au Service Worker :", payload);

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

      let summaryText = "";
      if (response && response.success && response.data) {
        summaryText = response.data.summary || "";
      }

      if (summaryText) {
        const reponsePlacee = await injecterReponse(summaryText);
        
        if (reponsePlacee) {
          btn.innerHTML = '✅ Envoyé & Réponse placée !';
          btn.style.backgroundColor = '#0f9d58';
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

// Observation DOM pour la gestion SPA
const observer = new MutationObserver((mutations) => {
  initTracker();
});

observer.observe(document.body, { childList: true, subtree: true });

// Lancement initial
setTimeout(initTracker, 2000);
