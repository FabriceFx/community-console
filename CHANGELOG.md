# Changelog

Toutes les modifications notables apportées à ce projet sont documentées dans ce fichier.

## [1.8.0] - 2026-08-15

### 🪞 Seules les Réponses Retouchées Alimentent le Style

> **Une proposition publiée sans la moindre modification n'apprend rien sur la façon d'écrire du Product Expert.**
> La conserver comme exemple reviendrait à faire apprendre au modèle sa propre production : ses tics d'écriture se renforceraient d'une génération à l'autre, exactement l'inverse du but recherché. Seule la part réécrite porte du signal.

- **Mesure de l'écart (`tauxDeModification_`)** : Comparaison par multi-ensemble de mots entre la proposition et le texte publié, insensible à la casse et aux espaces. En deçà de 5 % de mots réécrits (`CONFIG.MIN_EDIT_RATIO`), la publication est considérée comme non retouchée.
- **Rien n'est stocké inutilement (`gas/Api.gs`)** : Une réponse publiée telle quelle ne remplit plus la colonne *Réponse publiée* — le texte figure déjà en colonne *Résumé / Action (Gemini)*. Seule la note « publiée sans modification » est ajoutée.
- **Mesure de qualité dans la feuille** : Les réponses retouchées sont annotées « publiée après retouche (N % réécrit) ». La proportion de publications sans modification devient un indicateur direct de la qualité des propositions.
- **Corpus de style préservé** : `getStyleExamples_` ne voit désormais que des textes réellement réécrits par le PE, ce qui écarte tout risque de boucle d'auto-renforcement.
- **Retour explicite dans l'extension** : Le bouton affiche « Retouche enregistrée (N %) » ou « Proposition non modifiée » selon le cas, au lieu d'un succès indifférencié.
- **Couverture de test (`tests/05-detection-retouche.test.js`)** : 11 cas, dont les variations de casse, d'espacement et de ponctuation qui ne doivent jamais compter comme une retouche.

## [1.7.2] - 2026-08-15

### 💾 Mémorisation du Brouillon — Correction de « Éditeur de réponse introuvable »

> **Une fois le message publié, le forum retire l'éditeur du DOM.** Or c'est justement après avoir publié que l'on pense à cliquer sur « Enregistrer ma version » : le bouton lisait alors un éditeur qui n'existait plus et échouait.

- **Mémorisation continue du brouillon (`extension/content.js`)** : Un écouteur `input` en phase de capture conserve le dernier contenu connu de la zone de réponse pendant la saisie. La capture reste possible après la fermeture de l'éditeur.
- **Amorçage à l'injection** : Le texte injecté par Gemini alimente la mémoire dès le départ — sans cela, une réponse publiée sans la moindre retouche ne déclenchait aucun événement `input` et restait inenregistrable.
- **Sélection du meilleur texte (`choisirTexteACapturer`)** : L'éditeur encore présent prime ; sinon on retombe sur la mémoire. Un éditeur vidé par la publication n'écrase jamais le contenu mémorisé.
- **Messages d'erreur actionnables** : « Éditeur de réponse introuvable » est remplacé par un message qui distingue les cas — réponse déjà enregistrée, ou marche à suivre pour la coller à la main dans la colonne « Réponse publiée ». Un échec réseau renvoie désormais vers la vérification de l'URL WebApp et du secret partagé.
- **Plus de double enregistrement** : Un indicateur de capture réussie évite qu'un second clic ne réécrive la même version, et le bouton de capture est exclu de la détection du clic « Publier ».
- **Couverture de test** : 7 cas sur la bascule éditeur vivant / contenu mémorisé.

## [1.7.1] - 2026-08-15

### 🎯 Fiabilisation de la Détection du Bouton « Publier »

> **« Répondre » ouvre l'éditeur, « Publier » envoie le message.** Confondre les deux faisait enregistrer comme publiés des textes qui ne l'étaient pas, polluant le corpus de style qui alimente le prompt.

- **Retrait de « Répondre » / « Reply » des libellés de publication (`extension/content.js`)** : Dans la Community Console, ce bouton ouvre la zone de réponse — c'est même celui que `injecterReponse()` clique par programme. Sa présence dans la liste provoquait deux faux positifs : le clic automatique de l'extension, et un clic sur le « Répondre » d'un autre message du fil.
- **Correspondance par début de libellé plutôt que par inclusion** : « Publier » et « Publier la réponse » sont reconnus ; « Répondre à ce message » et « Signaler ce post » ne le sont plus, alors que la recherche par sous-chaîne les acceptait.
- **Exclusions étendues** : « Modifier » et « Aperçu » s'ajoutent à « Annuler », « Brouillon » et « Supprimer ».
- **Couverture de test (`tests/04-detection-publication.test.js`)** : 19 cas verrouillant les libellés qui doivent déclencher la capture et, surtout, ceux qui ne doivent jamais la déclencher.

## [1.7.0] - 2026-08-15

### 🔄 Apprentissage du Style Réel, Retour des Sources d'Aide

> **L'outil enregistre désormais ce que vous publiez réellement, pas seulement ce qu'il a proposé.**
> L'écart entre les deux décrit votre style et votre jugement mieux que n'importe quelle consigne. Ces réponses nourrissent le prompt, et l'outil s'aligne sur votre écriture à mesure que vous l'utilisez.

#### Boucle de retour (nouveau)
- **Colonne « Réponse publiée » (`CONFIG.COLUMNS`)** : Douzième colonne recevant le texte final effectivement posté sur le forum. Migration automatique des feuilles existantes via `ensureColumns_` — `setupSheet` ne posant ses en-têtes que sur une feuille vierge, une feuille déjà en service ne l'aurait jamais reçue.
- **Capture à la publication (`extension/content.js`)** : Écoute en phase de capture du clic sur le bouton d'envoi du forum, afin de lire l'éditeur avant que le champ ne soit vidé. L'extension ne publie rien : elle observe. Les libellés « Annuler », « Brouillon » et « Aperçu » sont explicitement exclus.
- **Bouton de capture manuelle** : Filet de sécurité si la détection automatique échoue (libellé inattendu, envoi au clavier).
- **Endpoint `recordPublished` (`gas/Api.gs`)** : Retrouve la ligne par URL de thread en partant de la fin, écrit la réponse publiée et bascule le statut en « En attente (User) ».
- **Exemples de style dans le prompt (`getStyleExamples_`)** : Les trois dernières réponses publiées sont réinjectées dans les instructions système, avec priorité explicite sur les consignes descriptives. La coquille automatique (accueil, clôture, signature) est retirée par `stripReplyShell_` — seul le corps a valeur d'exemple, et le prénom de l'usager ne transite pas dans le prompt. Les exemples passent par `sanitizePii` et sont mis en cache 30 minutes.

#### Correction — disparition des liens du Centre d'aide
- **Consigne de sources rétablie** : La formulation « un lien maximum, et seulement s'il apporte vraiment quelque chose », placée à côté de l'interdiction d'inventer des URL, poussait le modèle à n'en citer aucun. Les sources sont de nouveau exigées dès que la recherche en fait remonter une, avec la précision que les URL issues de googleSearch sont fiables par construction.
- **Lignes de sources exclues du quota de mots** : La limite de 150 mots pouvait à elle seule évincer le lien final.
- **Vérification d'URL à trois états (`checkUrlStatus_`)** : `isUrlValid` renvoyait `false` aussi bien pour un 404 avéré que pour un simple échec réseau — et depuis la 1.5.5, un `false` supprime le lien. Un article parfaitement valide disparaissait donc au moindre incident. Un lien n'est désormais retiré que si son inexistence est prouvée (4xx) ; un 5xx ou une erreur réseau le conservent.
- **En-tête `Range` retiré** : Certains serveurs y répondent 416, ce qui faisait passer une page valide pour morte. Remplacé par un User-Agent de navigateur.

#### Qualité du code
- **Indices de colonnes centralisés (`CONFIG.COL`)** : Fin des `getRange(row, 9)` et `getRange(row, 11)` disséminés dans quatre fichiers.
- **Suite de tests versionnée (`tests/`, `npm test`)** : 45 tests sans dépendance externe, les services Google étant simulés dans un contexte `vm`. Les deux régressions du cycle précédent (deux-points supprimés, portée du `matches`) auraient été interceptées.

## [1.6.1] - 2026-08-15

### 🔑 Procédure Officielle de Récupération de Compte Google

> **Sur une perte d'accès à un compte Google, `https://g.co/recover` est le seul canal existant : aucun formulaire alternatif, aucun contact humain, aucun support téléphonique ne permet de récupérer un compte.**
> Ce lien doit donc figurer systématiquement, sans jamais se substituer à une vraie réponse.

- **Lien systématique (`gas/Gemini.gs`)** : Toute réponse portant sur une perte d'accès se termine par la ligne `Procédure officielle de récupération : https://g.co/recover`. La consigne précise explicitement que ce lien termine la réponse sans la remplacer : un message réduit à ce seul lien serait sans valeur.
- **Formulation adaptée au cas** : Trois variantes d'introduction selon que la personne n'a pas encore tenté la procédure (la suivre depuis un appareil et un lieu habituels), l'a déjà tentée sans succès (c'est malgré tout la seule voie, une nouvelle tentative depuis un appareil connu augmente les chances) ou se trouve dans une situation sans issue (le dire plutôt que laisser espérer).
- **Interdiction des contournements** : Le modèle ne doit proposer aucune voie alternative, aucun formulaire tiers ni aucun contact humain.
- **Liens officiels protégés (`CONFIG.TRUSTED_URLS`, `isTrustedUrl_`, `canonicalTrustedUrl_`)** : `g.co/recover` est un raccourci de redirection. Le soumettre au validateur HTTP était à la fois inutile et risqué — un échec réseau ponctuel aurait silencieusement supprimé le lien que l'on veut toujours présent. Ces URL contournent désormais la validation, ne déclenchent aucune requête réseau et sont normalisées (ponctuation de fin de phrase et barre oblique finale laissées hors du lien cliquable).
- **Exception à la limite d'un lien** : La procédure de récupération peut s'ajouter à une autre source, contrairement à la règle générale.

## [1.6.0] - 2026-08-15

### 🗣️ Réponses Humaines, Refus de Répondre à Côté et Verrouillage de la WebApp

> **Une réponse d'IA se repère à deux choses : elle est toujours emballée dans la même formule, et elle produit une procédure crédible même quand la question ne contient pas de quoi y répondre.**
> Décrire la syntaxe d'`IMPORTXML` à quelqu'un qui n'a pas indiqué sa source de données ne l'aide en rien : la réponse est plausible, mais vide. Cette version s'attaque aux deux problèmes, et referme les brèches de sécurité de la WebApp publique.

#### Pertinence des réponses
- **Refus de répondre à côté (`gas/Gemini.gs`)** : Le modèle classe désormais chaque thread en `REPONSE`, `CLARIFICATION` ou `HORS_SUJET`. S'il lui manque un élément — source de données, message d'erreur, version, étapes déjà tentées — il rédige une demande de précisions au lieu d'une procédure générique inapplicable.
- **Niveau de confiance explicite** : Chaque proposition est accompagnée d'un niveau `HAUTE`/`MOYENNE`/`FAIBLE`, reporté en colonne *Notes* de la feuille et affiché en avertissement dans l'extension, la WebApp mobile et le bookmarklet avant toute publication.
- **Instructions système dédiées (`systemInstruction`)** : Consignes de rôle sorties du tour utilisateur, limite de 150 mots (60 en clarification), interdiction d'inventer une URL ou un intitulé d'interface.

#### Style des messages
- **Coquilles variables (`REPLY_SHELLS`)** : Trois formules d'accueil et quatre de clôture par langue, tirées sans répétition immédiate, en remplacement du bloc figé publié à l'identique à chaque réponse.
- **Prénom employé une seule fois** : La répétition du prénom dans un message court trahissait un modèle de publipostage.
- **Accueil adapté au contexte** : Plus de « bienvenue sur la communauté de Inconnu » quand le produit n'est pas identifié, ni de message de bienvenue sur une simple demande de précisions.
- **Filtre anti-tics (`humanizeBody_`)** : Suppression des formules « Voici les étapes à suivre », « En résumé », « Il est important de noter que », « J'espère que cela vous aidera », « Bien sûr », des titres décoratifs et des séparateurs.
- **Température de génération à 0.85** : Une température basse produisait des tournures quasi identiques d'une réponse à l'autre, rendant la série reconnaissable.
- **Harmonisation multilingue** : Les mentions « Je suis un utilisateur comme vous » restantes en espagnol et en italien ont été retirées.

#### Sécurité
- **Secret partagé obligatoire (`gas/Config.gs`, `assertAuthorized_`)** : La WebApp étant publiée en accès « N'importe qui », toute requête `doPost` ou mobile doit désormais présenter un secret généré depuis le panneau de contrôle. Sans lui, un tiers connaissant l'URL `/exec` pouvait consommer le quota Gemini et écrire dans la feuille.
- **Clé API hors des URL (`x-goog-api-key`)** : La clé transitait en paramètre d'URL et se retrouvait dans les messages d'exception, donc dans les journaux et jusque dans une boîte de dialogue de l'interface. Elle passe en en-tête, et tout message d'erreur est filtré par `redactSecrets_`.
- **Fin de la persistance de la clé reçue (`gas/Api.gs`)** : Une clé transmise par requête ne sert plus qu'à l'appel en cours et n'écrase plus celle du propriétaire.
- **Allowlist de domaine (`assertAllowedHost_`)** : La WebApp mobile ne peut plus récupérer que des URL `support.google.com`, et n'est donc plus un proxy HTTP ouvert agissant au nom du compte Google propriétaire.
- **Stockage local dans l'extension** : Clé API et secret passent de `chrome.storage.sync` (répliqué en clair sur tous les appareils du profil) à `chrome.storage.local`, avec migration automatique.
- **Désindexation de `gas/.clasp.json`** : Le fichier était suivi par Git malgré son ajout au `.gitignore`.

#### Corrections
- **Deux-points préservés (`gas/Gemini.gs`)** : Le nettoyage des liens morts supprimait tous les deux-points en fin de ligne, mutilant chaque « Procédez comme suit : » du texte. Le repérage se fait maintenant par marqueur interne, strictement à l'emplacement de l'URL retirée.
- **Verrou réellement appliqué (`LockService`)** : L'échec de `waitLock` était intercepté et l'écriture se poursuivait sans verrou, précisément dans le cas de contention qu'il devait couvrir. Remplacé par `tryLock` avec abandon explicite et message à l'appelant.
- **Portée de l'extension rétablie (`extension/manifest.json`)** : La restriction aux pages `/s/community/*` faisait disparaître le bouton des threads publics `support.google.com/<produit>/thread/...`. Les deux motifs sont désormais couverts.
- **Throttle au lieu de debounce (`extension/content.js`)** : Sur une page qui mute en continu, le debounce se réarmait indéfiniment et le bouton pouvait ne jamais apparaître.
- **Plafond du repli d'extraction** : Le repli générique sur les balises `<p>` ramassait navigation et pied de page ; il est limité à 2 000 caractères, contre 10 000 pour le sélecteur précis.

## [1.5.5] - 2026-08-15

### 🛡️ Fiabilisation des Liens Grounding, Concurrence Sheets et Extraction Mobile

> **Rien n'est plus frustrant que de poster une réponse d'aide trompeuse qui renvoie vers un mauvais article Google, ou de constater que les colonnes de suivi sautent silencieusement.**  
> Lorsqu'un lien 404 était remplacé par une URL de recherche sans rapport, la réponse semblait crédible mais induisait l'utilisateur en erreur. De même, les requêtes simultanées et l'injection du script sur tout le domaine provoquaient des blocages invisibles.

- **Élimination des liens de substitution trompeurs (`gas/Gemini.gs`)** : En cas d'échec de validation d'un lien d'aide Google, le système conserve désormais le libellé seul sans tenter d'injecter une première URL de recherche sans rapport.
- **Initialisation automatique et robuste des feuilles (`gas/Code.gs`, `gas/Api.gs`, `gas/MobileBackend.gs`)** : Pose garantie des en-têtes et des listes déroulantes de statuts dès la première ligne créée via Webhook ou Mobile, sans blocage d'interface.
- **Protection anti-course (`LockService`)** : Encapsulation des écritures `appendRow` et `setRichTextValue` pour éliminer tout risque d'écrasement de ligne lors de soumissions simultanées.
- **Alignement du modèle par défaut (`gas/Config.gs`, `gas/Sidebar.html`)** : Harmonisation sur `gemini-3.7-flash` par défaut (suppression du modèle déprécié `gemini-pro`).
- **Enrichissement de l'interface mobile (`gas/MobileUi.html`, `gas/MobileBackend.gs`)** : Ajout d'un champ optionnel pour coller l'intégralité de la question sur mobile afin de dépasser les limites du rendu client (SPA) des forums Google.
- **Performance SPA & Sécurité Extension (`extension/content.js`, `extension/manifest.json`)** : Temporisation (*debounce* 300 ms) sur le `MutationObserver`, élargissement de la limite de taille du contenu à 10 000 caractères et restriction stricte des permissions aux pages `/s/community/*`.
- **Nettoyage de code (`gas/Gemini.gs`, `gas/Code.gs`)** : Simplification de la condition de retry HTTP et suppression du code de debug (`testRichText`).

## [1.5.4] - 2026-08-14

### 🧠 Passage au Modèle d'IA Gemini 3.7 Flash

> **Des réponses encore plus précises, instantanées et parfaitement contextualisées dès la première lecture.**  
> Obtenir une assistance IA qui saisit instantanément les subtilités d'une demande technique complexe, applique le raisonnement adapté et fournit des sources officielles infaillibles sans délai d'attente.

- **Intégration du Modèle Gemini 3.7 Flash** : Mise à niveau de la configuration et des recommandations de modèles pour bénéficier d'une meilleure compréhension contextuelle des requêtes d'entraide et d'une formulation encore plus fluide des réponses.
- **Mise à jour des interfaces et de la documentation** : Actualisation des guides, des placeholders de configuration dans la barre latérale Apps Script et des règles du projet.

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
