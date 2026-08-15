/**
 * PE Tracker - Solutions Mobile (iPhone / iPad iOS) v1.8.3
 *
 * Option 1 : Raccourci Apple iOS (Raccourcis / Shortcuts App) - RECOMMANDE SUR CHROME iOS
 * Option 2 : Bookmarklet JavaScript Standard ES5 (Safari iOS)
 *
 * Le secret partagé est demandé une seule fois puis mémorisé sur l'appareil.
 * Il se génère dans Google Sheets via « 🛠️ Suivi PE > Ouvrir le panneau de contrôle ».
 */

// --- OPTION 1 : CODE DU BOOKMARKLET ES5 COMPATIBLE SAFARI iOS ---
// (Si Chrome iOS bloque le clic direct depuis les favoris, utilisez la méthode Omnibox ou le Raccourci iOS)
//
// javascript:(function(){var k='PE_TRACKER_WEBAPP_URL',sk='PE_TRACKER_SHARED_SECRET',u=localStorage.getItem(k),s=localStorage.getItem(sk);if(!u){u=prompt("URL WebApp Apps Script (/exec) :");if(!u)return;u=u.trim();localStorage.setItem(k,u);}if(!s){s=prompt("Secret partage (panneau de controle Sheets) :");if(!s)return;s=s.trim();localStorage.setItem(sk,s);}var t=document.getElementById('pe-toast');if(!t){t=document.createElement('div');t.id='pe-toast';t.style.cssText='position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:999999;background:#1a73e8;color:#fff;padding:12px 20px;border-radius:24px;font-family:sans-serif;font-size:14px;font-weight:bold;box-shadow:0 4px 12px rgba(0,0,0,0.3);text-align:center;max-width:90%;';document.body.appendChild(t);}t.innerText='⏳ Analyse Gemini & Envoi...';t.style.background='#1a73e8';var h=document.querySelector('.scTailwindThreadQuestionQuestioncardtitle, h1'),title=h?h.innerText.trim():document.title;var a=document.querySelector('.scTailwindThreadPost_headerUserinfoname, .user-name'),author=a?a.innerText.trim():'Auteur inconnu';var p=document.querySelector('.scTailwindThreadQuestionForumtitleroot, a[href*="/forum/"]'),product=p?p.innerText.trim():'Inconnu';var c=document.querySelector('.scTailwindThreadPostcontentroot, .message-content'),content=c?c.innerText.trim():'';var payload=JSON.stringify({title:title,url:window.location.href,author:author,product:product,content:content.substring(0,10000),secret:s});var xhr=new XMLHttpRequest();xhr.open('POST',u,true);xhr.setRequestHeader('Content-Type','text/plain;charset=utf-8');xhr.onreadystatechange=function(){if(xhr.readyState===4){if(xhr.status>=200&&xhr.status<400){try{var res=JSON.parse(xhr.responseText);if(res.status==='error'){t.innerText='❌ '+(res.message||'Refuse');t.style.background='#d93025';}else{var s2=res.summary||'';var w='';if(res.replyStatus==='CLARIFICATION'){w='⚠️ INFORMATIONS INSUFFISANTES - demande de precisions, ne pas remplacer par une procedure generique.\n\n';}else if(res.replyStatus==='HORS_SUJET'){w='⚠️ HORS SUJET - a relire entierement.\n\n';}else if(res.confidence==='FAIBLE'){w='⚠️ CONFIANCE FAIBLE - verifiez chaque affirmation.\n\n';}if(s2){t.innerText='✅ Thread enregistré dans Sheets !';t.style.background='#0f9d58';alert(w+s2);}else{t.innerText='✅ Enregistré dans Sheets !';t.style.background='#0f9d58';}}}catch(e){t.innerText='✅ Enregistré !';t.style.background='#0f9d58';}}else{t.innerText='❌ Erreur '+xhr.status;t.style.background='#d93025';}setTimeout(function(){if(t&&t.parentNode)t.parentNode.removeChild(t);},4000);}};xhr.send(payload);})();

// --- SOURCE JS COMPLÈTE LISIBLE ---
(function() {
  var STORAGE_KEY = 'PE_TRACKER_WEBAPP_URL';
  var SECRET_KEY = 'PE_TRACKER_SHARED_SECRET';

  var webappUrl = localStorage.getItem(STORAGE_KEY);
  var sharedSecret = localStorage.getItem(SECRET_KEY);

  if (!webappUrl) {
    webappUrl = prompt("Entrez l'URL de votre WebApp Google Apps Script (finissant par /exec) :");
    if (!webappUrl) return;
    webappUrl = webappUrl.trim();
    localStorage.setItem(STORAGE_KEY, webappUrl);
  }

  // Sans ce secret, le backend refuse la requête : la WebApp est publiée en accès « N'importe qui »
  if (!sharedSecret) {
    sharedSecret = prompt("Entrez le secret partagé (panneau de contrôle Google Sheets) :");
    if (!sharedSecret) return;
    sharedSecret = sharedSecret.trim();
    localStorage.setItem(SECRET_KEY, sharedSecret);
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
    content: content.substring(0, 10000),
    secret: sharedSecret
  });

  var xhr = new XMLHttpRequest();
  xhr.open('POST', webappUrl, true);
  xhr.setRequestHeader('Content-Type', 'text/plain;charset=utf-8');
  xhr.onreadystatechange = function() {
    if (xhr.readyState !== 4) return;

    if (xhr.status >= 200 && xhr.status < 400) {
      try {
        var res = JSON.parse(xhr.responseText);

        if (res.status === 'error') {
          toast.innerText = '❌ ' + (res.message || 'Refusé');
          toast.style.background = '#d93025';
        } else {
          var summary = res.summary || '';

          // Avertir quand la proposition ne doit pas être publiée telle quelle
          var warning = '';
          if (res.replyStatus === 'CLARIFICATION') {
            warning = "⚠️ INFORMATIONS INSUFFISANTES\nGemini a rédigé une demande de précisions plutôt qu'une procédure. Ne la remplacez pas par une réponse générique.\n\n";
          } else if (res.replyStatus === 'HORS_SUJET') {
            warning = "⚠️ HORS SUJET\nÀ relire entièrement avant publication.\n\n";
          } else if (res.confidence === 'FAIBLE') {
            warning = "⚠️ CONFIANCE FAIBLE\nVérifiez chaque affirmation avant de publier.\n\n";
          }

          if (summary) {
            toast.innerText = '✅ Thread enregistré dans Sheets !';
            toast.style.background = '#0f9d58';
            alert(warning + summary);
          } else {
            toast.innerText = '✅ Enregistré dans Sheets !';
            toast.style.background = '#0f9d58';
          }
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
  };
  xhr.send(payload);
})();
