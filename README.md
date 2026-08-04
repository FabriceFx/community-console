# Outil de suivi Community Console (PE Tracker)

[![Version](https://img.shields.io/badge/version-1.3.0-blue.svg)](CHANGELOG.md)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Chrome MV3](https://img.shields.io/badge/Chrome-Manifest_V3-green.svg)](extension/manifest.json)
[![Google Apps Script](https://img.shields.io/badge/Backend-Google_Apps_Script-blue.svg)](gas/)

*Read this in [English](#english-version).*

Cet outil complet est destiné aux **Product Experts (PE) Google** pour automatiser la gestion, le suivi et la réponse aux questions (threads) de la Google Community Console directement depuis Google Sheets et Google Chrome grâce à l'IA **Google Gemini**.

---

## 🇫🇷 Version Française

### 🚀 Fonctionnalités & Avancées Récents

#### 📱 Extension Chrome (Manifest V3)
- **Bouton flottant "📌 Suivre dans Sheets"** : Injecté automatiquement sur les pages des threads (`https://support.google.com/s/community/forum/.../thread/...`).
- **Extraction automatique du DOM** : Titre, auteur, produit Google concerné, corps de la question et détails techniques.
- **Service Worker d'Arrière-Plan (`background.js`)** : Gestion asynchrone des requêtes HTTP Cross-Origin vers Google Apps Script sans blocage CORS.
- **Placement Automatique de la Réponse** :
  - Détection automatique et clic sur le bouton **Répondre** / **Reply**.
  - Localisation de l'éditeur de texte (`contenteditable` ou `textarea`).
  - Injection directe de la réponse formulée par Gemini et défilement fluide (`scrollIntoView`).
- **Fallback Presse-Papier Intelligent** : Copie automatique de la réponse dans le presse-papier si le fil est verrouillé ou le champ non modifiable.
- **Gestionnaire de Clé API Gemini** : Champ de saisie sécurisé avec masque de mot de passe directement dans le popup de l'extension.

#### 🤖 Backend Google Apps Script & IA Gemini
- **Support Multilingue Avancé (FR, EN, DE, ES, IT)** : Détection automatique des questions rédigées en Français, Anglais, Allemand, Espagnol et Italien avec génération de formules d'accueil et de salutations adaptées.
- **Génération IA avec Google Search Grounding** : Utilisation des modèles Gemini (3.5 / 3.6 Flash) couplée à la recherche Google pour fournir des réponses techniques avec des liens vers les articles officiels du Centre d'aide.
- **Validation des URL Anti-404** : Vérification HTTP automatique des liens générés par l'IA et résolution des liens de redirection Vertex AI pour bannir les erreurs 404.
- **Protection des Données Personnelles (PII)** : Masquage automatique des e-mails, numéros de téléphone et clés API avant toute transmission à l'IA.
- **Formatage RichText Google Sheets** : Conversion automatique du Markdown généré par Gemini en texte enrichi nativement cliquable (`setLinkUrl`) et lisible (gras, puces, nettoyage des séparateurs).
- **Détection Automatique de la Langue** : Adaptation automatique du message d'accueil et de signature (Français ou Anglais) en fonction de la langue du thread.
- **Résilience & Tentatives avec Backoff Exponentiel (`fetchWithRetry`)** : Prise en charge des surcharges API temporaires (HTTP 429, 500, 503).
- **Panneau de Contrôle Material Design 3 (MD3)** : Interface intégrée à Google Sheets pour configurer de manière sécurisée la clé API Gemini (`PropertiesService`).
- **Option de Relance sur Ligne Sélectionnée** : Menu permettant de relancer à tout moment l'analyse Gemini sur une ligne de suivi existante.

---

### 🛠️ Prérequis
- Un compte Google (Google Sheets & Apps Script).
- Une clé d'API Google Gemini (disponible gratuitement sur Google AI Studio).
- Le navigateur Google Chrome.

---

### 📥 Installation & Configuration

#### 1. Backend (Google Sheets & Apps Script)
1. Créez un nouveau fichier **Google Sheets**.
2. Ouvrez **Extensions > Apps Script**.
3. Copiez l'ensemble des fichiers du dossier `gas/` (`Code.gs`, `Api.gs`, `Gemini.gs`, `Ui.gs`, `Config.gs`, `Sidebar.html`, `appsscript.json`) dans votre projet.
4. Actualisez votre feuille Google Sheets : le menu **"🛠️ Suivi PE"** apparaît.
5. Cliquez sur **"🛠️ Suivi PE" > "Initialiser la feuille"**.
6. Déployez l'application Web : **Déployer > Nouveau déploiement > Application Web**.
   - *Exécuter en tant que* : Vous (`votre_email@gmail.com`).
   - *Qui a accès* : **N'importe qui** (Anyone).
7. Copiez l'URL de l'application Web générée.

#### 2. Configuration de la Clé API Gemini
1. Dans Google Sheets, cliquez sur **"🛠️ Suivi PE" > "Ouvrir le panneau de contrôle"**.
2. Saisissez votre clé d'API Gemini et cliquez sur **Sauvegarder**.

#### 3. Installation de l'Extension Chrome
1. Ouvrez Chrome et rendez-vous sur `chrome://extensions/`.
2. Activez le **Mode développeur** (en haut à droite).
3. Cliquez sur **Charger l'extension non empaquetée** et sélectionnez le dossier `extension/` du projet.
4. Cliquez sur l'icône de l'extension installée et collez l'URL de votre WebApp Google Apps Script.

---

### 💡 Utilisation
1. Ouvrez un thread sur la Google Community Console.
2. Cliquez sur le bouton **"📌 Suivre dans Sheets"** en bas de l'écran.
3. L'extension enregistre les données dans Sheets, génère la réponse via Gemini, clique sur **Répondre** et place directement le texte dans le champ de réponse !

---

<a name="english-version"></a>
## 🇬🇧 English Version

### 🚀 Features & Recent Developments

#### 📱 Chrome Extension (Manifest V3)
- **Floating "📌 Suivre dans Sheets" Button**: Injected automatically on Google Support / Community Console thread pages.
- **Automated DOM Extraction**: Scrapes thread title, author, product, question content, and technical details.
- **Background Service Worker (`background.js`)**: Handles cross-origin HTTP requests to Apps Script without CORS restrictions.
- **Automatic Reply Placement**:
  - Automatically detects and clicks the **Reply** button.
  - Locates the editor element (`contenteditable` or `textarea`).
  - Directly populates Gemini's generated response and scrolls smoothly to the editor.
- **Smart Clipboard Fallback**: Automatically copies the draft response to the clipboard if the reply button or text box is inaccessible.

#### 🤖 Google Apps Script Backend & Gemini AI
- **AI Response Generation with Google Search Grounding**: Uses Gemini models (3.5 / 3.6 Flash) with real-time Google Search grounding to source verified Help Center articles.
- **Anti-404 Link Verification**: HTTP checks on generated links and Vertex AI redirect URL resolution to eliminate dead links.
- **PII Protection**: Automatically masks emails, phone numbers, and API keys before sending content to the AI.
- **Google Sheets RichText Formatting**: Converts Gemini Markdown into native clickable hyperlinks (`setLinkUrl`) and structured text (bold, bullet points).
- **Automatic Language Detection**: Switches greetings and signatures seamlessly between English and French depending on question language.
- **Exponential Backoff Retries (`fetchWithRetry`)**: Handles transient HTTP API rate limits (HTTP 429, 500, 503).
- **Material Design 3 Control Panel**: Integrated Google Sheets sidebar for secure API key storage (`PropertiesService`).
- **Re-analysis Command**: Menu option to re-trigger Gemini response generation for any selected sheet row.

---

### 📥 Setup Instructions

#### 1. Backend (Google Sheets & Apps Script)
1. Create a new **Google Sheet**.
2. Navigate to **Extensions > Apps Script**.
3. Copy all files from the `gas/` directory into your Apps Script project.
4. Refresh your Google Sheet to view the **"🛠️ Suivi PE"** menu.
5. Click **"🛠️ Suivi PE" > "Initialiser la feuille"**.
6. Deploy: **Deploy > New deployment > Web App**.
   - *Execute as*: Me.
   - *Who has access*: **Anyone**.
7. Copy the generated Web App URL.

#### 2. Gemini API Key Setup
1. In Google Sheets, open **"🛠️ Suivi PE" > "Ouvrir le panneau de contrôle"**.
2. Paste your Gemini API key and click **Sauvegarder**.

#### 3. Chrome Extension Installation
1. Open Chrome and navigate to `chrome://extensions/`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select the `extension/` directory.
4. Click the extension icon and paste your Apps Script Web App URL.

---

### 👤 Author & License
- Développé par **Fabrice Faucheux** — [faucheux.bzh](https://faucheux.bzh)
- Distributed under the **MIT License**. See [LICENSE](LICENSE) for details.
