# Service de publication — Cloudflare Worker + KV

Ce petit service reçoit la page HTML exportée et la met en ligne à une URL publique
personnalisée (`https://…/p/nom-artiste`). Il permet le bouton **« Publier ma page »** de l'app.

L'adresse créée lors de la première publication reste stable. Un jeton d'édition conservé
dans le navigateur permet de mettre la page à jour sans changer son URL. Les nouvelles pages
n'expirent plus automatiquement.

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

## Notes / limites
- **Coût** : le free tier Cloudflare (Workers + KV) suffit largement pour un prototype.
- **Abus** : l'endpoint `/publish` est ouvert. Pour un usage public réel, ajoutez une
  protection (Cloudflare Turnstile, limite de débit, ou un jeton). À ne pas négliger
  car le service héberge du HTML arbitraire.
- **RGPD** : les pages publiées sont stockées sur le serveur sans expiration automatique
  (contrairement au reste de l'app, 100 % local). Un mécanisme de suppression explicite
  devra être ajouté avant un usage en production.
- **Limite de taille** : 5 Mo par page (images base64 incluses), réglable via `MAX_BYTES`.
