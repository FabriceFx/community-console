# Outil de suivi Community Console (PE Tracker)

[![Version](https://img.shields.io/badge/version-1.2.0-blue.svg)](CHANGELOG.md)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

*Read this in [English](#english-version).*

Cet outil est destiné aux **Product Experts (PE) Google** pour suivre facilement les questions (threads) de la Community Console directement dans Google Sheets, et injecter automatiquement les réponses générées par l'IA Gemini.

---

## 🇫🇷 Version Française

### 🚀 Fonctionnalités
- **Bouton "📌 Suivre dans Sheets"** injecté sur les pages des threads de la Community Console.
- **Envoi automatique** du titre, auteur, lien, et contenu du thread vers Google Sheets.
- **Génération de réponse avec Gemini** : Analyse du problème et rédaction d'une réponse claire avec recherche d'articles d'aide officiels (Grounding Google Search).
- **Placement automatique de la réponse** : Clic automatique sur le bouton *Répondre* et pré-remplissage de la zone de texte du forum.
- **Fallback presse-papier** : Copie automatique de la réponse si la zone de texte n'est pas modifiable.
- **Interface Material Design 3** dans Google Sheets pour la configuration et la gestion des clés API.

### 🛠️ Prérequis
- Un compte Google avec accès à Google Sheets et Google Apps Script.
- Une clé d'API Google Gemini (gratuite depuis Google AI Studio).
- Le navigateur Google Chrome.

### 📥 Installation & Configuration

#### 1. Backend (Google Sheets & Apps Script)
1. Créez un nouveau fichier Google Sheets.
2. Ouvrez **Extensions > Apps Script**.
3. Copiez les fichiers du dossier `gas/` (`Code.gs`, `Api.gs`, `Gemini.gs`, `Ui.gs`, `Config.gs`, `Sidebar.html`, `appsscript.json`) dans votre projet Apps Script.
4. Actualisez votre feuille Google Sheets : un menu **"🛠️ Suivi PE"** apparaît.
5. Cliquez sur **"🛠️ Suivi PE" > "Initialiser la feuille"**.
6. Déployez l'application : **Déployer > Nouveau déploiement > Application Web**.
   - *Exécuter en tant que* : Vous (`votre_email@gmail.com`).
   - *Qui a accès* : **N'importe qui** (Anyone).
7. Copiez l'URL de l'application Web générée.

#### 2. Configuration Gemini
1. Dans Google Sheets, cliquez sur **"🛠️ Suivi PE" > "Ouvrir le panneau de contrôle"**.
2. Saisissez votre clé d'API Gemini et enregistrez.

#### 3. Extension Chrome
1. Ouvrez Chrome et accédez à `chrome://extensions/`.
2. Activez le **Mode développeur** (en haut à droite).
3. Cliquez sur **Charger l'extension non empaquetée** et sélectionnez le dossier `extension/`.
4. Cliquez sur l'icône de l'extension et collez l'URL de votre WebApp Apps Script.

### 💡 Utilisation
1. Ouvrez un thread sur la Community Console (ex: `https://support.google.com/s/community/forum/.../thread/...`).
2. Cliquez sur le bouton flottant **"📌 Suivre dans Sheets"**.
3. L'extension enregistre le thread, sollicite l'IA Gemini, clique sur **Répondre** et insère directement le texte dans la zone de message !

---

## 🇬🇧 English Version

### 🚀 Features
- **"📌 Suivre dans Sheets" Button** injected onto Community Console thread pages.
- **Automatic Sync** of thread title, author, URL, and body content to Google Sheets.
- **Gemini AI Response Generation**: Analyzes questions and drafts detailed responses using Google Search Grounding for verified Help Center links.
- **Auto-Reply Placement**: Automatically clicks the *Reply* button and populates the editor text box.
- **Clipboard Fallback**: Automatically copies the draft response if the editor cannot be focused.
- **Material Design 3 Interface** inside Google Sheets for API key management.

### 🛠️ Prerequisites
- A Google Account with access to Google Sheets & Apps Script.
- A Google Gemini API key (free from Google AI Studio).
- Google Chrome browser.

### 📥 Setup Instructions

#### 1. Backend (Google Sheets & Apps Script)
1. Create a new Google Sheet.
2. Go to **Extensions > Apps Script**.
3. Copy all files from the `gas/` folder into your Apps Script project.
4. Refresh your Google Sheet to display the **"🛠️ Suivi PE"** menu.
5. Click **"🛠️ Suivi PE" > "Initialiser la feuille"**.
6. Deploy: **Deploy > New deployment > Web App**.
   - *Execute as*: Me.
   - *Who has access*: **Anyone**.
7. Copy the generated Web App URL.

#### 2. Gemini Configuration
1. In Google Sheets, open **"🛠️ Suivi PE" > "Ouvrir le panneau de contrôle"**.
2. Enter your Gemini API key and save.

#### 3. Chrome Extension
1. Open Chrome and navigate to `chrome://extensions/`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select the `extension/` directory.
4. Open the extension popup and paste your Apps Script Web App URL.

---

### 👤 Author & About
Développé par **Fabrice Faucheux** — [faucheux.bzh](https://faucheux.bzh)
