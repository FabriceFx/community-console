# AGENTS.md

## Modèle d'IA
- Le projet est configuré pour utiliser la version **Gemini 3.7 Flash**.

## Versionning de l'extension Chrome & du Projet
- À chaque modification, correction de bug ou nouvelle fonctionnalité apportée au projet ou à l'extension, le numéro de version (`MAJOR.MINOR.PATCH`) dans `extension/manifest.json` doit impérativement être incrémenté (notamment le dernier digit `PATCH` pour les corrections) et aligné avec les fichiers `CHANGELOG.md` et `README.md`.
- **`COMMUNITY_CONSOLE_VERSION` dans `gas/Config.gs` et le fichier `VERSION` doivent être alignés sur la même valeur** (`atelier verifier` le contrôle). L'extension la compare à la sienne et signale un écart : le projet Apps Script et l'extension se déploient séparément, et un backend resté en arrière produit des symptômes sans rapport apparent avec la cause.
- Redéployer le backend ne consiste pas seulement à copier les fichiers : la WebApp sert la **version de déploiement**, pas le code enregistré. Il faut créer une nouvelle version via *Déployer > Gérer les déploiements > ✏️ > Version : Nouvelle version*.

## Qualité des réponses publiées
Les messages générés sont publiés sur des forums publics et relus par d'autres Product Experts. Deux règles priment sur toute autre considération :

1. **Ne jamais produire une procédure quand la question est incomplète.** S'il manque la source de données, le message d'erreur, la version ou les étapes déjà tentées, la sortie doit être une demande de précisions (`STATUT: CLARIFICATION`). Une réponse plausible mais inapplicable est identifiée immédiatement comme du remplissage automatique et n'aide personne.
2. **Ne jamais inventer d'URL, d'identifiant d'article ou d'intitulé d'interface.** Seules les URL renvoyées par `googleSearch` sont utilisables, et un lien mort n'est jamais remplacé par un autre lien.

Conséquences à respecter lors de toute évolution :
- Le contrat de sortie du modèle (`LANG` / `STATUT` / `CONFIANCE` puis `---`) est analysé par `parseModelEnvelope_` ; toute modification du prompt doit préserver ce format.
- Les formules d'accueil et de clôture doivent rester **variables** (`REPLY_SHELLS`) : une coquille figée rend la série de réponses reconnaissable.
- Le prénom de l'auteur ne doit apparaître **qu'une seule fois** par message.
- La signature du Product Expert et ses formules de clôture sont des **réglages** (`getSignature_`, `getCustomClosings_`), jamais des constantes. L'outil est publié sous licence MIT : une valeur codée en dur signe les réponses de tous ses utilisateurs du nom d'un seul, et `stripReplyShell_` ne reconnaît plus la fin de leurs messages.
- Toute langue ajoutée à `REPLY_SHELLS` doit rester configurable : le panneau de contrôle dérive ses champs de cette liste (`languesGerees_`), il ne faut pas y recopier de langue en dur.
- Aucune publication automatique : la proposition est placée dans le champ de réponse, jamais envoyée.

## Aucune conservation de données
L'outil ne stocke **ni question, ni réponse, ni historique**. Chaque requête est traitée puis oubliée, et le classeur Google Sheets ne sert qu'à porter le panneau de réglages, que `doPost` lit à chaque requête de l'extension.

Conséquences à respecter lors de toute évolution :
- `doPost` ne doit **jamais** écrire dans une feuille. Le bac à sable de `tests/21-backend-sans-etat.test.js` ne fournit ni `SpreadsheetApp` ni `LockService` : toute écriture y lèverait une exception.
- Le contexte d'une relance est transmis par l'appelant (`question`, `previousAnswerFromThread`). Le backend ne le relit nulle part : c'est la seule source, et elle reflète le fil tel qu'il est.
- `SpreadsheetApp` ne doit être employé que pour `getUi()` — menu et barre latérale.

## Sécurité
- La WebApp est déployée en accès « N'importe qui » : `doPost` doit **toujours** commencer par `assertAuthorized_()`.
- **La WebApp ne sert aucune page HTML.** `doGet` n'est qu'une sonde JSON. Toute page HtmlService servie par la WebApp est ouverte aux anonymes et leur donne `google.script.run` sur toutes les fonctions publiques, sous l'identité du propriétaire. La page mobile, retirée en v1.15.0, a ainsi exposé la clé API et le secret.
- **Toute fonction interne finit par `_`.** `google.script.run` peut appeler n'importe quelle fonction publique depuis toute page servie par le projet. Une fonction publique ajoutée doit figurer dans `PUBLIQUES_ATTENDUES` de `tests/31-surface-google-script-run.test.js`, avec sa justification ; si elle touche aux réglages, elle commence par `assertDepuisLeClasseur_()`.
- La clé API Gemini ne doit jamais figurer dans une URL : elle passe par l'en-tête `x-goog-api-key`. Tout message d'erreur journalisé ou affiché doit traverser `redactSecrets_()`.
- Ne jamais persister côté serveur une clé API reçue dans une requête entrante.
