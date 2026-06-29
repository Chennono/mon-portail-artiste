# Publication et assistant Mistral — Cloudflare Worker

Ce petit service reçoit la page HTML exportée et la met en ligne à une URL publique
personnalisée (`https://…/p/nom-artiste`). Il permet le bouton **« Publier ma page »** de l'app.

L'adresse créée lors de la première publication reste stable. Un jeton d'édition conservé
dans le navigateur permet de mettre la page à jour sans changer son URL. Les nouvelles pages
n'expirent plus automatiquement.

Le même Worker expose `POST /ai` et exécute Mistral Small 3.1 avec le binding Workers AI.
Aucune clé Mistral n'est exposée dans le navigateur ou stockée dans le dépôt.

## Prérequis
- Un compte **Cloudflare** (gratuit) : https://dash.cloudflare.com/sign-up
- **Node.js** installé (pour `npx wrangler`).

## Déploiement (une seule fois, ~5 min)

```bash
cd "worker"

# 1. Se connecter à Cloudflare (ouvre le navigateur)
npx wrangler login

# 2. Créer le stockage KV ; copiez l'« id » affiché
npx wrangler kv namespace create PORTAILS

# 3. Collez cet id dans wrangler.toml (champ id = "...")

# 4. Déployer
npx wrangler deploy
```

Le binding `[ai]` est déjà déclaré dans `wrangler.toml`; aucune clé API supplémentaire n'est nécessaire.

`wrangler deploy` affiche l'URL du service, par ex. :
`https://mon-portail-artiste-publish.VOTRE-SOUS-DOMAINE.workers.dev`

## Brancher l'app
Dans `../app.js`, renseignez la constante en haut du fichier :

```js
const PUBLISH_ENDPOINT = "https://mon-portail-artiste-publish.VOTRE-SOUS-DOMAINE.workers.dev";
```

Puis re-commitez / re-déployez le site (GitHub Pages). Le bouton **« Publier ma page »**
apparaît alors dans le kit de partage.

## Tester en local (optionnel)
```bash
npx wrangler dev
# puis, dans un autre terminal :
curl -X POST http://localhost:8787/publish -H "Content-Type: application/json" \
  -d '{"html":"<!doctype html><h1>Test</h1>"}'
```

## Activer Turnstile (anti-robot, optionnel mais recommandé)

Le code gère déjà Turnstile : **inactif tant qu'aucune clé n'est configurée**. Pour l'activer :

1. Cloudflare → **Turnstile** → *Add widget* (domaine = celui du site, ex. `chennono.github.io`).
   Vous obtenez une **sitekey** (publique) et un **secret** (privé).
2. Côté Worker, enregistrez le secret :
   ```bash
   npx wrangler secret put TURNSTILE_SECRET
   # collez le secret quand demandé, puis :
   npx wrangler deploy
   ```
3. Côté app, dans `../app.js`, renseignez la sitekey :
   ```js
   const TURNSTILE_SITEKEY = "0x4AAAAAAA....";
   ```
   Re-déployez le site. Une case anti-robot apparaît alors avant « Publier ».

Tant que `TURNSTILE_SECRET` n'est pas défini, le Worker n'exige pas de jeton (publication ouverte).
`/ai` reste protégé par une **limite de débit** (40 requêtes/heure/IP) — les jetons Turnstile,
à usage unique, ne conviennent pas à des appels de conversation répétés.

## Endpoints
`POST /publish` · `POST /unpublish` (jeton d'édition requis) · `POST /ai` · `GET /p/:id`

## Notes / limites
- **Coût** : le free tier Cloudflare (Workers + KV) suffit largement pour un prototype.
- **Abus** : sans Turnstile, `/publish` est ouvert et héberge du HTML arbitraire — activez-le
  avant toute ouverture publique large.
- **RGPD** : les pages publiées sont stockées sur le serveur sans expiration automatique
  (contrairement au reste de l'app, 100 % local). Un mécanisme de suppression explicite
  devra être ajouté avant un usage en production.
- **Limite de taille** : 5 Mo par page (images base64 incluses), réglable via `MAX_BYTES`.
