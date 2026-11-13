import express, { Request, Response } from 'express';
import compression from 'compression';
import path from 'node:path';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';

const rootDir = path.join(__dirname, '..');
const envPath = path.join(rootDir, '.env');
if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

const PORT = Number(process.env.PORT ?? 3000);

interface Produit {
  id: string;
  nom: string;
  assemblage: string | null;
  origine_pieces: string | null;
  certifications: string[];
  note: string;
  openfoodfacts?: string | null;
  image?: string | null;
}

interface Groupe {
  id: string;
  groupe: string;
  marques: string[];
  aliases?: string[];
  siege: string;
  openfoodfacts?: string | null;
  siege_pays: string;
  statut: string;
  commentaire: string;
  sources: number[];
  lieux_production: string[];
  certifications: string[];
  produits: Produit[];
  sous_categorie?: string;
  logo?: string;
  site?: string;
  histoire?: string;
}

interface Secteur {
  id: string;
  num: string;
  nom: string;
  keywords?: string[];
  aliases?: string[];
  note?: string;
  sous_categories?: string[];
  groupes: Groupe[];
}

interface GrilleMeta {
  meta: Record<string, unknown> & { stats?: Record<string, number> };
  methode: { criteres: string[]; texte: string };
  statuts: { id: string; label: string; couleur: string; description: string }[];
  preferences: { id: string; label: string; description: string }[];
}

const dataDir = path.join(rootDir, 'data');
const grille = JSON.parse(readFileSync(path.join(dataDir, 'grille.json'), 'utf8')) as GrilleMeta;
const secteurs: Secteur[] = readdirSync(dataDir)
  .filter((f) => f.startsWith('secteurs-') && f.endsWith('.json'))
  .sort()
  .flatMap((f) => JSON.parse(readFileSync(path.join(dataDir, f), 'utf8')) as Secteur[]);

for (const f of readdirSync(dataDir).filter((f) => /^extensions-.*\.json$/.test(f))) {
  const extensions = JSON.parse(readFileSync(path.join(dataDir, f), 'utf8')) as Record<string, { groupes: Groupe[] }>;
  for (const [num, ext] of Object.entries(extensions)) {
    const secteur = secteurs.find((s) => s.num === num);
    if (secteur) secteur.groupes.push(...ext.groupes);
  }
}

const pharesData: Record<string, Produit[]> = {};
for (const f of readdirSync(dataDir).filter((f) => /^produits-(phares|lot).*\.json$/.test(f))) {
  Object.assign(pharesData, JSON.parse(readFileSync(path.join(dataDir, f), 'utf8')) as Record<string, Produit[]>);
}
{
  const phares = pharesData;
  for (const [gid, produits] of Object.entries(phares)) {
    for (const s of secteurs) {
      const g = s.groupes.find((x) => x.id === gid);
      if (g) {
        const existing = new Set(g.produits.map((p) => p.id));
        g.produits.push(...produits.filter((p) => !existing.has(p.id)));
      }
    }
  }
}

const masseFiles = readdirSync(dataDir)
  .filter((f) => /^produits-masse-.*\.json$/.test(f))
  .sort();
for (const f of masseFiles) {
  const masse = JSON.parse(readFileSync(path.join(dataDir, f), 'utf8')) as Record<string, Produit[]>;
  for (const [gid, produits] of Object.entries(masse)) {
    for (const s of secteurs) {
      const g = s.groupes.find((x) => x.id === gid);
      if (g) {
        const existing = new Set(g.produits.map((p) => p.id));
        g.produits.push(...produits.filter((p) => !existing.has(p.id)));
      }
    }
  }
}

const imagesOffPath = path.join(dataDir, 'images-off.json');
const imagesOff: Record<string, string> = existsSync(imagesOffPath)
  ? (JSON.parse(readFileSync(imagesOffPath, 'utf8')) as Record<string, string>)
  : {};

const enrichPath = path.join(dataDir, 'marques-enrichies.json');
if (existsSync(enrichPath)) {
  const enrich = JSON.parse(readFileSync(enrichPath, 'utf8')) as Record<string, { domaine?: string; histoire?: string }>;
  for (const s of secteurs) {
    for (const g of s.groupes) {
      const e = enrich[g.id];
      if (e) {
        if (e.domaine) {
          g.site = `https://www.${e.domaine}`;
          g.logo = `https://www.google.com/s2/favicons?domain=${e.domaine}&sz=256`;
        }
        if (e.histoire) g.histoire = e.histoire;
      }
    }
  }
}

function avatarDataUri(nom: string, couleur: string): string {
  const initial = (nom.trim()[0] ?? '?').toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" rx="20" fill="${couleur}"/><text x="48" y="64" font-family="system-ui,sans-serif" font-size="48" font-weight="700" fill="#ffffff" text-anchor="middle">${initial}</text></svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

const PALETTE = ['#1e3a8a', '#274b8f', '#16336e', '#2c5aa8', '#1b2f5c', '#35609f', '#12264d', '#3a6ab5'];
const logosDir = path.join(rootDir, 'public', 'assets', 'logos');
if (!existsSync(logosDir)) mkdirSync(logosDir, { recursive: true });
for (const s of secteurs) {
  for (const g of s.groupes) {
    if (g.site && g.logo && g.logo.includes('google.com/s2/favicons')) {
      const m = g.logo.match(/domain=([^&]+)/);
      if (m) {
        const file = path.join(logosDir, g.id + '.png');
        if (!existsSync(file)) {
          fetch(`https://www.google.com/s2/favicons?domain=${m[1]}&sz=128`, { headers: { 'User-Agent': 'CirbaConsult/1.0' } })
            .then(async (r) => {
              if (r.ok) {
                const buf = Buffer.from(await r.arrayBuffer());
                if (buf.length > 200) writeFileSync(file, buf);
              }
            })
            .catch(() => {});
        }
        g.logo = `assets/logos/${g.id}.png`;
      }
    }
    if (!g.logo) {
      let h = 0;
      for (const c of g.groupe) h = (h * 31 + c.charCodeAt(0)) >>> 0;
      g.logo = avatarDataUri(g.groupe, PALETTE[h % PALETTE.length]);
    }
  }
}

const motsClesPath = path.join(dataDir, 'mots-cles-marques.json');
const motsClesGlobal: Record<string, string[]> = existsSync(motsClesPath)
  ? (JSON.parse(readFileSync(motsClesPath, 'utf8')) as Record<string, string[]>)
  : {};
if (existsSync(motsClesPath)) {
  const motsCles = motsClesGlobal;
  for (const s of secteurs) {
    for (const g of s.groupes) {
      const kws = motsCles[g.id];
      if (kws && kws.length > 0) {
        const set = new Set([...(g.aliases ?? []), ...kws]);
        g.aliases = [...set];
      }
    }
  }
}

const ajoutsPath = path.join(dataDir, 'ajouts.json');
let ajouts: { num: string; groupe: Groupe }[] = [];

async function githubSaveAjouts() {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO;
  if (!token || !repo) return;
  try {
    const p = 'consommer-europeen/data/ajouts.json';
    const h = { Authorization: `Bearer ${token}`, 'User-Agent': 'CirbaConsult/1.0', 'Content-Type': 'application/json' };
    const g = await fetch(`https://api.github.com/repos/${repo}/contents/${p}`, { headers: h });
    const sha = g.ok ? ((await g.json()) as { sha?: string }).sha : undefined;
    await fetch(`https://api.github.com/repos/${repo}/contents/${p}`, {
      method: 'PUT',
      headers: h,
      body: JSON.stringify({ message: 'chore: propositions utilisateurs (admin)', content: Buffer.from(JSON.stringify(ajouts, null, 1) + '\n').toString('base64'), ...(sha ? { sha } : {}) }),
    });
  } catch (e) {
    console.error('githubSaveAjouts:', e);
  }
}

async function githubLoadAjouts() {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO;
  if (!token || !repo) return;
  try {
    const r = await fetch(`https://api.github.com/repos/${repo}/contents/consommer-europeen/data/ajouts.json`, { headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'CirbaConsult/1.0' } });
    if (!r.ok) return;
    const j = (await r.json()) as { content?: string };
    ajouts = JSON.parse(Buffer.from(j.content ?? '', 'base64').toString('utf8')) as { num: string; groupe: Groupe }[];
    try { writeFileSync(ajoutsPath, JSON.stringify(ajouts, null, 1), 'utf8');
    void githubSaveAjouts(); } catch {}
  } catch {}
}
if (existsSync(ajoutsPath)) {
  ajouts = JSON.parse(readFileSync(ajoutsPath, 'utf8')) as { num: string; groupe: Groupe }[];
} else {
  githubLoadAjouts().then(() => {
    for (const a of ajouts) {
      const secteur = secteurs.find((x) => x.num === a.num);
      if (secteur) secteur.groupes.push(a.groupe);
    }
    buildIndex();
    searchCache.clear();
  });
}
for (const a of ajouts) {
  const secteur = secteurs.find((s) => s.num === a.num);
  if (secteur) secteur.groupes.push(a.groupe);
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}
const sources: Record<string, string> = Object.assign(
  {},
  ...readdirSync(dataDir)
    .filter((f) => /^sources.*\.json$/.test(f))
    .sort()
    .map((f) => JSON.parse(readFileSync(path.join(dataDir, f), 'utf8'))),
);

const STATUT_ORDRE = ['rang1', 'rang2', 'vigilance', 'hors_zones', 'a_ecarter'];
const statutsById = new Map(grille.statuts.map((s) => [s.id, s]));

function recommande(statut: string, siegePays: string, pref: string): boolean {
  if (statut === 'propose') return pref === 'all'; // proposition : visible uniquement en « Tout afficher »
  if (pref === 'fr') return (statut === 'rang1' || statut === 'vigilance') && siegePays === 'FR';
  if (pref === 'ue') return statut === 'rang1' || statut === 'vigilance';
  if (pref === 'hautes_democraties') return ['rang1', 'rang2', 'vigilance'].includes(statut);
  return true;
}

function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\u2019'&]/g, '');
}

function stem(w: string): string {
  return w.length > 3 ? w.replace(/(s|x)$/, '') : w;
}

function withStatut(g: Groupe, pref: string, secteur?: Secteur) {
  const st = statutsById.get(g.statut);
  return {
    ...g,
    statutLabel: st?.label ?? g.statut,
    statutCouleur: st?.couleur ?? '#6e7781',
    recommande: recommande(g.statut, g.siege_pays, pref),
    secteurId: secteur?.id,
    secteurNom: secteur?.nom,
  };
}

function lightGroupe<T extends { produits?: Produit[] }>(g: T) {
  const { produits, ...rest } = g;
  return { ...rest, nbProduits: produits ? produits.length : 0 };
}

function sortGroupes<T extends { statut: string; groupe: string; recommande: boolean }>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    if (a.recommande !== b.recommande) return a.recommande ? -1 : 1;
    return (STATUT_ORDRE.indexOf(a.statut) - STATUT_ORDRE.indexOf(b.statut)) || a.groupe.localeCompare(b.groupe);
  });
}

const app = express();
app.use(express.json({ limit: '64kb' }));
app.set('trust proxy', 1);
app.use(compression());
app.disable('x-powered-by');
app.use((_req, res, next) => {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self'");
  next();
});

const rlHits = new Map<string, number[]>();
setInterval(() => {
  const now = Date.now();
  for (const [k, arr] of rlHits) {
    const a = arr.filter((t) => now - t < 60000);
    if (a.length) rlHits.set(k, a);
    else rlHits.delete(k);
  }
}, 120000).unref();
app.use('/api/', (req, res, next) => {
  const now = Date.now();
  const key = req.ip ?? 'x';
  const arr = (rlHits.get(key) ?? []).filter((t) => now - t < 60000);
  if (arr.length > Number(process.env.RL_LIMIT ?? 120)) {
    res.status(429).json({ error: 'Trop de requêtes, réessayez dans une minute.' });
    return;
  }
  arr.push(now);
  rlHits.set(key, arr);
  next();
});

app.get('/healthz', (_req, res) => res.json({ ok: true, groupes: secteurs.reduce((a, x) => a + x.groupes.length, 0) }));

app.use(
  express.static(path.join(rootDir, 'public'), {
    index: false,
    etag: true,
    maxAge: 0,
    setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache'),
  }),
);

app.get('/', (_req, res) => {
  res.sendFile(path.join(rootDir, 'public', 'index.html'));
});

app.get('/api/meta', (_req, res) => {
  res.json({
    meta: grille.meta,
    methode: grille.methode,
    statuts: grille.statuts,
    preferences: grille.preferences,
    secteurs: [...secteurs]
      .sort((a, b) => {
        const ordre = (grille.meta as Record<string, unknown>).ordreCategories as string[] | undefined;
        const oa = (ordre ?? []).indexOf(a.num);
        const ob = (ordre ?? []).indexOf(b.num);
        return (oa === -1 ? 999 : oa) - (ob === -1 ? 999 : ob) || a.num.localeCompare(b.num);
      })
      .map((s) => ({
        id: s.id,
        num: s.num,
        nom: s.nom,
        keywords: s.keywords ?? [],
        nbGroupes: s.groupes.length,
      })),
    nbGroupes: secteurs.reduce((a, s) => a + s.groupes.length, 0),
    nbProduits: secteurs.reduce((a, s) => a + s.groupes.reduce((b, g) => b + g.produits.length, 0), 0),
    nbSources: Object.keys(sources).length,
  });
});

function getPref(req: Request): string {
  const pref = String(req.query.pref ?? 'ue');
  return grille.preferences.some((p) => p.id === pref) ? pref : 'ue';
}

app.get('/api/accueil', (req, res) => {
  const pref = getPref(req);
  const wrap = (p: Produit, g: Groupe, s: Secteur) => {
    const m = (p.openfoodfacts ?? '').match(/produit\/(\d+)/);
    const image = m ? imagesOff[m[1]] ?? null : null;
    return {
      produit: { ...p, image },
      groupe: withStatut(g, pref, s),
      secteur: { id: s.id, num: s.num, nom: s.nom },
    };
  };
  const phares: ReturnType<typeof wrap>[] = [];
  const seen = new Set<string>();
  for (const [gid, ps] of Object.entries(pharesData)) {
    for (const s of secteurs) {
      const g = s.groupes.find((x) => x.id === gid);
      if (!g) continue;
      if (!withStatut(g, pref, s).recommande) continue;
      for (const p of g.produits) {
        if (!ps.some((y) => y.id === p.id) || seen.has(p.id)) continue;
        seen.add(p.id);
        phares.push(wrap(p, g, s));
      }
    }
  }
  const nouveaux: ReturnType<typeof wrap>[] = [];
  const recents: [string, Produit][] = [];
  for (const f of [...masseFiles].reverse()) {
    const m = JSON.parse(readFileSync(path.join(dataDir, f), 'utf8')) as Record<string, Produit[]>;
    for (const [gid, ps] of Object.entries(m)) for (const p of ps) recents.push([gid, p]);
  }
  for (const [gid, p] of recents.slice(0, 24)) {
    for (const s of secteurs) {
      const g = s.groupes.find((x) => x.id === gid);
      if (!g) continue;
      if (!withStatut(g, pref, s).recommande) break;
      nouveaux.push(wrap(p, g, s));
      break;
    }
  }
  phares.sort((a, b) => (b.produit.image ? 1 : 0) - (a.produit.image ? 1 : 0));
  res.json({ phares: phares.slice(0, 24), nouveaux });
});

const COMMON = new Set(['the','and','for','with','les','des','une','un','est','sur','aux','par','pas','plus','mais','dont','avec','que','qui','son','ses','de','du','la','le','en','au','a','et','ou','ce','cet','cette','se','ne','y','il','elle','on','nous','vous','ils','elles','leur','leurs','mon','ma','mes','ton','ta','tes']);
const SYNONYMES: Record<string, string[]> = {
  the: ['thé', 'tea'], 'thé': ['the', 'tea'], tea: ['thé', 'the'],
  cafe: ['café', 'coffee'], 'café': ['cafe', 'coffee'], coffee: ['café', 'cafe'],
  voiture: ['auto', 'automobile', 'car', 'vehicule'], auto: ['voiture', 'automobile', 'car'], automobile: ['voiture', 'auto', 'car'], car: ['voiture', 'auto', 'automobile'], vehicule: ['voiture', 'auto'],
  pneu: ['pneumatique', 'tire', 'tyre'], pneumatique: ['pneu', 'tire', 'tyre'], tire: ['pneu', 'pneumatique'],
  shampoing: ['shampoo'], shampoo: ['shampoing'],
  dentifrice: ['toothpaste'], toothpaste: ['dentifrice'],
  yaourt: ['yogurt', 'yoghurt'], yogurt: ['yaourt'], yoghurt: ['yaourt'],
  lait: ['milk'], milk: ['lait'],
  eau: ['water'], water: ['eau'],
  jus: ['juice'], juice: ['jus'],
  pain: ['bread'], bread: ['pain'],
  beurre: ['butter'], butter: ['beurre'],
  fromage: ['cheese'], cheese: ['fromage'],
  chocolat: ['chocolate'], chocolate: ['chocolat'],
  lessive: ['detergent', 'laundry'], detergent: ['lessive'],
  biere: ['bière', 'beer'], 'bière': ['biere', 'beer'], beer: ['bière', 'biere'],
  vin: ['wine'], wine: ['vin'],
  moto: ['scooter', 'deux-roues'], scooter: ['moto', 'deux-roues'],
  telephonie: ['telephone', 'smartphone', 'mobile'], telephone: ['telephonie', 'smartphone'], smartphone: ['telephone', 'mobile'],
  ordinateur: ['computer', 'pc'], computer: ['ordinateur', 'pc'], pc: ['ordinateur'],
  botte: ['bottes', 'bottine', 'bottines', 'boots'], bottes: ['botte', 'bottines', 'boots'], boots: ['bottes', 'botte'], bottine: ['bottes', 'botte'], bottines: ['bottes', 'botte'],
  basket: ['baskets', 'sneakers'], baskets: ['basket', 'sneakers'], sneakers: ['baskets'],
};

app.get('/api/catalogue', (req, res) => {
  const pref = getPref(req);
  const secteurId = String(req.query.secteur ?? '');
  const statut = String(req.query.statut ?? '');
  const page = Math.max(0, Number(req.query.page ?? 0));
  const PAGE = 48;
  let list = secteurs.flatMap((s) => s.groupes.map((g) => ({ g, s })));
  if (secteurId) list = list.filter((x) => x.s.id === secteurId);
  let items = list.map((x) => ({
    ...lightGroupe(withStatut(x.g, pref, x.s)),
    secteur: { id: x.s.id, num: x.s.num, nom: x.s.nom },
  }));
  if (statut) items = items.filter((x) => x.statut === statut);
  else items = items.filter((x) => x.recommande);
  items = sortGroupes(items);
  res.json({
    total: items.length,
    page,
    pageSize: PAGE,
    groupes: items.slice(page * PAGE, (page + 1) * PAGE),
  });
});

for (const s of secteurs) {
  const known = new Set(s.sous_categories ?? []);
  for (const g of s.groupes) {
    if (g.sous_categorie && !known.has(g.sous_categorie)) g.sous_categorie = '';
    const seenP = new Set<string>();
    g.produits = g.produits.filter((pr) => {
      if (!pr.id || seenP.has(pr.id) || (pr.nom ?? '').trim().length < 3) return false;
      seenP.add(pr.id);
      return true;
    });
  }
}
{
  const byName = new Map<string, Groupe>();
  for (const s of secteurs) for (const g of s.groupes) byName.set(norm(g.groupe), g);
  const PRUDENCE: Record<string, number> = { a_ecarter: 0, hors_zones: 1, vigilance: 2, rang2: 3, rang1: 4, propose: 5 };
  for (const s of secteurs) {
    for (const g of s.groupes) {
      const m = /\(([^)]+)\)\s*$/.exec(g.groupe);
      if (!m) continue;
      const parent = byName.get(norm(m[1].replace(/\s*(groupe|group|sa|ag|holdings?)\s*$/i, '').trim()));
      if (parent && parent.id !== g.id && parent.statut !== 'propose' && g.statut !== 'propose') {
        if (PRUDENCE[parent.statut] < PRUDENCE[g.statut]) {
          g.statut = parent.statut;
          if (parent.siege_pays && parent.siege_pays !== '??') g.siege_pays = parent.siege_pays;
        }
      }
    }
  }
}
dedupGroupes();

interface GIdx { g: Groupe; s: Secteur; hayN: string; hayC: string; hayS: string; hayP: string[]; }
let groupeIndex: GIdx[] = [];
function buildIndex() {
  groupeIndex = secteurs.flatMap((s) =>
  s.groupes.map((g) => ({
    g,
    s,
    hayN: norm([g.groupe, ...g.marques].join(' ')),
    hayC: norm([g.groupe, ...g.marques, ...(g.aliases ?? []), g.commentaire, g.siege].join(' ')),
    hayS: norm([s.nom, ...(s.keywords ?? []), ...(s.aliases ?? [])].join(' ')),
    hayP: g.produits.map((pr) => norm([pr.nom, pr.note ?? ''].join(' '))),
  })),
);
}
const searchCache = new Map<string, unknown>();

function dedupGroupes() {
  for (const s of secteurs) {
    const seen = new Map<string, Groupe>();
    const out: Groupe[] = [];
    for (const g of s.groupes) {
      const key = norm(g.groupe);
      if (g.statut === 'propose') { out.push(g); continue; }
      const ex = seen.get(key);
      if (ex) {
        ex.marques = [...new Set([...ex.marques, ...g.marques])];
        ex.aliases = [...new Set([...(ex.aliases ?? []), ...(g.aliases ?? [])])];
        ex.produits = [...ex.produits, ...g.produits.filter((pr) => !ex.produits.some((q) => q.id === pr.id))];
        ex.sources = [...new Set([...ex.sources, ...g.sources])];
        ex.lieux_production = [...new Set([...ex.lieux_production, ...g.lieux_production])];
        ex.certifications = [...new Set([...ex.certifications, ...g.certifications])];
        if (!ex.commentaire && g.commentaire) ex.commentaire = g.commentaire;
        if (!ex.site && g.site) { ex.site = g.site; ex.logo = g.logo; }
        if (!ex.histoire && g.histoire) ex.histoire = g.histoire;
        const PRUDENCE: Record<string, number> = { a_ecarter: 0, hors_zones: 1, vigilance: 2, rang2: 3, rang1: 4, propose: 5 };
        if (g.statut !== 'propose' && ex.statut !== 'propose' && PRUDENCE[g.statut] < PRUDENCE[ex.statut]) ex.statut = g.statut;
      } else {
        seen.set(key, g);
        out.push(g);
      }
    }
    s.groupes = out;
  }
}
buildIndex();

const vocabMotsCles = new Set<string>();
for (const s of secteurs) {
  vocabMotsCles.add(norm(s.nom));
  for (const k of [...(s.keywords ?? []), ...(s.aliases ?? [])]) vocabMotsCles.add(norm(k));
  for (const g of s.groupes) {
    vocabMotsCles.add(norm(g.groupe));
    for (const m of g.marques) vocabMotsCles.add(norm(m));
    for (const a of g.aliases ?? []) vocabMotsCles.add(norm(a));
  }
}
for (const k of Object.keys(SYNONYMES)) vocabMotsCles.add(norm(k));
for (const v of Object.values(SYNONYMES)) for (const x of v) vocabMotsCles.add(norm(x));
for (const kws of Object.values(motsClesGlobal)) for (const k of kws) vocabMotsCles.add(norm(k));
vocabMotsCles.delete('');

function lev(a: string, b: string): number {
  const m = a.length, n = b.length;
  const d: number[][] = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[m][n];
}

function motsProches(qRaw: string, max = 5): string[] {
  const q = qRaw.slice(0, 30);
  const exact = [...vocabMotsCles]
    .filter((m) => m.includes(q))
    .sort((a, b) => (a.startsWith(q) ? 0 : 1) - (b.startsWith(q) ? 0 : 1) || a.length - b.length || a.localeCompare(b))
    .slice(0, max);
  if (exact.length > 0) return exact;
  if (q.length < 3 || q.length > 30) return [];
  const maxD = Math.max(2, Math.floor(q.length / 2));
  return [...vocabMotsCles]
    .filter((m) => Math.abs(m.length - q.length) <= 2)
    .map((m) => ({ m, d: lev(q, m) }))
    .filter((x) => x.d <= maxD)
    .sort((a, b) => a.d - b.d || a.m.length - b.m.length)
    .slice(0, max)
    .map((x) => x.m);
}

app.get('/api/mots-cles', (req, res) => {
  if (String(req.query.all ?? '') === '1') {
    res.json({ mots: [...vocabMotsCles].sort((a, b) => a.localeCompare(b)).slice(0, 4000) });
    return;
  }
  const q = norm(String(req.query.q ?? '').trim());
  if (q.length < 2) {
    res.json({ mots: [] });
    return;
  }
  res.json({ mots: motsProches(q, 10) });
});

app.get('/api/search', (req, res) => {
  let q = norm(String(req.query.q ?? '').trim()).slice(0, 80);
  const pref = getPref(req);
  if (q.length < 2) {
    res.json({ q, pref, secteurs: [], groupes: [], masquees: 0, mots: motsProches(q, 5) });
    return;
  }
  const cacheKey = `${pref}|${q}`;
  const cached = searchCache.get(cacheKey);
  if (cached) {
    res.json(cached);
    return;
  }
  const MOUS = new Set(['femme', 'homme', 'enfant', 'bebe', 'ado', 'adulte', 'unisexe', 'cuir', 'daim', 'nubuck', 'suede', 'synthetique', 'coton', 'laine', 'maille', 'plastique', 'caoutchouc', 'bois', 'metal', 'aluminium', 'verre', 'goretex', 'acier', 'inox']);
  const motsQ0 = q.split(/[^a-z0-9]+/).filter((w) => w.length >= 2);
  const motsForts = motsQ0.filter((w) => !MOUS.has(w));
  if (motsForts.length > 0 && motsForts.length < motsQ0.length) q = motsForts.join(' ');
  if (motsForts.length === 0) {
    const syn = SYNONYMES[motsQ0[0]]?.[0];
    if (syn) q = norm(syn);
    else {
      res.json({ q, pref, secteurs: [], groupes: [], masquees: 0, mots: [] });
      return;
    }
  }
  let motsQ = q.split(/[^a-z0-9]+/).filter((w) => w.length >= 2 && !COMMON.has(w));
  if (motsQ.length === 0) {
    const syn = (SYNONYMES[motsQ0[0]] ?? []).map(norm).find((v) => !COMMON.has(v));
    if (!syn) {
      res.json({ q, pref, secteurs: [], groupes: [], masquees: 0, mots: [] });
      return;
    }
    q = norm(syn);
    motsQ = [q];
  }
  const variants = [q, ...(SYNONYMES[motsQ[0]] ?? []).map((v) => norm(v))];

  const wordMatch = (hay: string, w: string) => {
    const sw = stem(w);
    return hay.split(/[^a-z0-9]+/).some((x) => x === w || stem(x) === sw);
  };
  const matchNom = (hayN: string, hayC: string, w: string) =>
    wordMatch(hayN, w) || (w.length >= 3 && wordMatch(hayC, w)) || (w.length >= 4 && hayN.includes(w));
  const matchAnyL = (hayN: string, hayC: string, variantsL: string[]) =>
    (!COMMON.has(q) && q.length >= 4 && hayN.includes(q)) ||
    motsQ.some((m) => matchNom(hayN, hayC, m)) ||
    variantsL.slice(1).filter((v) => !COMMON.has(v)).some((v) => v.length >= 3 && wordMatch(hayC, v));
  const matchTousMots = (hayN: string, hayC: string) =>
    motsQ.length > 1 && motsQ.every((m) => matchNom(hayN, hayC, m) || (SYNONYMES[m] ?? []).some((v) => wordMatch(hayC, norm(v))));

  function scoreOf(g: { groupe: string; marques: string[]; aliases?: string[] }, hayN: string, hayC: string, matchProduit: boolean, variantsL: string[], sec?: Secteur): number {
    let sc = 0;
    const ql = q;
    for (const name of [g.groupe, ...g.marques]) {
      const n = norm(name);
      if (n === ql) sc = Math.max(sc, 100);
      else if (n.startsWith(ql)) sc = Math.max(sc, 80);
    }
    if (motsQ.some((m) => (g.aliases ?? []).some((a) => norm(a) === m))) sc = Math.max(sc, 60);
    if (matchTousMots(hayN, hayC)) sc = Math.max(sc, 70);
    else if (matchAnyL(hayN, hayC, variantsL)) sc = Math.max(sc, 50);
    else if (q.length >= 3 && wordMatch(hayC, q)) sc = 30;
    if (sec && (matchNom(norm(sec.nom), norm(sec.nom), q) || (sec.keywords ?? []).some((k) => wordMatch(norm(k), q)))) sc += 15;
    if (matchProduit) sc = Math.max(sc, 10);
    return sc;
  }

  const secteursMatch = secteurs.filter(
    (s) =>
      matchNom(norm(s.nom), norm(s.nom), motsQ[0]) ||
      motsQ.some((m) => (s.keywords ?? []).some((k) => matchNom(norm(k), norm(k), m))) ||
      (s.aliases ?? []).some((a) => motsQ.some((m) => matchNom(norm(a), norm(a), m))),
  );

  function runMatch(variantsL: string[]) {
    const groupesMatch: (ReturnType<typeof withStatut> & { score: number; et: boolean })[] = [];
    const horsPref: ReturnType<typeof withStatut>[] = [];
    let masquees = 0;
    for (const idx2 of groupeIndex) {
      const { g, s: sec, hayN, hayC, hayP } = idx2;
      const item = withStatut(g, pref, sec);
      const matchProduit = hayP.some((h) => motsQ.some((m) => wordMatch(h, m)));
      const matchC = matchAnyL(hayN, hayC, variantsL) || matchTousMots(hayN, hayC);
      if (!matchC && !matchProduit) continue;
      if (item.recommande) {
        groupesMatch.push({ ...item, score: scoreOf(g, hayN, hayC, matchProduit, variantsL, sec), et: motsQ.length > 1 && matchTousMots(hayN, hayC) });
      } else {
        masquees++;
        if (horsPref.length < 5) horsPref.push(item);
      }
    }
    return { groupesMatch, masquees, horsPref };
  }
  const r1 = runMatch([q]);
  let groupesMatch = r1.groupesMatch;
  let masquees = r1.masquees;
  const horsPref = r1.horsPref;
  if ((SYNONYMES[motsQ[0]] ?? []).length > 0 && r1.groupesMatch.length < 10) {
    const r2 = runMatch(variants);
    const byId = new Map(groupesMatch.map((g) => [g.id, g]));
    for (const g of r2.groupesMatch) {
      const ex = byId.get(g.id);
      if (ex) ex.score = Math.max(ex.score, g.score - 5);
      else byId.set(g.id, g);
    }
    groupesMatch = [...byId.values()];
    masquees = Math.max(masquees, r2.masquees);
  }
  const { masquees: masqueesFin } = { masquees };
  let gm = groupesMatch;
  const nbEt = gm.filter((g) => g.et).length;
  if (motsQ.length > 1 && nbEt >= 3) gm = gm.filter((g) => g.et);
  const groupes = gm
    .sort((a, b) => b.score - a.score || (STATUT_ORDRE.indexOf(a.statut) - STATUT_ORDRE.indexOf(b.statut)) || a.groupe.localeCompare(b.groupe))
    .slice(0, 100)
    .map(lightGroupe);
  const out = {
    q,
    pref,
    secteurs: secteursMatch.map((s) => ({ id: s.id, num: s.num, nom: s.nom, nbGroupes: s.groupes.length })),
    groupes,
    masquees,
    horsPref: horsPref.map(lightGroupe),
    mots: motsProches(q, 5),
  };
  if (searchCache.size > 100) searchCache.clear();
  searchCache.set(cacheKey, out);
  res.json(out);
});

app.get('/api/secteurs/:id', (req, res) => {
  const pref = getPref(req);
  const s = secteurs.find((x) => x.id === req.params.id);
  if (!s) {
    res.status(404).json({ error: 'Secteur introuvable.' });
    return;
  }
  const groupes = sortGroupes(s.groupes.map((g) => lightGroupe(withStatut(g, pref, s))));
  const visibles = groupes.filter((g) => g.recommande);
  res.json({
    id: s.id,
    num: s.num,
    nom: s.nom,
    note: s.note ?? '',
    sous_categories: s.sous_categories ?? [],
    keywords: s.keywords ?? [],
    pref,
    groupes,
    masquees: pref === 'all' ? 0 : groupes.length - visibles.length,
  });
});

app.get('/api/groupes/:id', (req, res) => {
  const pref = getPref(req);
  for (const s of secteurs) {
    const g = s.groupes.find((x) => x.id === req.params.id);
    if (!g) continue;
    const item = withStatut(g, pref, s);
    res.json({
      ...lightGroupe(item),
      secteur: { id: s.id, num: s.num, nom: s.nom },
      sourcesResolues: g.sources.map((n) => ({ num: n, texte: sources[String(n)] ?? null })),
    });
    return;
  }
  res.status(404).json({ error: 'Groupe introuvable.' });
});

function requireAdmin(req: Request, res: Response): boolean {
  const token = process.env.ADMIN_TOKEN;
  if (!token) {
    res.status(403).json({ error: 'Écriture désactivée (ADMIN_TOKEN non défini).' });
    return false;
  }
  if (req.headers['x-admin-token'] !== token) {
    res.status(403).json({ error: 'Non autorisé.' });
    return false;
  }
  return true;
}

app.post('/api/produits', (req, res) => {
  if (!requireAdmin(req, res)) return;
  const { q, num, marque, note } = req.body ?? {};
  if (typeof q !== 'string' || q.trim().length < 2 || q.trim().length > 80) {
    res.status(400).json({ error: 'Champ "q" requis (2 à 80 caractères).' });
    return;
  }
  const secteur = secteurs.find((s) => s.num === String(num)) ?? secteurs[0];
  const nom = q.trim();
  const gid = secteur.id + '-propose-' + slugify(nom);
  const groupe: Groupe = {
    id: gid,
    groupe: marque && typeof marque === 'string' && marque.trim() ? marque.trim() : nom,
    marques: [nom],
    siege: 'À vérifier',
    siege_pays: '??',
    statut: 'propose',
    commentaire: `Ajout proposé par un utilisateur le ${new Date().toISOString().slice(0, 10)} : « ${nom} »${note && typeof note === 'string' ? ' — ' + note.slice(0, 200) : ''}. En attente de vérification (statut, détention, production, source).`,
    sources: [],
    lieux_production: [],
    certifications: [],
    produits: [
      {
        id: gid + '-' + slugify(nom),
        nom,
        assemblage: null,
        origine_pieces: null,
        certifications: [],
        note: 'Produit proposé par un utilisateur — origine à vérifier.',
      },
    ],
  };
  ajouts.push({ num: secteur.num, groupe });
  secteur.groupes.push(groupe);
  try {
    writeFileSync(ajoutsPath, JSON.stringify(ajouts, null, 1), 'utf8');
    void githubSaveAjouts();
  } catch (err) {
    console.error(err);
  }
  searchCache.clear();
    res.status(201).json({ ok: true, groupe: withStatut(groupe, getPref(req), secteur) });
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(rootDir, 'public', 'admin.html'));
});

app.get('/api/admin/ajouts', (req, res) => {
  if (!requireAdmin(req, res)) return;
  res.json({
    ajouts: ajouts
      .filter((a) => !(a.groupe as { valide?: boolean }).valide)
      .map((a) => ({
        num: a.num,
        secteurNom: secteurs.find((s) => s.num === a.num)?.nom ?? a.num,
        groupe: a.groupe,
      })),
  });
});

app.post('/api/admin/ajouts/:id/valider', (req, res) => {
  if (!requireAdmin(req, res)) return;
  const a = ajouts.find((x) => x.groupe.id === req.params.id);
  if (!a) {
    res.status(404).json({ error: 'Ajout introuvable.' });
    return;
  }
  const { statut, source } = req.body ?? {};
  const statutsIds = grille.statuts.map((s) => s.id);
  if (typeof statut !== 'string' || !statutsIds.includes(statut) || statut === 'propose') {
    res.status(400).json({ error: `Statut invalide (attendu : ${statutsIds.filter((s) => s !== 'propose').join(', ')}).` });
    return;
  }
  a.groupe.statut = statut;
  a.groupe.siege = a.groupe.siege === 'À vérifier' ? 'À préciser' : a.groupe.siege;
  a.groupe.commentaire += ` Validé le ${new Date().toISOString().slice(0, 10)} (statut ${statut})${typeof source === 'string' && source.trim() ? ' — source : ' + source.trim().slice(0, 300) : ''}.`;
  (a.groupe as { valide?: boolean }).valide = true;
  try {
    writeFileSync(ajoutsPath, JSON.stringify(ajouts, null, 1), 'utf8');
    void githubSaveAjouts();
  } catch (err) {
    console.error(err);
  }
  const secteur = secteurs.find((s) => s.num === a.num);
  res.json({ ok: true, groupe: withStatut(a.groupe, 'all', secteur) });
});

app.delete('/api/admin/ajouts/:id', (req, res) => {
  if (!requireAdmin(req, res)) return;
  const idx = ajouts.findIndex((x) => x.groupe.id === req.params.id);
  if (idx === -1) {
    res.status(404).json({ error: 'Ajout introuvable.' });
    return;
  }
  const [a] = ajouts.splice(idx, 1);
  const secteur = secteurs.find((s) => s.num === a.num);
  if (secteur) secteur.groupes = secteur.groupes.filter((g) => g.id !== a.groupe.id);
  try {
    writeFileSync(ajoutsPath, JSON.stringify(ajouts, null, 1), 'utf8');
    void githubSaveAjouts();
  } catch (err) {
    console.error(err);
  }
  res.json({ ok: true });
});

app.get('/api/produits/:id', (req, res) => {
  const pref = getPref(req);
  for (const s of secteurs) {
    for (const g of s.groupes) {
      const p = g.produits.find((x) => x.id === req.params.id);
      if (!p) continue;
      res.json({
        produit: p,
        groupe: withStatut(g, pref, s),
        secteur: { id: s.id, num: s.num, nom: s.nom },
        sourcesResolues: g.sources.map((n) => ({ num: n, texte: sources[String(n)] ?? null })),
      });
      return;
    }
  }
  res.status(404).json({ error: 'Produit introuvable.' });
});

const offCache = new Map<string, Record<string, unknown>>();

app.get('/api/produits/:id/off', async (req, res) => {
  try {
    let found: Produit | undefined;
    for (const s of secteurs) {
      for (const g of s.groupes) {
        const p = g.produits.find((x) => x.id === req.params.id);
        if (p) {
          found = p;
          break;
        }
      }
      if (found) break;
    }
    if (!found) {
      res.status(404).json({ error: 'Produit introuvable.' });
      return;
    }
    const m = (found.openfoodfacts ?? '').match(/produit\/(\d+)/);
    if (!m) {
      res.json({ disponible: false });
      return;
    }
    const code = m[1];
    const cached = offCache.get(code);
    if (cached) {
      res.json(cached);
      return;
    }
    const fields =
      'code,product_name,brands,quantity,nutriscore_grade,ecoscore_grade,nova_group,ingredients_text,allergens_tags,labels_tags,origins,manufacturing_places,packaging,countries,image_front_url';
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const r = await fetch(
          `https://world.openfoodfacts.org/api/v0/product/${code}.json?fields=${fields}`,
          { headers: { 'User-Agent': 'CirbaConsult/1.0 (contact alexis.abric@cirbaconsult.com)' } },
        );
        if (r.status === 200) {
          const j = (await r.json()) as { status?: number; product?: Record<string, unknown> };
          if (j.status === 1 && j.product) {
            const p = j.product as Record<string, any>;
            const out = {
              disponible: true,
              code,
              nom: p.product_name ?? null,
              marques: p.brands ?? null,
              quantite: p.quantity ?? null,
              nutriscore: p.nutriscore_grade ?? null,
              green: p.ecoscore_grade ?? null,
              nova: p.nova_group ?? null,
              ingredients: p.ingredients_text ?? null,
              allergenes: (p.allergens_tags ?? []).map((t: string) => t.replace(/^en:/, '')),
              labels: p.labels_tags ?? [],
              origines: p.origins ?? null,
              fabrication: p.manufacturing_places ?? null,
              emballage: p.packaging ?? null,
              pays: p.countries ?? null,
              image: p.image_front_url ?? null,
            };
            offCache.set(code, out);
            res.json(out);
            return;
          }
        }
        if (r.status === 404) {
          res.json({ disponible: false });
          return;
        }
        await new Promise((r2) => setTimeout(r2, 1500 + attempt * 1000));
      } catch {
        await new Promise((r2) => setTimeout(r2, 1500 + attempt * 1000));
      }
    }
    res.json({ disponible: false });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

app.listen(PORT, () => {
  console.log(`Consommer européen démarré sur http://localhost:${PORT}`);
});
