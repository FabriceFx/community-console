document.addEventListener('DOMContentLoaded', function() {
  const webappUrlInput = document.getElementById('webappUrl');
  const geminiApiKeyInput = document.getElementById('geminiApiKey');
  const sharedSecretInput = document.getElementById('sharedSecret');
  const toggleKeyBtn = document.getElementById('toggleKeyBtn');
  const toggleSecretBtn = document.getElementById('toggleSecretBtn');
  const saveBtn = document.getElementById('saveBtn');
  const status = document.getElementById('status');

  // Charger la configuration existante.
  // chrome.storage.local (et non sync) : la clé API et le secret ne sont pas répliqués
  // en clair sur tous les appareils connectés au même profil Chrome.
  chrome.storage.local.get(['webappUrl', 'geminiApiKey', 'sharedSecret'], function(result) {
    const local = result || {};

    if (local.webappUrl || local.geminiApiKey || local.sharedSecret) {
      applyConfig(local);
      return;
    }

    // Migration unique depuis l'ancien stockage synchronisé
    chrome.storage.sync.get(['webappUrl', 'geminiApiKey'], function(legacy) {
      if (legacy && (legacy.webappUrl || legacy.geminiApiKey)) {
        applyConfig(legacy);
        chrome.storage.local.set(legacy, function() {
          chrome.storage.sync.remove(['webappUrl', 'geminiApiKey']);
        });
      }
    });
  });

  function applyConfig(config) {
    if (config.webappUrl) webappUrlInput.value = config.webappUrl;
    if (config.geminiApiKey) geminiApiKeyInput.value = config.geminiApiKey;
    if (config.sharedSecret) sharedSecretInput.value = config.sharedSecret;
  }

  // Basculement entre masqué (password) et lisible (text)
  function wireToggle(button, input) {
    button.addEventListener('click', function() {
      const hidden = input.type === 'password';
      input.type = hidden ? 'text' : 'password';
      button.textContent = hidden ? '🙈' : '👁️';
    });
  }

  wireToggle(toggleKeyBtn, geminiApiKeyInput);
  wireToggle(toggleSecretBtn, sharedSecretInput);

  // Sauvegarder la configuration
  saveBtn.addEventListener('click', function() {
    const url = webappUrlInput.value.trim();
    const apiKey = geminiApiKeyInput.value.trim();
    const sharedSecret = sharedSecretInput.value.trim();

    if (url && !url.startsWith('https://script.google.com/')) {
      status.textContent = '⚠️ L\'URL doit commencer par https://script.google.com/';
      status.style.color = '#d93025';
      return;
    }

    if (url && !sharedSecret) {
      status.textContent = '⚠️ Le secret partagé est obligatoire (panneau de contrôle Sheets).';
      status.style.color = '#d93025';
      return;
    }

    chrome.storage.local.set({
      webappUrl: url,
      geminiApiKey: apiKey,
      sharedSecret: sharedSecret
    }, function() {
      status.textContent = '✅ Configuration enregistrée avec succès !';
      status.style.color = '#0f9d58';
      setTimeout(function() {
        status.textContent = '';
      }, 3000);
    });
  });
});
