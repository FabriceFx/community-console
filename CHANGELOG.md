# Changelog

Toutes les modifications notables apportées à ce projet sont documentées dans ce fichier.

## [1.12.3] - 2026-08-15

### 🔀 Détection d'un Backend Non Redéployé

> **« Ce thread n'est pas encore suivi. Cliquez d'abord sur Suivre dans Sheets » — alors que le fil avait bien reçu une réponse.**
> Ce message n'existe plus dans le code depuis la 1.10.2. Il provenait de la WebApp Apps Script, restée sur une version antérieure : l'extension et le backend se déploient séparément, et recharger l'extension ne met pas à jour la WebApp.

- **Version portée par chaque réponse (`CONFIG.VERSION`, `jsonOutput_`)** : Le backend annonce sa version dans toutes ses réponses, y compris celles de la WebApp mobile.
- **Comparaison côté extension (`verifierVersionBackend`)** : Un écart déclenche un avertissement unique indiquant les deux versions et la marche à suivre.
- **Marche à suivre explicitée** : Copier les fichiers `gas/` ne suffit pas — la WebApp sert la *version de déploiement*, pas le code enregistré. Il faut créer une nouvelle version via *Déployer > Gérer les déploiements > ✏️ > Version : Nouvelle version*.
- **Consigne inscrite dans `AGENTS.md` et le README** : `CONFIG.VERSION` fait désormais partie du rituel d'incrémentation, au même titre que `manifest.json`, `CHANGELOG.md` et `README.md`.

## [1.12.2] - 2026-08-15

### 🚪 L'Analyse du Fil Était Inatteignable dès le Bouton Posé

> **Après rafraîchissement d'une page, la console n'affichait plus aucune ligne de diagnostic.**
> `initTracker` sortait sur `if (document.getElementById('pe-tracker-btn')) return;` — une garde placée **avant** l'analyse. Au premier passage, la page n'étant pas encore construite, le bouton était créé et l'analyse ne trouvait rien. À tous les passages suivants, la fonction sortait avant de l'atteindre. Les douze tentatives de reprise introduites en 1.12.1 ne pouvaient jamais s'exécuter.

- **Création et analyse séparées (`creerBoutonPrincipal`, `initTracker`)** : Le bouton principal n'est créé qu'une fois ; l'analyse du fil se répète tant que la Community Console n'a pas fini de construire sa page.
- **Arrêt explicite de l'analyse (`analyseTerminee`)** : Une fois le fil lu — ou le quota d'essais épuisé — l'extraction cesse d'être relancée à chaque mutation du DOM. Elle lit beaucoup d'`innerText`, ce qui force un recalcul de mise en page à chaque appel.
- **Espaces insécables** : L'interface emploie des espaces insécables (`10&nbsp;caractères`, visible dans les attributs `aria-label`). Les motifs écrits avec une espace ordinaire ne reconnaissaient donc pas « 2&nbsp;vues », et le compteur restait dans le texte transmis au modèle. Normalisation ajoutée avant tout filtrage.
- **Compteurs et horodatages plus tolérants** : « 2 vues 1 réponse » sur une même ligne, et les durées en anglais, sont désormais reconnus. Un nombre ouvrant une phrase utile — « 2 fichiers ne se synchronisent plus » — reste préservé.
- **Couverture de test** : Vérification qu'aucune garde ne précède l'analyse dans `initTracker`, et que les deux voies de clôture de l'analyse existent.

## [1.12.1] - 2026-08-15

### 🧽 Notifications Prises pour des Messages, et Diagnostic Prématuré

> **Deux cas réels remontés depuis la console.**
> Sur un fil « Fiche d'établissement Google », le diagnostic annonçait `demandeur : Ornella PASSAAuteur d'origine` et comptait deux messages de « JEROME G-GH » dont le contenu était « … a recommandé ceci ». Sur un autre fil, il déclarait `Liens de profil trouvés : 0` alors que l'interface était identique à celle qui fonctionnait.

- **Nom d'auteur nettoyé (`nettoyerNomAuteur`)** : Les badges — « Auteur d'origine », niveau d'expertise — sont imbriqués **dans** le lien de profil, et leur texte remontait avec le nom. Seule la première ligne significative est désormais retenue.
- **Notifications système écartées (`CARTES_NON_MESSAGES`)** : « X a recommandé ceci », « a épinglé », « a marqué cette réponse » comportent elles aussi un lien de profil et passaient pour des réponses. Une vraie réponse employant le mot « recommande » reste conservée, le motif étant ancré en tête de message.
- **Limites de mots et accents** : Les motifs terminés par `\b` après un caractère accenté ne correspondaient jamais — `\b` est fondé sur l'alphabet ASCII en JavaScript, et « é » n'y est pas un caractère de mot. Le test l'a révélé immédiatement.
- **Diagnostic tolérant au rendu différé** : La Community Console construit son contenu après le chargement ; une inspection trop précoce trouvait un DOM vide et ce constat était figé définitivement. Douze tentatives sont désormais admises, complétées par des reprises à 4 et 9 secondes lorsque aucune mutation ne survient.
- **Les informations ne sont plus consignées comme des erreurs** : Un `console.warn` émis par un content script apparaît dans la page d'erreurs de l'extension. Les messages purement informatifs — constat de lecture, nom d'affichage manquant, repli technique de `execCommand` — passent en `console.log`.
- **Couverture de test (`tests/18-notifications-parasites.test.js`)** : 20 cas reproduisant le DOM observé, dont le badge imbriqué et la distinction entre notification et réponse.

## [1.12.0] - 2026-08-15

### 🤝 Intervenir sur un Fil Déjà Répondu par un Autre Bénévole

> **Un autre Product Expert a répondu, vous pas encore.**
> Le bouton de relance était masqué, et « Suivre dans Sheets » aurait généré une réponse initiale ignorant complètement le message du collègue — avec un risque maximal de le répéter mot pour mot. C'est précisément le reproche qui avait été opposé publiquement à une réponse de l'outil.

- **Bouton « 💬 Compléter le fil »** : S'affiche lorsqu'un autre bénévole a répondu sans que le Product Expert soit intervenu. Le libellé distingue ce cas de la relance classique.
- **Cadrage dédié (`buildFollowUpInstruction_(peADejaRepondu)`)** : L'instruction système exige une justification d'intervenir — un point factuel erroné à corriger, un élément déterminant qui manque, une étape à reformuler — et interdit de commenter le travail du collègue ou de le contredire frontalement.
- **Nouveau statut `RIEN_A_AJOUTER`** : Si la réponse déjà publiée est correcte et complète, le modèle le déclare et aucun texte n'est inséré. La consigne l'énonce explicitement : « ne rien ajouter est un résultat valable, souvent le meilleur ». Un message redondant encombre le fil, dessert la personne et discrédite celui qui l'écrit.
- **Sortie avant toute injection** : Le verdict « rien à ajouter » interrompt le parcours en amont de l'insertion, et le constat de l'analyse est affiché pour information.
- **Libellé de bouton restauré depuis une variable** : Les remises à l'état initial codaient le texte en dur et auraient écrasé le libellé contextuel.
- **Couverture de test (`tests/17-autre-pe.test.js`)** : 17 cas sur les deux cadrages et le nouveau statut.

## [1.11.3] - 2026-08-15

### 🔎 Le Diagnostic Explique la Décision d'Affichage

> **Un bouton absent, ou présent à tort, ne se diagnostiquait que par tâtonnement.**
> La console indiquait ce qui avait été lu du fil, jamais ce qui en avait été déduit.

- **Décision explicitée (`diagnostiquerUneFois`)** : Le diagnostic affiche désormais le nom d'affichage effectivement lu dans le stockage, le nombre de messages reconnus comme ceux du Product Expert, l'état du bouton de relance et la raison qui le motive — « vous n'êtes pas encore intervenu », « votre message est le dernier du fil », ou le nombre de messages postés depuis.
- **Nom manquant signalé distinctement** : Un avertissement dédié remplace le silence lorsque le nom d'affichage n'est pas renseigné.
- **Couverture de test** : Vérification que chacune des raisons est bien présente dans le code du diagnostic.

## [1.11.2] - 2026-08-15

### 🙈 Le Bouton de Relance ne S'affiche que S'il y a une Relance

> **Le bouton apparaissait sur des fils sans le moindre message à traiter.**
> Sa condition d'affichage se réduisait à « au moins une carte détectée ». Or la carte de question en est une : le bouton s'affichait donc sur une question sans aucune réponse, et sur un fil où le Product Expert venait de répondre sans que personne n'ait réagi.

- **Condition explicite (`doitAfficherRelance`)** : Le bouton n'apparaît que si le Product Expert est déjà intervenu **et** qu'au moins un message a été posté depuis. Trois situations le masquent désormais : question sans réponse, Product Expert non encore intervenu, et fil dont il signe le dernier message.
- **Lecture asynchrone maîtrisée** : La décision dépend du nom d'affichage, lu dans le stockage de l'extension. Un drapeau empêche l'observateur du DOM de déclencher deux créations pendant cette lecture.
- **Sans nom d'affichage configuré** : Le bouton reste proposé dès qu'un échange existe — l'appartenance des messages étant alors indéterminable — mais plus jamais sur une question seule. Le clic explique ce qui manque.
- **Séparation des responsabilités** : `afficherBoutonRelance` décide, `creerBoutonRelance` construit.
- **Couverture de test (`tests/16-affichage-relance.test.js`)** : 16 cas, dont les quatre situations qui ne justifient pas le bouton.

## [1.11.1] - 2026-08-15

### 🎯 Le Commentaire se Place sous le Message du Demandeur

> **La commande à actionner est celle qui suit le message du demandeur, pas celle de la réponse du Product Expert.**
> La 1.11.0 privilégiait la commande située dans la carte du Product Expert, plus haut dans le fil : le commentaire se serait inséré au mauvais endroit de l'échange.

- **Sélection par position dans le document (`trouverBoutonCommenter`)** : La commande retenue est la première qui suit le message visé, déterminée par `compareDocumentPosition`. Le repérage ne dépend donc ni des noms de classes ni de la profondeur d'imbrication des cartes.
- **Message de référence explicite** : Le dernier message isolé de la relance — celui du demandeur — est transmis à l'insertion, en lieu et place du nom d'affichage du Product Expert.
- **Repli inchangé** : En l'absence de correspondance, la commande la plus récente de la page est utilisée.

## [1.11.0] - 2026-08-15

### 💬 Une Relance se Commente, elle ne se Republie pas

> **« Répondre » ouvre une nouvelle réponse au fil : c'est la commande de la première intervention.**
> Une relance se traite en commentant sous sa propre réponse, là où la personne a elle-même écrit. Employer « Répondre » créait une seconde réponse indépendante au lieu de poursuivre l'échange.

- **Recherche dédiée (`trouverBoutonCommenter`)** : Repère la commande « Ajouter un commentaire » / « Add a comment », en **priorisant celle située dans la carte du Product Expert** — c'est sous sa réponse que la discussion se poursuit. À défaut, la commande la plus récente de la page.
- **Aiguillage de l'insertion (`injecterReponse(text, mode, nomPe)`)** : Mode `reponse` pour une première intervention, `commentaire` pour une relance. La première réponse conserve le comportement d'origine.
- **Aucun éditeur préexistant réutilisé en mode commentaire** : Un éditeur déjà ouvert serait celui d'une nouvelle réponse, au mauvais endroit du fil. La commande visée est donc systématiquement actionnée.
- **Échec explicite** : Si la commande de commentaire est introuvable, le texte est copié dans le presse-papier plutôt qu'inséré ailleurs.
- **Élément DOM conservé pour chaque carte** : L'extraction du fil retient la référence du conteneur, ce qui permet de cibler les commandes propres à une réponse donnée.
- **Couverture de test (`tests/15-commande-commentaire.test.js`)** : 13 cas sur l'aiguillage et le ciblage.

## [1.10.5] - 2026-08-15

### 🔌 Bouton de Relance Jamais Posé, et Diagnostic Automatique

> **La fonction créant le bouton « 💬 Répondre à la relance » existait, était testée, et n'était appelée nulle part.**
> Une réécriture successive en avait supprimé l'appel dans `initTracker`. Aucun test ne pouvait le voir : tous vérifiaient le comportement des fonctions, aucun leur câblage.

- **Appels rétablis (`extension/content.js`)** : `afficherBoutonRelance()` et le diagnostic sont posés en même temps que le bouton principal.
- **Test de câblage (`tests/14-cablage-boutons.test.js`)** : Vérifie que toute fonction déclarée est effectivement appelée au moins une fois. Une fonction orpheline est désormais une erreur de test, pas une découverte à l'usage.
- **Diagnostic automatique (`diagnostiquerUneFois`)** : Un content script s'exécute dans un monde isolé — une fonction exposée sur `window` n'est pas appelable depuis la console, qui vise par défaut le contexte de la page. La consigne d'exécuter `__peTrackerDiagnostic()` était donc inapplicable. Le diagnostic s'affiche maintenant de lui-même à l'ouverture d'un fil : nombre de messages lus, auteurs, demandeur identifié, état de verrouillage. Si rien n'est lu, le nombre de liens de profil trouvés est indiqué, ce qui oriente directement le diagnostic.
- **Version journalisée au chargement** : `[PE Tracker] v1.10.5 activé.` remplace le message générique. Un content script obsolète après un rechargement d'extension incomplet devient visible immédiatement.

## [1.10.4] - 2026-08-15

### 🧹 Filtrage du Bruit d'Interface et Détection du Verrouillage

> **Une capture complète de la Community Console a montré tout ce qui entoure les messages** : badges, compteurs de vues, boutons d'action, avertissements de verrouillage. Rien de tout cela n'a sa place dans le prompt.

- **Filtres étendus (`LIGNES_PARASITES`)** : « Répondre », « Répondre au post d'origine », « J'ai la même question », « Se désabonner », « Verrouillé partiellement », « Cette question est partiellement verrouillée… », « Il se peut que les contenus de la communauté… », « En savoir plus », « Détails », compteurs de vues et de réponses — dans leurs variantes française et anglaise.
- **Détection du verrouillage (`filVerrouille`)** : Un fil partiellement verrouillé n'accepte que les réponses des Product Experts et de l'auteur d'origine. L'information est transmise au backend et reportée en colonne *Notes* : elle explique pourquoi personne d'autre n'intervient.
- **Carte de question intégrée au fil** : La question porte elle aussi un lien de profil et le badge « Auteur d'origine ». Elle est donc lue comme premier élément du fil, ce qui donne au modèle le contexte complet — le badge, et non la position, restant la source de vérité pour identifier le demandeur.
- **Diagnostic complété** : `__peTrackerDiagnostic()` affiche désormais l'état de verrouillage du fil.
- **Couverture de test étendue (`tests/13-dom-reel.test.js`)** : La reproduction du DOM inclut la carte de question complète, avec ses compteurs, ses boutons et son bandeau de verrouillage.

## [1.10.3] - 2026-08-15

### 🧩 Lecture du Fil Fondée sur la Structure de la Page

> **Sur un fil comportant pourtant une relance, le bouton « 💬 Répondre à la relance » n'apparaissait pas.**
> Les sélecteurs reposaient sur des noms de classes générés (`scTailwind*`) ne correspondant pas au DOM réel. Une capture d'écran de l'interface a par ailleurs montré que l'ordre des messages n'était pas celui supposé.

- **Extraction par structure plutôt que par classes (`cartesParLienProfil`)** : Chaque réponse porte un lien vers le profil de son auteur. Ce repère structurel ne dépend d'aucun nom de classe, ceux-ci étant générés et susceptibles de changer sans préavis. Les anciens sélecteurs restent en secours.
- **Identification du demandeur par le badge « Auteur d'origine »** : Sous « Toutes les réponses », le premier message est celui du Product Expert — la question figurant dans un encart distinct au-dessus. La règle « le demandeur est l'auteur du premier message », introduite en 1.10.2, désignait donc le Product Expert lui-même. Le badge posé par le forum est un repère fiable, et il est bilingue (« Auteur d'origine » / « Original poster »).
- **Nettoyage du corps des messages (`nettoyerCorpsMessage`)** : Retrait des badges d'expertise, horodatages, boutons « Recommander » et « Ajouter un commentaire », et du nom de l'auteur répété en en-tête. Sans cela, ces éléments d'interface partaient dans le prompt.
- **Seuil d'affichage abaissé à une réponse** : La question ne figurant pas dans la liste des réponses, exiger deux messages masquait le bouton sur les fils ne comportant qu'un échange.
- **Diagnostic intégré (`__peTrackerDiagnostic()`)** : Exécutable depuis la console du navigateur, il affiche les messages détectés, leurs auteurs et le demandeur identifié — de quoi ajuster les sélecteurs en quelques secondes si l'interface évolue.
- **Couverture de test (`tests/13-dom-reel.test.js`)** : 18 cas sur une reproduction du DOM réellement observé, dont la régression d'identification du demandeur.

## [1.10.2] - 2026-08-15

### 🔗 Relance sur un Fil Non Suivi, et Fin des Lignes en Double

> **« Dois-je cliquer sur Suivre dans Sheets pour qu'il réponde à une réponse ? »**
> La question a mis au jour trois défauts : le parcours imposait un détour absurde, ce détour créait des doublons, et l'attribution des rôles ne fonctionnait pas.

- **Enregistrement automatique (`registerThreadOnly_`, action `registerOnly`)** : Une relance sur un fil non suivi déclenche son inscription silencieuse, **sans appel à Gemini**. Générer une réponse initiale sur un fil déjà traité n'aurait aucun sens et consommerait du quota pour rien. Le traitement de la relance enchaîne ensuite tout seul.
- **Plus aucune ligne en double (`trouverLigneParUrl_`)** : `doPost` ne créait jamais qu'une nouvelle ligne. Cliquer deux fois sur « Suivre dans Sheets », ou suivre un fil déjà présent, dupliquait l'entrée. Un fil déjà suivi voit désormais sa proposition mise à jour sur sa ligne existante. La recherche par URL, écrite trois fois, est factorisée.
- **Identification du demandeur corrigée** : `formaterRelance` recevait `config.askerName`, une clé qui n'a jamais existé dans le stockage. Tous les intervenants, y compris la personne à aider, étaient donc étiquetés « autre intervenant » — ce qui annulait l'attribution des rôles introduite en 1.10.1. Le demandeur est maintenant déduit de l'auteur du premier message du fil, sans réglage à saisir.
- **Extraction du thread factorisée (`extraireInfosThread`)** : Titre, auteur, produit et question, jusqu'ici enchâssés dans le gestionnaire de clic, sont désormais réutilisables par le parcours de relance.
- **Couverture de test (`tests/12-parcours-relance.test.js`)** : 12 cas, dont la régression d'étiquetage et le fil où seul un collègue est intervenu.

## [1.10.1] - 2026-08-15

### 🔍 Extraction du Fil : Attribution des Auteurs

> **Un fil réel contient la question, votre réponse, parfois celle d'un autre bénévole, puis la relance du demandeur.**
> La première version de l'extraction ne récupérait que du texte, sans auteur : impossible de distinguer une relance à traiter du message d'un collègue. Elle repérait par ailleurs votre message via une variable en mémoire du script, vide dès lors que le fil est rouvert plus tard — c'est-à-dire dans le cas normal d'une relance.

- **Attribution par message (`auteurDuBloc`, `extraireFilStructure`)** : Chaque message est extrait avec son auteur. La remontée dans les ancêtres s'arrête dès qu'un conteneur englobe plusieurs noms d'utilisateur, sans quoi tous les messages hériteraient du nom du premier intervenant.
- **Nom d'affichage du Product Expert** : Nouveau champ dans les options de l'extension. C'est le seul repère stable d'une session à l'autre pour localiser vos propres messages. La comparaison tolère la casse, les accents, les espaces et les séparateurs.
- **Trois stratégies d'isolement (`isolerRelanceStructuree`)** : par nom d'affichage, à défaut par recouvrement avec la réponse encore en mémoire, à défaut le dernier message du fil — ce dernier cas étant explicitement signalé comme non fiable, avec demande de confirmation avant de poursuivre.
- **Rôles transmis au modèle (`formaterRelance`)** : Chaque message porte la mention « (auteur de la question) » ou « (autre intervenant) ».
- **Consigne dédiée aux autres bénévoles** : Ne pas répéter ce qu'un collègue a déjà dit, ne pas le contredire frontalement, corriger un point factuel sans le mettre en cause. Si seul un autre intervenant s'est exprimé et que le demandeur n'a rien ajouté, le signaler plutôt que de produire un message pour meubler.
- **Plusieurs réponses du Product Expert dans un fil** : Seule la plus récente sert de point de référence.
- **Couverture de test (`tests/11-extraction-fil.test.js`)** : 24 cas sur un fil réaliste à quatre intervenants.

## [1.10.0] - 2026-08-15

### 💬 Traitement des Relances

> **Répondre à une relance n'est pas répondre à une question : le fil a une histoire.**
> Le piège est la redite. Un modèle à qui l'on donne l'ensemble du fil reformule volontiers ce qui a déjà été dit — précisément ce qui exaspère une personne venant d'expliquer que cela n'a pas fonctionné.

- **Instructions système dédiées (`buildFollowUpInstruction_`)** : Trois règles absolues — ne jamais redire, accuser réception de ce que la personne a fait, ne rien inventer. La consigne impose de se demander « qu'est-ce que j'apporte que la réponse précédente ne contenait pas ? » et, si la réponse est « rien », de poser une question ou de reconnaître la limite plutôt que de meubler.
- **Classification en cinq cas** : `RESOLU` (deux phrases maximum, aucune procédure), `ECHEC` (interdiction de reproposer la même manipulation ; demander le détail, changer de piste, ou annoncer l'impasse), `INCOMPRIS` (reformuler autrement le seul point concerné), `NOUVEAU` (le seul cas justifiant une procédure complète), `HORS_SUJET`.
- **Aucune formule de bienvenue (`buildFollowUpResponse`)** : Un troisième message dans un fil ne recommence pas par « Bonjour X, et bienvenue sur la communauté » — c'est l'un des marqueurs les plus visibles d'une réponse produite sans tenir compte du contexte. Sur un `RESOLU`, la clôture invitant à revenir disparaît également.
- **Garde-fou anti-redite (`CONFIG.MAX_FOLLOWUP_OVERLAP`)** : Le recouvrement de mots entre la proposition et la réponse déjà publiée est mesuré. Au-delà de 60 %, la confiance est forcée à `FAIBLE` et un avertissement chiffré s'affiche avant publication.
- **Contexte reconstitué depuis la feuille (`handleFollowUp_`)** : Question d'origine et surtout **réponse réellement publiée** — celle que la personne a lue — sont transmises au modèle. Si elle n'a jamais été capturée, l'extension le signale explicitement, la redite devenant alors impossible à détecter de façon fiable.
- **Isolement de la relance (`isolerRelance`)** : Les messages du fil sont extraits dans l'ordre, et la réponse du Product Expert repérée par recouvrement de mots plutôt que par égalité stricte — le forum reformate les espaces et le texte a pu être retouché avant publication.
- **La colonne « Date de relance » prend enfin son sens** : Renseignée automatiquement, avec passage du statut en *Résolue* sur un `RESOLU`, en *En attente (User)* sinon.
- **Couverture de test (`tests/10-relance.test.js`)** : 24 cas, dont la distinction entre une vraie relance et une reformulation déguisée.

## [1.9.0] - 2026-08-15

### ✍️ Les Formules de Clôture Redeviennent Celles du Product Expert

> **« Dites-moi si ça avance de votre côté. » Personne ne parle comme ça.**
> La 1.6.0 avait remplacé la formule de clôture d'origine par des variantes inventées, au motif de casser la répétition. Le remède était pire que le mal : la répétition était un défaut de forme, la voix d'emprunt en est un de fond.

- **Formules d'origine restaurées (`gas/Gemini.gs`)** : « Si vous avez d'autres questions ou si des points restent flous, n'hésitez pas à revenir vers nous » et ses équivalents dans les cinq langues reviennent comme valeurs par défaut, débarrassées de la répétition du prénom qui les alourdissait.
- **Personnalisation depuis le panneau de contrôle (`getCustomClosings`, `setCustomClosings`)** : Deux champs, français et anglais, une formule par ligne. Les formules saisies priment sur celles livrées par défaut. Plus aucune tournure n'est imposée par l'outil.
- **Clôture vide assumée** : Un tiret seul sur une ligne déclare l'absence de formule — le message s'arrête sur le fond, puis la signature. C'est souvent le plus naturel, et c'était impossible jusqu'ici.
- **Variation conservée** : Le tirage sans répétition immédiate s'applique aux formules personnalisées comme aux valeurs par défaut, y compris en mélangeant formules et clôture vide.
- **Couverture de test (`tests/09-formules-cloture.test.js`)** : 15 cas. L'un d'eux a révélé que le garde-fou « configuration vide = non configurée » avalait le cas légitime de la clôture volontairement absente.

## [1.8.3] - 2026-08-15

### ✂️ Réponses Tronquées : Détection, Relance et Refus d'Injection

> **Une réponse s'arrêtait au milieu d'une phrase — « je pense que récupérer l'accès à votre compte » — sans lien de récupération ni conclusion.**
> Trois défauts cumulés faisaient passer une génération interrompue pour une réponse terminée.

- **Lecture de toutes les parties (`extraireTexteCandidat_`)** : Seule `candidate.content.parts[0]` était lue. L'API découpe la sortie en plusieurs parties dès que le modèle produit un raisonnement interne avant son texte : tout ce qui suivait la première partie était perdu. Les parties marquées `thought` sont exclues, n'étant pas destinées à publication.
- **Vérification de `finishReason`** : Le champ n'était jamais consulté. Une coupure sur `MAX_TOKENS` produisait silencieusement une réponse amputée. Les arrêts sur `SAFETY`, `RECITATION`, `BLOCKLIST` et `PROHIBITED_CONTENT` renvoient désormais une erreur explicite, sans relance inutile.
- **Budget de génération porté à 4 096 jetons (`CONFIG.MAX_OUTPUT_TOKENS`)** : Les 1 200 jetons précédents étaient trop justes — sur un modèle qui raisonne avant de répondre, les jetons de réflexion se déduisent de la même enveloppe et amputent le texte visible.
- **Relance automatique** : Une réponse détectée comme tronquée déclenche une seconde tentative avec un budget doublé, avant tout signalement.
- **Filet complémentaire (`sembleTronque_`)** : Une dernière ligne dépourvue de ponctuation finale signale une coupure même lorsque l'API annonce une fin normale. Les lignes se terminant par une URL de source sont exclues de ce contrôle.
- **Refus d'injection (`extension/content.js`)** : Un texte incomplet n'est plus placé dans le champ de réponse — le risque de le publier par réflexe est trop élevé. Il est copié dans le presse-papier, accompagné d'un avertissement.
- **Signalement partout** : Confiance forcée à `FAIBLE`, note « ❌ réponse incomplète — génération interrompue, à reprendre » dans la feuille, avertissement dans l'extension, la WebApp mobile et la relance depuis Sheets.
- **Couverture de test (`tests/08-reponse-tronquee.test.js`)** : 17 cas, dont la réponse réellement rencontrée, la concaténation multi-parties et l'exclusion du raisonnement interne.

## [1.8.2] - 2026-08-15

### 🧭 Noms de Menus : Fin des Procédures Inventées

> **Une réponse envoyait chercher un menu « Densité et couleur » dans Google Agenda, introuvable dans l'interface.**
> C'est la variante la plus retorse de la réponse « plausible mais fausse » : une suite d'étapes numérotées inspire confiance, et devient inapplicable dès qu'un libellé a été renommé, déplacé ou supprimé. Le modèle décrit l'interface telle qu'elle était dans ses données d'entraînement.

- **Règle absolue n°3 (`gas/Gemini.gs`)** : Le nom exact d'un menu, d'un onglet ou d'une option ne peut être cité que s'il apparaît littéralement dans un résultat googleSearch consulté. À défaut : décrire l'emplacement fonctionnellement, signaler que la position a pu changer, et renvoyer vers l'article du Centre d'aide — qui, lui, est à jour.
- **Prise en compte du « je ne trouve pas »** : Lorsqu'une personne signale ne pas trouver une option, le modèle doit envisager qu'elle ait été supprimée ou déplacée, au lieu de répéter le même chemin.
- **Détection automatique (`contientCheminInterface_`)** : Repère l'enchaînement d'au moins deux verbes de navigation dans les cinq langues gérées.
- **Rétrogradation de la confiance** : Une procédure pas-à-pas produite sans aucune source de grounding force `CONFIANCE` à `FAIBLE`, quel que soit l'avis du modèle sur lui-même.
- **Avertissement dans les quatre interfaces** : Extension, WebApp mobile, relance depuis Sheets et colonne *Notes* signalent « chemin d'interface non sourcé — vérifier les libellés de menus ».
- **Couverture de test (`tests/07-chemin-interface.test.js`)** : 17 cas, dont la réponse Google Agenda réellement rencontrée, les quatre autres langues, et les réponses sans parcours d'interface qui ne doivent pas déclencher d'alerte.

## [1.8.1] - 2026-08-15

### 🌍 Cohérence Linguistique de la Ligne de Récupération

> **Une réponse rédigée en anglais se terminait par « Procédure officielle de récupération : https://g.co/recover ».**
> Les consignes du prompt étant écrites en français, la 1.6.1 imposait cette ligne « à ce format exact » : le modèle la recopiait telle quelle, quelle que soit la langue du message.

- **Intitulé localisé dans la consigne (`gas/Gemini.gs`)** : L'URL reste invariable, mais l'intitulé est désormais fourni dans les cinq langues gérées, avec obligation de le traduire pour toute autre langue.
- **Règle générale de langue** : Ajout d'une consigne explicite indiquant que les gabarits de phrases donnés en français dans les instructions sont à traduire, jamais à recopier — la même confusion pouvait toucher les intitulés de sources.
- **Filet de rattrapage (`localiserLigneRecuperation_`)** : Après génération, l'intitulé de la ligne de récupération est réaligné sur la langue détectée du message. Une consigne peut toujours déraper ; ce correctif s'applique quoi qu'il arrive.
- **Réécriture prudente** : Seules les lignes de la forme « intitulé : URL » sont retouchées. Une mention du lien insérée dans une phrase est laissée intacte, car elle est déjà dans la bonne langue et la réécrire casserait la phrase. La ponctuation finale et la forme canonique de l'URL sont préservées.
- **Couverture de test (`tests/06-coherence-langue.test.js`)** : 16 cas, dont le cas réel rencontré en production, l'idempotence et les langues non gérées.

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
