document.addEventListener('DOMContentLoaded', function() {
  const webappUrlInput = document.getElementById('webappUrl');
  const geminiApiKeyInput = document.getElementById('geminiApiKey');
  const sharedSecretInput = document.getElementById('sharedSecret');
  const peDisplayNameInput = document.getElementById('peDisplayName');
  const toggleKeyBtn = document.getElementById('toggleKeyBtn');
  const toggleSecretBtn = document.getElementById('toggleSecretBtn');
  const saveBtn = document.getElementById('saveBtn');
  const status = document.getElementById('status');

  // Charger la configuration existante.
  // chrome.storage.local (et non sync) : la clé API et le secret ne sont pas répliqués
  // en clair sur tous les appareils connectés au même profil Chrome.
  chrome.storage.local.get(['webappUrl', 'geminiApiKey', 'sharedSecret', 'peDisplayName'], function(result) {
    const local = result || {};

    if (local.webappUrl || local.geminiApiKey || local.sharedSecret || local.peDisplayName) {
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
    if (config.peDisplayName) peDisplayNameInput.value = config.peDisplayName;
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

  // Affiche le résultat là où on le voit : le popup dépasse souvent la hauteur
  // visible, et un message placé sous le bouton passait inaperçu.
  const afficher = (lignes, couleur, fugace = false) => {
    status.textContent = lignes.join('\n');
    status.style.whiteSpace = 'pre-line';
    status.style.color = couleur;
    status.scrollIntoView({ block: 'nearest' });
    if (fugace) setTimeout(() => { status.textContent = ''; }, 3000);
  };

  // Sauvegarder la configuration.
  //
  // Chaque champ valide est enregistré, même si la configuration est incomplète :
  // auparavant, une URL sans secret — ou une URL mal copiée — faisait refuser
  // l'enregistrement de TOUS les champs, nom et clé compris. Une configuration
  // incomplète se signale ; elle ne se refuse pas.
  saveBtn.addEventListener('click', () => {
    const url = webappUrlInput.value.trim();
    const apiKey = geminiApiKeyInput.value.trim();
    const sharedSecret = sharedSecretInput.value.trim();
    const peDisplayName = peDisplayNameInput.value.trim();

    const aEnregistrer = { geminiApiKey: apiKey, sharedSecret, peDisplayName };
    const avertissements = [];

    // Une URL invalide n'est pas enregistrée : la précédente, si elle existe, reste en place.
    if (!url || url.startsWith('https://script.google.com/')) {
      aEnregistrer.webappUrl = url;
    } else {
      avertissements.push('⚠️ URL non enregistrée : elle doit commencer par https://script.google.com/ et finir par /exec.');
    }

    if (!url) {
      avertissements.push('ℹ️ Sans URL de WebApp, les boutons du forum ne peuvent rien générer.');
    } else if (!sharedSecret) {
      avertissements.push('ℹ️ Sans secret partagé, le backend refusera les requêtes (🛠️ Suivi PE > Ouvrir le panneau de contrôle).');
    }
    if (!peDisplayName) {
      avertissements.push('ℹ️ Sans nom d\'affichage, vos relances ne seront pas repérées dans les fils.');
    }

    chrome.storage.local.set(aEnregistrer, () => {
      if (chrome.runtime.lastError) {
        afficher(['❌ Échec de l\'enregistrement : ' + chrome.runtime.lastError.message], '#d93025');
        return;
      }
      if (avertissements.length) {
        afficher(['✅ Enregistré.', ...avertissements], '#b06000');
      } else {
        afficher(['✅ Configuration enregistrée avec succès !'], '#0f9d58', true);
      }
    });
  });
});
