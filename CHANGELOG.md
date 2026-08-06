# Changelog

Toutes les modifications notables apportées à ce projet sont documentées dans ce fichier.

## [1.5.3] - 2026-08-06

### 👤 Optimisation de la Récupération des Prénoms / Auteurs sur WebApp Mobile

> **Garantir la capture exacte du prénom de l'utilisateur sur mobile.**  
> Les requêtes HTTP serveur sur le forum Google reçoivent un payload initial compact. Combiner l'extraction serveur avec un champ de saisie optionnel garantit d'avoir 100% de prénoms exacts.

- **Extraction Payload Google Server (`gas/MobileBackend.gs`)** : Analyse du bloc `googleusercontent.com` dans la réponse serveur initiale pour capturer l'auteur exact du post original sans dépendre du rendu client JavaScript.
- **Champ optionnel Prénom / Auteur (`gas/MobileUi.html`)** : Ajout d'un champ souple permettant d'indiquer directement le prénom de l'auteur sur mobile si souhaité, avec extraction automatique en cas d'absence.

## [1.5.2] - 2026-08-06

### 🛠️ Correction de la Détection Multilingue (Élimination des Faux Positifs Espagnols)

> **Rien de plus incohérent qu'un message d'accueil et de signature en espagnol autour d'un corps de texte rédigé en français.**  
> Les petits mots communs (la, de, en, un) provoquaient un chevauchement entre la détection du français et de l'espagnol sur certains textes courts.

- **Refonte du dictionnaire de détection (`detectLanguage`)** : Utilisation d'un vocabulaire discriminatif strict (`vous`, `votre`, `dans`, `pour`, `compte`...) bannissant tout chevauchement entre les langues.
- **Analyse combinée Question + Réponse Gemini** : La détection s'appuie désormais à la fois sur le texte de la question et sur le corps de texte généré par Gemini pour garantir un alignement linguistique parfait à 100%.

## [1.5.1] - 2026-08-06

### 🛠️ Extraction Dynamique du Nom de l'Auteur sur WebApp Mobile

> **Personnaliser l'accueil d'une réponse avec le vrai nom de l'utilisateur.**  
> Récupérer le vrai nom de la personne ayant posé la question sur le forum est essentiel pour que les formules d'accueil Gemini ("Bonjour [Nom]") soient parfaites.

- **Extraction JSON-LD & Meta HTML (`gas/MobileBackend.gs`)** : Analyse automatique des données structurées schema.org (`DiscussionForumPosting`), des balises meta `author` et des classes CSS du forum pour capturer le nom réel de l'auteur lors de la soumission d'une URL sur mobile.
- **Réponses IA totalement personnalisées** : Gemini reçoit directement le vrai nom de l'auteur au lieu d'une valeur générique.

## [1.5.0] - 2026-08-06

### 📱 Lancement de la WebApp Mobile Autonome pour iPhone / iPad

> **Pouvoir utiliser l'outil sur iPhone sans aucune restriction technique ni blocage de navigateur.**  
> Plutôt que de subir les blocages des favoris ou des extensions sur iOS, une véritable interface WebApp dédiée s'installe directement sur l'écran d'accueil de votre iPhone comme une application native.

- **Interface Mobile Autonome (`gas/MobileUi.html`)** : Interface dédiée en Material Design 3 (Glassmorphism) avec champ de saisie d'URL, bouton d'analyse et affichage de la réponse IA.
- **Extraction automatique côté serveur (`gas/MobileBackend.gs`)** : Extraction automatique du titre, du produit et du contenu directement par les serveurs Google (`UrlFetchApp`) pour contourner 100% des blocages CSP.
- **Bouton de copie rapide de la réponse** : Copie en 1 touche de la réponse générée par Gemini pour la coller directement dans le forum.
- **Installation en App sur l'écran d'accueil iPhone** : Ajout en 1 clic sur l'écran d'accueil iOS via *"Sur l'écran d'accueil"*.

## [1.4.2] - 2026-08-06

### 🛠️ Compatibilité Chrome iOS (Omnibox & Raccourcis Apple iOS)

> **Chrome sur iPhone bloque l'exécution directe du JS depuis le menu Favoris pour des raisons de sécurité.**  
> Taper le nom du favori dans la barre d'adresse Chrome ou utiliser le bouton Partager via un Raccourci iOS natif résout définitivement ce blocage.

- **Refonte ES5 XMLHttpRequest** : Version synchrone ultra-compatible sans `async/await` pour contourner les restrictions d'exécution mobile.
- **Raccourci iOS Natif (Bouton Partager)** : Documentation de la méthode native iOS fonctionnant dans Chrome et Safari via le menu "Partager".

## [1.4.1] - 2026-08-06

### 🛠️ Correction du Bookmarklet Mobile (Navigation Page Blanche iOS)

> **Rien de plus déroutant que de cliquer sur un favori mobile et de voir s'ouvrir une page blanche.**  
> Sur iOS (Safari et Chrome), l'évaluation des fonctions asynchrones dans l'URL d'un favori entraîne la navigation vers une page vierge.

- **Enveloppement `javascript:void(...)`** : Correction de l'IIFE du Bookmarklet pour bloquer la redirection de page et maintenir l'affichage sur le thread Google Community Console.
- **Affichage dynamique préservé** : L'overlay de statut (`Toast`) s'affiche désormais parfaitement au-dessus de la page mobile.

## [1.4.0] - 2026-08-06

### 📱 Support Mobile iPhone / iPad (Bookmarklet iOS)

> **Vous n'êtes pas toujours derrière votre ordinateur quand les utilisateurs sollicitent l'assistance.**  
> Pouvoir traiter un fil de discussion depuis son iPhone tout en bénéficiant de la puissance de Gemini et du suivi dans Google Sheets était impossible sans ordinateur.

- **Bookmarklet JavaScript Mobile (`mobile/bookmarklet.js`)** : Solution en 1 clic utilisable dans Chrome ou Safari sur iPhone/iPad.
- **Extraction & Envoi Mobile** : Déclenche l'analyse Gemini et la sauvegarde dans Google Sheets directement depuis le navigateur mobile.
- **Injection & Presse-papier sur Mobile** : Pré-remplit le champ de réponse mobile ou copie le résumé généré dans le presse-papier avec notification visuelle (`Toast`).

## [1.3.3] - 2026-08-04

### 💬 Alignement sur les Recommandations Google CM (Perte d'Accès Compte Google)

> **Un utilisateur bloqué hors de son compte ressent déjà du désarroi et de la frustration.**  
> Lui envoyer un lien de récupération automatique qui va droit dans le mur ne fait qu'amplifier son sentiment d'être ignoré par les experts. Il faut un accusé de réception humain et personnalisé dès les premières phrases.

- **Accusé de réception contextuel (Google Account)** : Gemini personnalise désormais les 1 ou 2 premières phrases en récapitulant les faits précis mentionnés par l'utilisateur (ex: ancien téléphone perdu, e-mail de secours obsolète).
- **Franchise et clarté immédiates** : Annonce directe et bienveillante dès le début de la réponse lorsque la récupération est impossible, évitant les renvois vers des liens génériques voués à l'échec.
- **Explication claire des règles de sécurité** : Présentation pédagogique des contraintes du système automatisé Google pour faire comprendre les raisons de la sécurité sans sentiment de rejet.

## [1.3.2] - 2026-08-04

### 🛠️ Correction de la résolution des URL Vertex AI

> **Rien de plus déroutant qu'un lien de redirection technique affiché en clair à un utilisateur.**  
> Voir apparaître une URL opaque `vertexaisearch.cloud.google.com/grounding-api-redirect/...` gâche la propreté de la réponse et nuit à la confiance de l'utilisateur.

- **Résolution universelle des URL Vertex AI** : Interception et conversion systématique de TOUTES les URL de redirection Vertex AI brutes vers leurs liens canoniques directs (ex. `https://support.google.com/mail/answer/...`).
- **En-têtes HTTP de redirection corrigés** : Amélioration de l'inspection de l'en-tête `Location` lors de l'appel `fetch` backend.

## [1.3.1] - 2026-08-04

### 🎨 Nettoyage du formatage des sources

> **Les crochets et parenthèses Markdown n'ont pas leur place dans un texte de réponse final.**  
> Les balises de type `[Titre](URL)` sont utiles pour du code, mais inutiles et inesthétiques dans un message d'assistance destinées à des utilisateurs finaux.

- **Suppression des crochets et parenthèses** : Conversion automatique du formatage des liens en `Titre : URL` propre et lisible.
- **Conversion RichText Google Sheets** : Transformation des URL brutes en hyperliens cliquables natifs dans la feuille de calcul (`setLinkUrl`).

## [1.3.0] - 2026-08-04

### 🌍 Support Multilingue (FR, EN, DE, ES, IT) & Clé API

> **Des utilisateurs du monde entier vous sollicitent dans leur propre langue.**  
> Répondre à un membre de la communauté en allemand, espagnol ou italien avec un message d'accueil générique casse le sentiment d'accompagnement humain et personnalisé. 

- **Prise en charge multilingue complète** : Détection automatique de la langue des questions posées en allemand (`de`), espagnol (`es`), italien (`it`), français (`fr`) et anglais (`en`).
- **Formules d'accueil et de conclusion naturelles** : Génération de messages de bienvenue et de politesse parfaitement adaptés dans chacune des 5 langues.
- **Configuration simplifiée de la clé API Gemini** : Champ de saisie sécurisé de la clé API directement dans le popup de l'extension Chrome avec bascule de visibilité.

## [1.2.0] - 2026-08-03

### 🚀 Nouveautés & Automatisation

> **Pourquoi répéter manuellement les mêmes gestes à chaque réponse ?**  
> Tu es concentré sur le problème d'un utilisateur, l'IA génère la réponse parfaite... mais tu dois encore cliquer sur "Répondre", chercher la zone de texte, et faire un copier-coller. Ces micro-manipulations coupent ton flux de travail des dizaines de fois par jour.

- **Clic et injection automatique de la réponse** : L'extension active automatiquement le bouton *Répondre* sur la Community Console et pré-remplit la zone de texte avec la réponse rédigée par Gemini.
- **Support des éditeurs riches et textareas** : Prise en charge intelligente des zones `contenteditable` (HTML rich text) et des champs texte standards de la Community Console.
- **Fallback automatique vers le presse-papier** : Si le bouton *Répondre* n'est pas accessible (ex: fil verrouillé ou statut restreint), la réponse est automatiquement copiée dans le presse-papier avec une alerte claire.
- **Retour visuel enrichi** : Le bouton de suivi affiche un statut dynamique (`✅ Envoyé & Réponse placée !` ou `✅ Envoyé (Réponse copiée 📋)`).

## [1.1.0] - 2026-07-29

### 🚀 Améliorations & Corrections

> **Fini les liens morts en pleine assistance !**  
> Tu réponds à un utilisateur sur le forum Google, tu cliques avec confiance sur le lien du Centre d'aide suggéré dans ton résumé... et boum : *"Erreur 404 - Page non trouvée"*. Rien de plus frustrant que de perdre en crédibilité et d'envoyer des liens cassés. 

- **Validation des URL anti-404** : Vérification HTTP systématique de chaque lien généré par l'IA avant son insertion dans Google Sheets.
- **Exploitation du Grounding Google Search** : Utilisation stricte des `groundingChunks` (URL réelles vérifiées par Google Search) et remplacement automatique des URL fictives ou devinées par Gemini.
- **Conversion RichText des hyperliens** : Prise en charge des liens Markdown `[Titre](URL)` dans Google Sheets via `setLinkUrl`, permettant d'obtenir des textes propres et cliquables au lieu d'URL brutes.
- **Résilience et Retries exponentiels** : Ajout de la fonction `fetchWithRetry` pour retenter automatiquement les requêtes API en cas de surcharge temporaire (HTTP 429 / 500 / 503).
