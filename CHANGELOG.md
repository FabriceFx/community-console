# Changelog

Toutes les modifications notables apportées à ce projet sont documentées dans ce fichier.

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
