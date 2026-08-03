document.addEventListener('DOMContentLoaded', function() {
  const webappUrlInput = document.getElementById('webappUrl');
  const geminiApiKeyInput = document.getElementById('geminiApiKey');
  const toggleKeyBtn = document.getElementById('toggleKeyBtn');
  const saveBtn = document.getElementById('saveBtn');
  const status = document.getElementById('status');

  // Charger la configuration existante depuis le stockage synchronisé Chrome
  chrome.storage.sync.get(['webappUrl', 'geminiApiKey'], function(result) {
    if (result.webappUrl) {
      webappUrlInput.value = result.webappUrl;
    }
    if (result.geminiApiKey) {
      geminiApiKeyInput.value = result.geminiApiKey;
    }
  });

  // Basculement entre masqué (password) et lisible (text) pour la clé API Gemini
  toggleKeyBtn.addEventListener('click', function() {
    if (geminiApiKeyInput.type === 'password') {
      geminiApiKeyInput.type = 'text';
      toggleKeyBtn.textContent = '🙈';
    } else {
      geminiApiKeyInput.type = 'password';
      toggleKeyBtn.textContent = '👁️';
    }
  });

  // Sauvegarder l'URL et la clé d'API
  saveBtn.addEventListener('click', function() {
    const url = webappUrlInput.value.trim();
    const apiKey = geminiApiKeyInput.value.trim();

    if (url && !url.startsWith('https://script.google.com/')) {
      status.textContent = '⚠️ L\'URL doit commencer par https://script.google.com/';
      status.style.color = '#d93025';
      return;
    }

    chrome.storage.sync.set({
      webappUrl: url,
      geminiApiKey: apiKey
    }, function() {
      status.textContent = '✅ Configuration enregistrée avec succès !';
      status.style.color = '#0f9d58';
      setTimeout(function() {
        status.textContent = '';
      }, 3000);
    });
  });
});
