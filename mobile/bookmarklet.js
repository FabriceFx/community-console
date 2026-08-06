/**
 * Bookmarklet Mobile (iPhone / iPad / Chrome & Safari iOS)
 * Permet d'envoyer un thread de la Google Community Console vers Google Sheets
 * et de préparer la réponse générée par Gemini depuis un navigateur mobile.
 */

// --- CODE MINIFIÉ À COPIER DANS VOTRE FAVORI MOBILE (champ URL) :
// javascript:(async function(){const e='PE_TRACKER_WEBAPP_URL';let t=localStorage.getItem(e);if(!t){if(t=prompt("Entrez l'URL de votre WebApp Google Apps Script (finissant par /exec) :"),!t)return;t=t.trim(),localStorage.setItem(e,t)}let n=document.getElementById('pe-mobile-toast');n||(n=document.createElement('div'),n.id='pe-mobile-toast',n.style.cssText='position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:999999;background:#1a73e8;color:#fff;padding:12px 20px;border-radius:24px;font-family:sans-serif;font-size:14px;font-weight:bold;box-shadow:0 4px 12px rgba(0,0,0,0.3);text-align:center;max-width:90%;transition:all 0.3s;',document.body.appendChild(n)),n.innerText='⏳ Analyse Gemini & Envoi...',n.style.background='#1a73e8';try{let o=document.title,i=document.querySelector('.scTailwindThreadQuestionQuestioncardtitle, h1');i&&(o=i.innerText.trim());let a='Auteur inconnu',r=document.querySelector('.scTailwindThreadPost_headerUserinfoname, .user-name, [data-stats-id="user-name"]');r&&(a=r.innerText.trim());let c='Inconnu',s=document.querySelector('.scTailwindThreadQuestionForumtitleroot, a[href*="/forum/"]');s&&(c=s.innerText.trim());let l='',d=document.querySelector('.scTailwindThreadPostcontentroot, .message-content, .thread-message-content');if(d)l=d.innerText.trim();else{let p=Array.from(document.querySelectorAll('p')).map(e=>e.innerText.trim()).filter(Boolean);l=p.join('\n\n')}const m={title:o,url:window.location.href,author:a,product:c,content:l.substring(0,1500)},u=await fetch(t,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(m)}),g=await u.json(),f=g&&g.summary?g.summary:'';if(f){try{await navigator.clipboard.writeText(f)}catch(y){}let T=document.querySelector('[contenteditable="true"], textarea, [role="textbox"]');if(!T){const w=document.querySelector('button[aria-label*="Répondre"], button[aria-label*="Reply"], .scTailwindThreadPostReplybutton');w&&(w.click(),await new Promise(e=>setTimeout(e,1500)),T=document.querySelector('[contenteditable="true"], textarea, [role="textbox"]'))}T?(T.focus(),T.isContentEditable||'true'===T.getAttribute('contenteditable')?T.innerText=f:T.value=f,T.dispatchEvent(new Event('input',{bubbles:!0})),n.innerText='✅ Thread enregistré & Réponse insérée !'):n.innerText='✅ Thread enregistré ! (Réponse copiée 📋)'}else n.innerText='✅ Thread enregistré dans Sheets !';n.style.background='#0f9d58'}catch(b){console.error("Erreur Bookmarklet",b),n.innerText="❌ Erreur d'envoi",n.style.background='#d93025'}setTimeout(()=>{n&&n.parentNode&&n.parentNode.removeChild(n)},4000)})();

// --- SOURCE JS LISIBLE (Non minifiée) :
(async function() {
  const STORAGE_KEY = 'PE_TRACKER_WEBAPP_URL';
  let webappUrl = localStorage.getItem(STORAGE_KEY);

  if (!webappUrl) {
    webappUrl = prompt("Entrez l'URL de votre WebApp Google Apps Script (finissant par /exec) :");
    if (webappUrl) {
      webappUrl = webappUrl.trim();
      localStorage.setItem(STORAGE_KEY, webappUrl);
    } else {
      return;
    }
  }

  // Notification visuelle mobile (Overlay Toast)
  let notify = document.getElementById('pe-mobile-toast');
  if (!notify) {
    notify = document.createElement('div');
    notify.id = 'pe-mobile-toast';
    notify.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:999999;background:#1a73e8;color:#fff;padding:12px 20px;border-radius:24px;font-family:sans-serif;font-size:14px;font-weight:bold;box-shadow:0 4px 12px rgba(0,0,0,0.3);text-align:center;max-width:90%;transition:all 0.3s;';
    document.body.appendChild(notify);
  }
  notify.innerText = '⏳ Analyse Gemini & Envoi...';
  notify.style.background = '#1a73e8';

  try {
    let title = document.title;
    const titleEl = document.querySelector('.scTailwindThreadQuestionQuestioncardtitle, h1');
    if (titleEl) title = titleEl.innerText.trim();

    let author = "Auteur inconnu";
    const authorEl = document.querySelector('.scTailwindThreadPost_headerUserinfoname, .user-name, [data-stats-id="user-name"]');
    if (authorEl) author = authorEl.innerText.trim();

    let product = "Inconnu";
    const productEl = document.querySelector('.scTailwindThreadQuestionForumtitleroot, a[href*="/forum/"]');
    if (productEl) product = productEl.innerText.trim();

    let content = "";
    const contentEl = document.querySelector('.scTailwindThreadPostcontentroot, .message-content, .thread-message-content');
    if (contentEl) content = contentEl.innerText.trim();
    else {
      const ps = Array.from(document.querySelectorAll('p')).map(p => p.innerText.trim()).filter(Boolean);
      content = ps.join('\n\n');
    }

    const payload = {
      title: title,
      url: window.location.href,
      author: author,
      product: product,
      content: content.substring(0, 1500)
    };

    const response = await fetch(webappUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    const summary = data && data.summary ? data.summary : "";

    if (summary) {
      try {
        await navigator.clipboard.writeText(summary);
      } catch (e) {}

      let editor = document.querySelector('[contenteditable="true"], textarea, [role="textbox"]');
      if (!editor) {
        const btn = document.querySelector('button[aria-label*="Répondre"], button[aria-label*="Reply"], .scTailwindThreadPostReplybutton');
        if (btn) {
          btn.click();
          await new Promise(r => setTimeout(r, 1500));
          editor = document.querySelector('[contenteditable="true"], textarea, [role="textbox"]');
        }
      }

      if (editor) {
        editor.focus();
        if (editor.isContentEditable || editor.getAttribute('contenteditable') === 'true') {
          editor.innerText = summary;
        } else {
          editor.value = summary;
        }
        editor.dispatchEvent(new Event('input', { bubbles: true }));
        notify.innerText = '✅ Thread enregistré & Réponse insérée !';
      } else {
        notify.innerText = '✅ Thread enregistré ! (Réponse copiée 📋)';
      }
    } else {
      notify.innerText = '✅ Thread enregistré dans Sheets !';
    }
    notify.style.background = '#0f9d58';

  } catch (err) {
    console.error("Erreur Bookmarklet PE Tracker", err);
    notify.innerText = "❌ Erreur d'envoi";
    notify.style.background = '#d93025';
  }

  setTimeout(() => {
    if (notify && notify.parentNode) notify.parentNode.removeChild(notify);
  }, 4000);
})();
