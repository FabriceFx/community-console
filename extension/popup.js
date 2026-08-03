document.addEventListener('DOMContentLoaded', function() {
  // Charger l'URL au démarrage
  chrome.storage.sync.get(['webappUrl'], function(result) {
    if (result.webappUrl) {
      document.getElementById('webappUrl').value = result.webappUrl;
    }
  });

  // Sauvegarder l'URL
  document.getElementById('saveBtn').addEventListener('click', function() {
    const url = document.getElementById('webappUrl').value.trim();
    
    if (url && !url.startsWith('https://script.google.com/')) {
      document.getElementById('status').textContent = '⚠️ L\'URL doit commencer par https://script.google.com/';
      document.getElementById('status').style.color = '#d93025';
      return;
    }

    chrome.storage.sync.set({webappUrl: url}, function() {
      const status = document.getElementById('status');
      status.textContent = '✅ Configuration sauvegardée !';
      status.style.color = '#0f9d58';
      setTimeout(function() {
        status.textContent = '';
      }, 3000);
    });
  });
});
