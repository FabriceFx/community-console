/**
 * PE Tracker - Solutions Mobile (iPhone / iPad iOS) v1.4.2
 * 
 * Option 1 : Raccourci Apple iOS (Raccourcis / Shortcuts App) - RECOMMANDE SUR CHROME iOS
 * Option 2 : Bookmarklet JavaScript Standard ES5 (Safari iOS)
 */

// --- OPTION 1 : CODE DU BOOKMARKLET ES5 COMPATIBLE SAFARI iOS ---
// (Si Chrome iOS bloque le clic direct depuis les favoris, utilisez la méthode Omnibox ou le Raccourci iOS)
//
// javascript:(function(){var k='PE_TRACKER_WEBAPP_URL',u=localStorage.getItem(k);if(!u){u=prompt("URL WebApp Apps Script (/exec) :");if(!u)return;u=u.trim();localStorage.setItem(k,u);}var t=document.getElementById('pe-toast');if(!t){t=document.createElement('div');t.id='pe-toast';t.style.cssText='position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:999999;background:#1a73e8;color:#fff;padding:12px 20px;border-radius:24px;font-family:sans-serif;font-size:14px;font-weight:bold;box-shadow:0 4px 12px rgba(0,0,0,0.3);text-align:center;max-width:90%;';document.body.appendChild(t);}t.innerText='⏳ Analyse Gemini & Envoi...';t.style.background='#1a73e8';var h=document.querySelector('.scTailwindThreadQuestionQuestioncardtitle, h1'),title=h?h.innerText.trim():document.title;var a=document.querySelector('.scTailwindThreadPost_headerUserinfoname, .user-name'),author=a?a.innerText.trim():'Auteur inconnu';var p=document.querySelector('.scTailwindThreadQuestionForumtitleroot, a[href*="/forum/"]'),product=p?p.innerText.trim():'Inconnu';var c=document.querySelector('.scTailwindThreadPostcontentroot, .message-content'),content=c?c.innerText.trim():'';var payload=JSON.stringify({title:title,url:window.location.href,author:author,product:product,content:content.substring(0,1500)});var xhr=new XMLHttpRequest();xhr.open('POST',u,true);xhr.setRequestHeader('Content-Type','text/plain;charset=utf-8');xhr.onreadystatechange=function(){if(xhr.readyState===4){if(xhr.status>=200&&xhr.status<400){try{var res=JSON.parse(xhr.responseText);var s=res.summary||'';if(s){t.innerText='✅ Thread enregistré dans Sheets !';t.style.background='#0f9d58';alert('✅ Réponse IA générée :\n\n'+s);}else{t.innerText='✅ Enregistré dans Sheets !';t.style.background='#0f9d58';}}catch(e){t.innerText='✅ Enregistré !';t.style.background='#0f9d58';}}else{t.innerText='❌ Erreur '+xhr.status;t.style.background='#d93025';}setTimeout(function(){if(t&&t.parentNode)t.parentNode.removeChild(t);},4000);}};xhr.send(payload);})();

// --- SOURCE JS COMPLÈTE LISIBLE ---
(function() {
  var STORAGE_KEY = 'PE_TRACKER_WEBAPP_URL';
  var webappUrl = localStorage.getItem(STORAGE_KEY);

  if (!webappUrl) {
    webappUrl = prompt("Entrez l'URL de votre WebApp Google Apps Script (finissant par /exec) :");
    if (webappUrl) {
      webappUrl = webappUrl.trim();
      localStorage.setItem(STORAGE_KEY, webappUrl);
    } else {
      return;
    }
  }

  var toast = document.getElementById('pe-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'pe-toast';
    toast.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:999999;background:#1a73e8;color:#fff;padding:12px 20px;border-radius:24px;font-family:sans-serif;font-size:14px;font-weight:bold;box-shadow:0 4px 12px rgba(0,0,0,0.3);text-align:center;max-width:90%;';
    document.body.appendChild(toast);
  }
  toast.innerText = '⏳ Analyse Gemini & Envoi...';
  toast.style.background = '#1a73e8';

  var hEl = document.querySelector('.scTailwindThreadQuestionQuestioncardtitle, h1');
  var title = hEl ? hEl.innerText.trim() : document.title;

  var aEl = document.querySelector('.scTailwindThreadPost_headerUserinfoname, .user-name');
  var author = aEl ? aEl.innerText.trim() : 'Auteur inconnu';

  var pEl = document.querySelector('.scTailwindThreadQuestionForumtitleroot, a[href*="/forum/"]');
  var product = pEl ? pEl.innerText.trim() : 'Inconnu';

  var cEl = document.querySelector('.scTailwindThreadPostcontentroot, .message-content');
  var content = cEl ? cEl.innerText.trim() : '';

  var payload = JSON.stringify({
    title: title,
    url: window.location.href,
    author: author,
    product: product,
    content: content.substring(0, 1500)
  });

  var xhr = new XMLHttpRequest();
  xhr.open('POST', webappUrl, true);
  xhr.setRequestHeader('Content-Type', 'text/plain;charset=utf-8');
  xhr.onreadystatechange = function() {
    if (xhr.readyState === 4) {
      if (xhr.status >= 200 && xhr.status < 400) {
        try {
          var res = JSON.parse(xhr.responseText);
          var s = res.summary || '';
          if (s) {
            toast.innerText = '✅ Thread enregistré dans Sheets !';
            toast.style.background = '#0f9d58';
            alert('✅ Réponse IA générée :\n\n' + s);
          } else {
            toast.innerText = '✅ Enregistré dans Sheets !';
            toast.style.background = '#0f9d58';
          }
        } catch (e) {
          toast.innerText = '✅ Enregistré !';
          toast.style.background = '#0f9d58';
        }
      } else {
        toast.innerText = '❌ Erreur ' + xhr.status;
        toast.style.background = '#d93025';
      }
      setTimeout(function() {
        if (toast && toast.parentNode) toast.parentNode.removeChild(toast);
      }, 4000);
    }
  };
  xhr.send(payload);
})();
