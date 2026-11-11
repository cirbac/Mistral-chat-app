import express, { NextFunction, Request, Response } from 'express';
import path from 'node:path';
import crypto from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';

const rootDir = path.join(__dirname, '..');
const envPath = path.join(rootDir, '.env');
if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

const PORT = Number(process.env.PORT ?? 3000);
const DEMO_EMAIL = (process.env.DEMO_USER_EMAIL ?? 'demo@consommer-europeen.fr').toLowerCase();
const DEMO_PASSWORD = process.env.DEMO_USER_PASSWORD ?? 'demo1234';
const SESSION_SECRET = process.env.SESSION_SECRET ?? crypto.randomUUID();
const SESSION_TTL_MS = 7 * 24 * 3600 * 1000;

interface Produit {
  id: string;
  nom: string;
  assemblage: string | null;
  origine_pieces: string | null;
  certifications: string[];
  note: string;
}

interface Groupe {
  id: string;
  groupe: string;
  marques: string[];
  siege: string;
  siege_pays: string;
  statut: string;
  commentaire: string;
  sources: number[];
  lieux_production: string[];
  certifications: string[];
  produits: Produit[];
}

interface Secteur {
  id: string;
  num: string;
  nom: string;
  keywords?: string[];
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
  if (pref === 'fr') return (statut === 'rang1' || statut === 'vigilance') && siegePays === 'FR';
  if (pref === 'ue') return statut === 'rang1' || statut === 'vigilance';
  if (pref === 'hautes_democraties') return ['rang1', 'rang2', 'vigilance'].includes(statut);
  return true;
}

function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
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

function sortGroupes<T extends { statut: string; groupe: string; recommande: boolean }>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    if (a.recommande !== b.recommande) return a.recommande ? -1 : 1;
    return (STATUT_ORDRE.indexOf(a.statut) - STATUT_ORDRE.indexOf(b.statut)) || a.groupe.localeCompare(b.groupe);
  });
}

const sessions = new Map<string, { email: string; createdAt: number }>();

function hashPassword(p: string): string {
  return crypto.createHash('sha256').update(SESSION_SECRET + p).digest('hex');
}

function getCookie(req: Request, name: string): string | undefined {
  const raw = req.headers.cookie ?? '';
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return undefined;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      sessionUser?: string;
    }
  }
}

const app = express();
app.use(express.json({ limit: '64kb' }));

app.use((req, _res, next) => {
  const token = getCookie(req, 'session');
  const session = token ? sessions.get(token) : undefined;
  if (session && Date.now() - session.createdAt < SESSION_TTL_MS) {
    req.sessionUser = session.email;
  } else if (token) {
    sessions.delete(token);
  }
  next();
});

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.sessionUser) return next();
  res.status(401).json({ error: 'Non authentifié.' });
}

app.use(express.static(path.join(rootDir, 'public'), { index: false }));

app.get('/', (req, res) => {
  if (req.sessionUser) {
    res.sendFile(path.join(rootDir, 'public', 'index.html'));
  } else {
    res.redirect('/login.html');
  }
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body ?? {};
  if (typeof email !== 'string' || typeof password !== 'string') {
    res.status(400).json({ error: 'Corps attendu : { "email": "...", "password": "..." }.' });
    return;
  }
  const ok = email.toLowerCase() === DEMO_EMAIL && hashPassword(password) === hashPassword(DEMO_PASSWORD);
  if (!ok) {
    res.status(401).json({ error: 'Identifiants invalides.' });
    return;
  }
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { email: DEMO_EMAIL, createdAt: Date.now() });
  res.setHeader(
    'Set-Cookie',
    `session=${token}; HttpOnly; SameSite=Lax; Path=/; MaxAge=${SESSION_TTL_MS / 1000}`,
  );
  res.json({ ok: true, email: DEMO_EMAIL });
});

app.post('/api/logout', (req, res) => {
  const token = getCookie(req, 'session');
  if (token) sessions.delete(token);
  res.setHeader('Set-Cookie', 'session=; HttpOnly; SameSite=Lax; Path=/; MaxAge=0');
  res.json({ ok: true });
});

app.get('/api/me', requireAuth, (req, res) => {
  res.json({ email: req.sessionUser });
});

app.get('/api/meta', requireAuth, (_req, res) => {
  res.json({
    meta: grille.meta,
    methode: grille.methode,
    statuts: grille.statuts,
    preferences: grille.preferences,
    secteurs: secteurs.map((s) => ({
      id: s.id,
      num: s.num,
      nom: s.nom,
      keywords: s.keywords ?? [],
      nbGroupes: s.groupes.length,
    })),
  });
});

function getPref(req: Request): string {
  const pref = String(req.query.pref ?? 'ue');
  return grille.preferences.some((p) => p.id === pref) ? pref : 'ue';
}

app.get('/api/search', requireAuth, (req, res) => {
  const q = norm(String(req.query.q ?? '').trim());
  const pref = getPref(req);
  if (!q) {
    res.json({ q: '', pref, secteurs: [], groupes: [], masquees: 0 });
    return;
  }
  const secteursMatch = secteurs.filter(
    (s) => norm(s.nom).includes(q) || (s.keywords ?? []).some((k) => norm(k).includes(q)),
  );
  const groupesMatch: ReturnType<typeof withStatut>[] = [];
  let masquees = 0;
  for (const s of secteurs) {
    for (const g of s.groupes) {
      const hay = norm(
        [g.groupe, ...g.marques, s.nom, ...(s.keywords ?? []), g.commentaire, g.siege, ...g.produits.map((p) => p.nom)].join(' '),
      );
      if (!hay.includes(q)) continue;
      const item = withStatut(g, pref, s);
      if (item.recommande) groupesMatch.push(item);
      else masquees++;
    }
  }
  res.json({
    q,
    pref,
    secteurs: secteursMatch.map((s) => ({ id: s.id, num: s.num, nom: s.nom, nbGroupes: s.groupes.length })),
    groupes: sortGroupes(groupesMatch),
    masquees,
  });
});

app.get('/api/secteurs/:id', requireAuth, (req, res) => {
  const pref = getPref(req);
  const s = secteurs.find((x) => x.id === req.params.id);
  if (!s) {
    res.status(404).json({ error: 'Secteur introuvable.' });
    return;
  }
  const groupes = sortGroupes(s.groupes.map((g) => withStatut(g, pref, s)));
  const visibles = groupes.filter((g) => g.recommande);
  res.json({
    id: s.id,
    num: s.num,
    nom: s.nom,
    note: s.note ?? '',
    sous_categories: s.sous_categories ?? [],
    keywords: s.keywords ?? [],
    pref,
    groupes: pref === 'all' ? groupes : visibles,
    masquees: pref === 'all' ? 0 : groupes.length - visibles.length,
  });
});

app.get('/api/groupes/:id', requireAuth, (req, res) => {
  const pref = getPref(req);
  for (const s of secteurs) {
    const g = s.groupes.find((x) => x.id === req.params.id);
    if (!g) continue;
    const item = withStatut(g, pref, s);
    res.json({
      ...item,
      secteur: { id: s.id, num: s.num, nom: s.nom },
      sourcesResolues: g.sources.map((n) => ({ num: n, texte: sources[String(n)] ?? null })),
    });
    return;
  }
  res.status(404).json({ error: 'Groupe introuvable.' });
});

app.get('/api/produits/:id', requireAuth, (req, res) => {
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

app.listen(PORT, () => {
  console.log(`Consommer européen démarré sur http://localhost:${PORT}`);
  if (process.env.SESSION_SECRET === undefined) {
    console.log('SESSION_SECRET non défini : secret aléatoire généré (les sessions seront perdues au redémarrage).');
  }
});
