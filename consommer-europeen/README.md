# Consommer européen — mini-app

Mini-app web pour acheter en connaissance de cause : **origine du capital, détention, lieux de production, origine des pièces** des marques et produits, avec **préférences d'achat** (France / Union européenne / hautes démocraties : Japon, Corée du Sud, Taïwan, Canada).

Les données viennent de la **grille sectorielle v4 du 11/10/2026** (`consommer_europeen_grille_sectorielle_v4_2026_10_11.pdf`, Google Drive du projet) :

- 21 secteurs, 615 lignes, statuts **Rang 1** (capital européen : UE, UK, Suisse, Norvège), **Rang 2** (JP, KR, TW, CA), **Vigilance**, **Hors zones**, **À écarter** (contrôle chinois)
- chaque groupe : marques, siège, statut, commentaire (détention / actionnaires), lieux de production, produits/modèles avec pays d'assemblage, sources numérotées

## Lancer en local

Depuis la racine du dépôt :

```bash
cd consommer-europeen    # dossier de l'app
npm install
cp .env.example .env     # optionnel : personnaliser le compte démo
npm run build
npm start                # http://localhost:3000
```

Connexion démo par défaut : `demo@consommer-europeen.fr` / `demo1234` (voir `.env.example`).

## Utilisation

- Se connecter, puis taper un mot dans la barre de recherche : `voiture` → toutes les marques du secteur Automobile, `pneu`, `café`…
- Choisir sa **préférence d'achat** en haut à droite : les résultats sont filtrés (les lignes hors périmètre sont masquées, avec leur nombre affiché ; « Tout afficher » les montre avec leur badge)
- Cliquer une marque/groupe → **fiche** : statut, siège, marques, détention/actionnariat (commentaire), lieux de production, produits/modèles, certifications, sources
- Cliquer un **produit/modèle** → pays d'assemblage, origine des pièces, certifications, note

## API

| Endpoint | Description |
|---|---|
| `POST /api/login` | `{email, password}` → cookie de session HttpOnly |
| `POST /api/logout` | termine la session |
| `GET /api/me` | utilisateur courant |
| `GET /api/meta` | métadonnées, statuts, préférences, liste des secteurs |
| `GET /api/search?q=...&pref=fr\|ue\|hautes_democraties\|all` | recherche secteurs + groupes filtrés par préférence |
| `GET /api/secteurs/:id?pref=...` | détail d'un secteur et ses groupes |
| `GET /api/groupes/:id?pref=...` | fiche groupe (sources résolues) |
| `GET /api/produits/:id?pref=...` | fiche produit + groupe parent |

## Structure

```
consommer-europeen/
├── data/                    # grille.json + secteurs-XX.json (un par secteur) + sources-*.json
├── src/server.ts            # Express : auth démo (cookie HttpOnly) + API + statique
├── public/                  # UI vanilla (login.html, index.html, app.js, style.css)
└── tools/parse_docx.py      # parser docx -> JSON (pour rafraîchir les données)
```

## Données (importées depuis le document v4)

Les données proviennent de `consommer_europeen_grille_sectorielle_v4_2026_10_11` (PDF + version Word déposée dans le Drive du projet) :

- `data/grille.json` : méta, méthode, légende des 5 statuts, préférences (+ infos d'import)
- `data/secteurs-01-04.json` : secteurs 01–04 (automobile, motos, pneumatiques, électroménager), avec produits/modèles et lieux de production
- `data/secteurs-05.json` … `secteurs-21.json` : secteurs 05–21 parsés depuis le `.docx` (un fichier par secteur)
- `data/sources-01-73.json`, `data/sources-74-146.json` : les 146 sources numérotées du document

Total : **21 secteurs, 429 groupes, 146 sources**. Le doc source compte 615 « lignes » (qui incluent sous-catégories et en-têtes) ; le parse en récupère 429 lignes-groupe bien formées (quelques lignes imbriquées restent dans le commentaire de la ligne précédente — voir `meta.import.anomalies_parse`).

### Rafraîchir les données (nouvelle version du document)

```bash
python3 tools/parse_docx.py /chemin/vers/la_grille_vX.docx /tmp/grille-parsed.json
# puis copier les secteurs 05+ parsés dans data/ (voir meta.import dans data/grille.json)
```

`siege_pays` : code pays ISO (FR, DE, NL, SE, IT, GB, CH, PL, FI, JP, KR, TW, CA, AT, IN, US, CN, EU…). Le filtre « Préférence France » ne retient que `siege_pays = "FR"`.

## Avertissement

Document d'information générale — ni conseil en investissement ni recommandation d'achat de titres (repris du document source).
