# Outil de suivi Community Console (PE Tracker)

[![Version](https://img.shields.io/badge/version-1.10.0-blue.svg)](CHANGELOG.md)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Chrome MV3](https://img.shields.io/badge/Chrome-Manifest_V3-green.svg)](extension/manifest.json)
[![Google Apps Script](https://img.shields.io/badge/Backend-Google_Apps_Script-blue.svg)](gas/)

*Read this in [English](#english-version).*

Cet outil complet est destiné aux **Product Experts (PE) Google** pour automatiser la gestion, le suivi et la réponse aux questions (threads) de la Google Community Console directement depuis Google Sheets, Google Chrome et vos appareils mobiles (iPhone/iPad).

---

## 🇫🇷 Version Française

### 🚀 Fonctionnalités & Avancées Récentes

#### 📱 Extension Chrome & Bookmarklet Mobile iOS
- **Bouton flottant "📌 Suivre dans Sheets"** : Injecté automatiquement sur les pages des threads desktop.
- **Support Mobile iPhone/iPad (`mobile/bookmarklet.js` & `gas/MobileUi.html`)** :
  - WebApp mobile dédiée en Glassmorphism pour traiter les questions depuis un smartphone.
  - Bookmarklet JavaScript standard compatible Safari et Chrome iOS.
- **Extraction automatique du DOM** : Titre, auteur, produit Google concerné, corps de la question et détails techniques.
- **Service Worker d'Arrière-Plan (`background.js`)** : Gestion asynchrone des requêtes HTTP Cross-Origin vers Google Apps Script sans blocage CORS.
- **Placement Automatique de la Réponse** :
  - Détection automatique et clic sur le bouton **Répondre** / **Reply**.
  - Localisation de l'éditeur de texte (`contenteditable` ou `textarea`).
  - Injection directe de la réponse formulée par Gemini et défilement fluide (`scrollIntoView`).
- **Fallback Presse-Papier Intelligent** : Copie automatique de la réponse dans le presse-papier si le fil est verrouillé ou le champ non modifiable.
- **Gestionnaire de Clé API Gemini & Secret Partagé** : Champs de saisie sécurisés avec masquage directement dans le popup de l'extension.

#### 🗣️ Qualité et Naturel des Réponses
- **Refus de répondre à côté** : Chaque thread est classé en `REPONSE`, `CLARIFICATION` ou `HORS_SUJET`. Lorsqu'un élément manque (source de données, message d'erreur, version, étapes déjà tentées), l'outil rédige une demande de précisions au lieu d'une procédure générique inapplicable.
- **Niveau de confiance affiché** : `HAUTE`, `MOYENNE` ou `FAIBLE`, reporté dans la colonne *Notes* de la feuille et signalé par un avertissement avant publication.
- **Alerte sur les chemins d'interface non sourcés** : Une procédure « cliquez ici puis là » rédigée sans qu'aucune source n'ait été consultée provient de la mémoire du modèle, donc d'un état passé de l'interface. Les libellés de menus Google étant fréquemment renommés ou supprimés, ces réponses sont rétrogradées en confiance faible et signalées avant publication.
- **Formules de clôture personnalisables** : Vos propres phrases, saisies dans le panneau de contrôle, une par ligne, tirées sans répétition immédiate. Un tiret seul déclare une clôture vide : le message s'arrête alors sur le fond, sans transition artificielle avant la signature.
- **Filtre anti-tics** : Suppression automatique des formules « Voici les étapes à suivre », « En résumé », « Il est important de noter que », « J'espère que cela vous aidera », des titres décoratifs et des séparateurs.
- **Procédure officielle de récupération de compte** : Toute réponse portant sur une perte d'accès se termine par `https://g.co/recover`, avec une phrase d'introduction adaptée selon que la personne a déjà tenté la procédure ou non. Ce lien est protégé contre la validation HTTP et ne peut jamais être supprimé d'une réponse.
- **Sources officielles systématiques** : Dès que la recherche fait remonter un article du Centre d'aide pertinent, il est cité en fin de réponse. Un lien n'est supprimé que si son inexistence est **prouvée** (404 confirmé) : un incident réseau ou un 503 ne le fait plus disparaître.
- **Apprentissage de votre style (boucle de retour)** : L'extension enregistre le texte que vous avez réellement publié, colonne *Réponse publiée*, **uniquement s'il diffère de la proposition**. Vos trois dernières réponses retouchées sont réinjectées dans le prompt comme exemples de style. Une proposition publiée telle quelle n'est pas conservée : elle ne ferait qu'apprendre au modèle sa propre production, dont les tics se renforceraient à chaque génération. La colonne *Notes* indique la part réécrite, ce qui donne une mesure objective de la qualité des propositions.
- **Traitement des relances** : Bouton **« 💬 Répondre à la relance »** lorsque la personne a répondu après vous. La relance est classée (`RESOLU`, `ECHEC`, `INCOMPRIS`, `NOUVEAU`, `HORS_SUJET`) et la réponse est adaptée à chaque cas — un remerciement appelle deux phrases, un échec interdit de reproposer la même manipulation. Un garde-fou mesure le recouvrement avec votre réponse précédente et vous alerte si la proposition la reformule. La colonne *Date de relance* et le statut *Résolue* sont mis à jour automatiquement.
- **Relecture humaine obligatoire** : La proposition est placée dans le champ de réponse mais jamais publiée automatiquement.

#### 🔐 Sécurité
- **Secret partagé obligatoire** : La WebApp étant publiée en accès « N'importe qui », chaque requête doit présenter un secret généré depuis le panneau de contrôle.
- **Clé API en en-tête HTTP** (`x-goog-api-key`) et filtrage systématique des secrets (`redactSecrets_`) dans les journaux et les messages d'erreur.
- **Allowlist de domaine** sur l'extraction serveur : seules les URL `support.google.com` sont récupérables (protection anti-SSRF).

#### 🤖 Backend Google Apps Script & IA Gemini
- **Alignement Recommandations Google CM (Compte Google)** : Prise en compte des directives officielles pour accuser réception des faits précis, être direct sur la faisabilité et expliquer clairement les règles de sécurité.
- **Support Multilingue Avancé (FR, EN, DE, ES, IT)** : Détection automatique de la langue avec adaptation des formules d'accueil et de clôture.
- **Génération IA avec Google Search Grounding** : Utilisation des modèles Gemini (Gemini 3.7 Flash) avec ancrage temps réel sur Google Search.
- **Formatage RichText Google Sheets** : Conversion automatique du Markdown généré par Gemini en texte enrichi nativement cliquable (`setLinkUrl`) et lisible (gras, puces, nettoyage des séparateurs).
- **Protection des Données Personnelles (PII)** : Masquage automatique des e-mails, numéros de téléphone et clés API avant toute transmission à l'IA.
- **Résilience & Tentatives avec Backoff Exponentiel (`fetchWithRetry`)** : Prise en charge des surcharges API temporaires (HTTP 429, 500, 503).
- **Verrouillage anti-course (`LockService`)** : Élimination des conflits d'écritures simultanées sur la feuille Sheets.

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
3. Copiez l'ensemble des fichiers du dossier `gas/` (`Code.gs`, `Api.gs`, `Gemini.gs`, `Ui.gs`, `Config.gs`, `Sidebar.html`, `MobileBackend.gs`, `MobileUi.html`, `appsscript.json`) dans votre projet.
4. Actualisez votre feuille Google Sheets : le menu **"🛠️ Suivi PE"** apparaît.
5. Cliquez sur **"🛠️ Suivi PE" > "Initialiser la feuille"**.
6. Déployez l'application Web : **Déployer > Nouveau déploiement > Application Web**.
   - *Exécuter en tant que* : Vous (`votre_email@gmail.com`).
   - *Qui a accès* : **N'importe qui** (Anyone).
7. Copiez l'URL de l'application Web générée.

#### 2. Configuration de la Clé API Gemini et du Secret Partagé
1. Dans Google Sheets, cliquez sur **"🛠️ Suivi PE" > "Ouvrir le panneau de contrôle"**.
2. Saisissez votre clé d'API Gemini et cliquez sur **Sauvegarder**.
3. Dans la carte **Secret partagé**, cliquez sur **🎲 Générer un nouveau secret**, puis **Sauvegarder**.
   - ⚠️ Ce secret est **obligatoire** : la WebApp étant déployée en accès « N'importe qui », il constitue la seule barrière empêchant un tiers qui connaîtrait votre URL `/exec` d'écrire dans votre feuille et de consommer votre quota Gemini.
   - Recopiez-le ensuite dans l'extension Chrome et sur la WebApp mobile (il n'est demandé qu'une fois par appareil).

#### 3. Installation de l'Extension Chrome
1. Ouvrez Chrome et rendez-vous sur `chrome://extensions/`.
2. Activez le **Mode développeur** (en haut à droite).
3. Cliquez sur **Charger l'extension non empaquetée** et sélectionnez le dossier `extension/` du projet.
4. Cliquez sur l'icône de l'extension installée, collez l'URL de votre WebApp Google Apps Script **et le secret partagé** généré à l'étape précédente.

---

### 💡 Utilisation
1. Ouvrez un thread sur la Google Community Console.
2. Cliquez sur le bouton **"📌 Suivre dans Sheets"** en bas de l'écran.
3. L'extension enregistre les données dans Sheets, génère la réponse via Gemini, clique sur **Répondre** et place directement le texte dans le champ de réponse !
4. Relisez, adaptez au besoin et cliquez sur **Publier** : si vous modifiez la proposition, votre version est automatiquement capturée pour affiner les prochaines générations selon votre style réel.

---

<a name="english-version"></a>
## 🇬🇧 English Version

### 🚀 Features & Recent Developments

#### 📱 Chrome Extension & Mobile Support
- **Floating "📌 Suivre dans Sheets" Button**: Injected automatically on Google Support / Community Console thread pages.
- **Mobile iPhone/iPad Support (`mobile/bookmarklet.js` & `gas/MobileUi.html`)**:
  - Dedicated Glassmorphism mobile WebApp to process threads on smartphones.
  - Standard JavaScript Bookmarklet compatible with iOS Safari and Chrome.
- **Automated DOM Extraction**: Scrapes thread title, author, product, question content, and technical details.
- **Background Service Worker (`background.js`)**: Handles cross-origin HTTP requests to Apps Script without CORS restrictions.
- **Automatic Reply Placement**:
  - Automatically detects and clicks the **Reply** button.
  - Locates the editor element (`contenteditable` or `textarea`).
  - Directly populates Gemini's generated response and scrolls smoothly to the editor.
- **Smart Clipboard Fallback**: Automatically copies the draft response to the clipboard if the reply button or text box is inaccessible.
- **Gemini API Key & Shared Secret Manager**: Secure masked input fields directly in the extension popup.

#### 🗣️ Response Quality & Tone
- **Refusal to Guess**: Threads are classified into `REPONSE` (Answer), `CLARIFICATION` (Needs info), or `HORS_SUJET` (Off-topic). If essential context is missing (error logs, data sources, OS/versions), it asks targeted questions instead of generating inapplicable steps.
- **Confidence Scoring**: `HAUTE` (High), `MOYENNE` (Medium), or `FAIBLE` (Low), logged in the *Notes* column and flagged to the user.
- **Variable Greetings & Closings**: Multiple opening and closing shells rotated dynamically to prevent repetitive template patterns.
- **Anti-AI Boilerplate Filter**: Automatically removes conversational filler ("Here are the steps to follow", "In summary", "It is important to note that", "I hope this helps", decorative markdown headers).
- **Official Account Recovery Protocol**: Any loss-of-access query finishes with `https://g.co/recover`, customized depending on whether the user has already attempted recovery. This trusted link bypasses network pruning and is never omitted.
- **Verified Official Sources**: Cites official Google Help Center articles discovered via real-time search grounding. Links are only dropped when verified as 404 dead links (network errors or 5xx preserve the link).
- **Dynamic Few-Shot Style Learning**: The extension records human-edited published answers in the *Réponse publiée* column. Your 3 latest edited messages are fed back into Gemini's system prompt as few-shot style examples. Unedited proposals are excluded to prevent AI model collapse.
- **Mandatory Human Proofreading**: Proposals are placed in the reply editor but never published automatically.

#### 🔐 Security
- **Mandatory Shared Secret**: Since the WebApp is deployed as "Anyone", incoming requests must provide a shared secret token generated from the control panel.
- **API Key via HTTP Header** (`x-goog-api-key`) and automated secret scrubbing (`redactSecrets_`) in logs and exception traces.
- **Server Domain Allowlist**: Restricts server-side fetching strictly to `support.google.com` (anti-SSRF).

#### 🤖 Google Apps Script Backend & Gemini AI
- **Official CM Guidelines Alignment**: Acknowledges specific facts first, stays direct on feasibility, and explains security rationales clearly.
- **Multi-Language Support (FR, EN, DE, ES, IT)**: Language detection with tailored greetings and signatures.
- **Google Sheets RichText Formatting**: Converts Markdown into native clickable hyperlinks (`setLinkUrl`), bold text, and structured bullet lists.
- **PII Protection**: Automatically masks email addresses, phone numbers, and API tokens before AI transmission.
- **Exponential Backoff Retries (`fetchWithRetry`)**: Resilient handling of transient HTTP rate limits (HTTP 429, 500, 503).
- **Concurrency Locking (`LockService`)**: Eliminates race conditions during concurrent submissions.

---

### 📥 Setup Instructions

#### 1. Backend (Google Sheets & Apps Script)
1. Create a new **Google Sheet**.
2. Navigate to **Extensions > Apps Script**.
3. Copy all files from the `gas/` directory (`Code.gs`, `Api.gs`, `Gemini.gs`, `Ui.gs`, `Config.gs`, `Sidebar.html`, `MobileBackend.gs`, `MobileUi.html`, `appsscript.json`) into your Apps Script project.
4. Refresh your Google Sheet to view the **"🛠️ Suivi PE"** menu.
5. Click **"🛠️ Suivi PE" > "Initialiser la feuille"**.
6. Deploy: **Deploy > New deployment > Web App**.
   - *Execute as*: Me.
   - *Who has access*: **Anyone**.
7. Copy the generated Web App URL.

#### 2. Gemini API Key & Shared Secret Setup
1. In Google Sheets, open **"🛠️ Suivi PE" > "Ouvrir le panneau de contrôle"**.
2. Paste your Gemini API key and click **Sauvegarder**.
3. Under the **Secret partagé** card, click **🎲 Générer un nouveau secret**, then **Sauvegarder**.
   - ⚠️ This secret is **mandatory**: it protects your WebApp endpoint from unauthorized access and quota exhaustion.
   - Copy this secret to use in the Chrome extension and Mobile WebApp.

#### 3. Chrome Extension Installation
1. Open Chrome and navigate to `chrome://extensions/`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select the `extension/` directory.
4. Click the extension icon, paste your Apps Script Web App URL **and the shared secret**.

---

### 🧪 Tests

Le backend Apps Script est couvert par une suite de tests unitaires et d'intégration sans dépendance externe (services Google simulés) :
The Apps Script backend is covered by an automated test suite with mock Google services:

```bash
npm test
```

---

### 👤 Author & License
- Développé par **Fabrice Faucheux** — [faucheux.bzh](https://faucheux.bzh)
- Distributed under the **MIT License**. See [LICENSE](LICENSE) for details.
