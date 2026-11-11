# Mistral-chat-app

Ce dépôt contient deux mini-apps :

- **Chat Mistral** (racine du dépôt) : interface de chat appelant l'API Mistral via le SDK TypeScript officiel (`@mistralai/mistralai`), modèle `mistral-small-latest`, clé `MISTRAL_API_KEY` côté serveur uniquement.
- **[`consommer-europeen/`](consommer-europeen/README.md)** : app « acheter européen » (origine, détention, production, préférences d'achat FR/UE/hautes démocraties), données issues de la grille sectorielle v4. Branding Cirba Consult.

Interface de chat simple qui appelle l'API Mistral avec le **SDK TypeScript officiel**
[`@mistralai/mistralai`](https://www.npmjs.com/package/@mistralai/mistralai), en utilisant le modèle
**`mistral-small-latest`**.

La clé `MISTRAL_API_KEY` reste **côté serveur** : le navigateur ne l'expose jamais et ne parle
qu'au backend local via `POST /api/chat`.

## Prérequis

- Node.js >= 20.6 (Node 22 recommandé)

## Installation des dépendances

```bash
npm install
```

## Configuration

```bash
cp .env.example .env
```

Éditez `.env` et renseignez votre clé (disponible sur [console.mistral.ai](https://console.mistral.ai)) :

```
MISTRAL_API_KEY=...
PORT=3000
```

`.env` est ignoré par git (voir `.gitignore`) : ne committez jamais votre clé.

## Exécution en local

```bash
npm run build   # compile le TypeScript (src/ -> dist/)
npm start       # démarre le serveur
```

Puis ouvrez <http://localhost:3000>.

Pendant le développement, vous pouvez lancer dans deux terminaux :

```bash
npx tsc --watch
npm start
```

## Utilisation de l'API

```bash
curl -X POST http://localhost:3000/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"messages": [{"role": "user", "content": "Bonjour !"}]}'
```

Réponse : `{ "reply": "..." }`

## Structure

```
├── src/server.ts      # serveur Express : sert public/ + POST /api/chat (appelle l'API Mistral)
├── public/            # interface de chat statique (HTML/CSS/JS vanilla)
├── .env.example       # modèle de configuration (clé API + port)
├── tsconfig.json
└── package.json
```
