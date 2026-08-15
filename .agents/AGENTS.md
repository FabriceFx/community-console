# AGENTS.md

## Modèle d'IA
- Le projet est configuré pour utiliser la version **Gemini 3.7 Flash**.

## Versionning de l'extension Chrome & du Projet
- À chaque modification, correction de bug ou nouvelle fonctionnalité apportée au projet ou à l'extension, le numéro de version (`MAJOR.MINOR.PATCH`) dans `extension/manifest.json` doit impérativement être incrémenté (notamment le dernier digit `PATCH` pour les corrections) et aligné avec les fichiers `CHANGELOG.md` et `README.md`.
- **`CONFIG.VERSION` dans `gas/Config.gs` doit être aligné sur la même valeur.** L'extension la compare à la sienne et signale un écart : le projet Apps Script et l'extension se déploient séparément, et un backend resté en arrière produit des symptômes sans rapport apparent avec la cause.
- Redéployer le backend ne consiste pas seulement à copier les fichiers : la WebApp sert la **version de déploiement**, pas le code enregistré. Il faut créer une nouvelle version via *Déployer > Gérer les déploiements > ✏️ > Version : Nouvelle version*.

## Qualité des réponses publiées
Les messages générés sont publiés sur des forums publics et relus par d'autres Product Experts. Deux règles priment sur toute autre considération :

1. **Ne jamais produire une procédure quand la question est incomplète.** S'il manque la source de données, le message d'erreur, la version ou les étapes déjà tentées, la sortie doit être une demande de précisions (`STATUT: CLARIFICATION`). Une réponse plausible mais inapplicable est identifiée immédiatement comme du remplissage automatique et n'aide personne.
2. **Ne jamais inventer d'URL, d'identifiant d'article ou d'intitulé d'interface.** Seules les URL renvoyées par `googleSearch` sont utilisables, et un lien mort n'est jamais remplacé par un autre lien.

Conséquences à respecter lors de toute évolution :
- Le contrat de sortie du modèle (`LANG` / `STATUT` / `CONFIANCE` puis `---`) est analysé par `parseModelEnvelope_` ; toute modification du prompt doit préserver ce format.
- Les formules d'accueil et de clôture doivent rester **variables** (`REPLY_SHELLS`) : une coquille figée rend la série de réponses reconnaissable.
- Le prénom de l'auteur ne doit apparaître **qu'une seule fois** par message.
- Aucune publication automatique : la proposition est placée dans le champ de réponse, jamais envoyée.

## Sécurité
- La WebApp est déployée en accès « N'importe qui » : `doPost` et `processMobileThreadUrl` doivent **toujours** commencer par `assertAuthorized_()`.
- L'extraction serveur doit **toujours** passer par `assertAllowedHost_()`.
- La clé API Gemini ne doit jamais figurer dans une URL : elle passe par l'en-tête `x-goog-api-key`. Tout message d'erreur journalisé ou affiché doit traverser `redactSecrets_()`.
- Ne jamais persister côté serveur une clé API reçue dans une requête entrante.
