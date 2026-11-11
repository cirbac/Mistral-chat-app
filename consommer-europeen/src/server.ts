import express, { Request, Response } from 'express';
import path from 'node:path';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';

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

const extensionsPath = path.join(dataDir, 'extensions-web.json');
if (existsSync(extensionsPath)) {
  const extensions = JSON.parse(readFileSync(extensionsPath, 'utf8')) as Record<string, { groupes: Groupe[] }>;
  for (const [num, ext] of Object.entries(extensions)) {
    const secteur = secteurs.find((s) => s.num === num);
    if (secteur) secteur.groupes.push(...ext.groupes);
  }
}

const pharesPath = path.join(dataDir, 'produits-phares.json');
const pharesData: Record<string, Produit[]> = existsSync(pharesPath)
  ? (JSON.parse(readFileSync(pharesPath, 'utf8')) as Record<string, Produit[]>)
  : {};
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

const ajoutsPath = path.join(dataDir, 'ajouts.json');
let ajouts: { num: string; groupe: Groupe }[] = [];
if (existsSync(ajoutsPath)) {
  ajouts = JSON.parse(readFileSync(ajoutsPath, 'utf8')) as { num: string; groupe: Groupe }[];
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
  if (statut === 'propose') return true; // acceptation temporaire : visible dans toutes les préférences, badge « Proposé »
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

const app = express();
app.use(express.json({ limit: '64kb' }));

app.use(express.static(path.join(rootDir, 'public'), { index: false }));

app.get('/', (_req, res) => {
  res.sendFile(path.join(rootDir, 'public', 'index.html'));
});

app.get('/api/meta', (_req, res) => {
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
  res.json({ phares: phares.slice(0, 24), nouveaux });
});

app.get('/api/search', (req, res) => {
  const q = norm(String(req.query.q ?? '').trim());
  const pref = getPref(req);
  if (!q) {
    res.json({ q: '', pref, secteurs: [], groupes: [], masquees: 0 });
    return;
  }
  const secteursMatch = secteurs.filter(
    (s) =>
      norm(s.nom).includes(q) ||
      (s.keywords ?? []).some((k) => norm(k).includes(q)) ||
      (s.aliases ?? []).some((a) => norm(a).includes(q)),
  );
  const groupesMatch: ReturnType<typeof withStatut>[] = [];
  const produitsMatch: { produit: Produit; groupe: ReturnType<typeof withStatut>; secteur: { id: string; num: string; nom: string } }[] = [];
  let masquees = 0;
  for (const s of secteurs) {
    for (const g of s.groupes) {
      const item = withStatut(g, pref, s);
      const hayContexte = norm(
        [g.groupe, ...g.marques, ...(g.aliases ?? []), g.commentaire, g.siege].join(' '),
      );
      const haySecteur = norm([s.nom, ...(s.keywords ?? []), ...(s.aliases ?? [])].join(' '));
      const hayProduits = g.produits.map((p) => norm([p.nom, p.note ?? ''].join(' ')));
      const matchContexte = hayContexte.includes(q);
      const matchSecteur = haySecteur.includes(q);
      const matchProduit = hayProduits.some((h) => h.includes(q));
      if (!matchContexte && !matchSecteur && !matchProduit) continue;
      if (item.recommande) {
        groupesMatch.push(item);
        for (let i = 0; i < g.produits.length; i++) {
          if (matchContexte || hayProduits[i].includes(q)) {
            produitsMatch.push({ produit: g.produits[i], groupe: item, secteur: { id: s.id, num: s.num, nom: s.nom } });
          }
        }
      } else {
        masquees++;
      }
    }
  }
  res.json({
    q,
    pref,
    secteurs: secteursMatch.map((s) => ({ id: s.id, num: s.num, nom: s.nom, nbGroupes: s.groupes.length })),
    groupes: sortGroupes(groupesMatch),
    produits: produitsMatch,
    masquees,
  });
});

app.get('/api/secteurs/:id', (req, res) => {
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
      ...item,
      secteur: { id: s.id, num: s.num, nom: s.nom },
      sourcesResolues: g.sources.map((n) => ({ num: n, texte: sources[String(n)] ?? null })),
    });
    return;
  }
  res.status(404).json({ error: 'Groupe introuvable.' });
});

app.post('/api/produits', (req, res) => {
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
  } catch (err) {
    console.error(err);
  }
  res.status(201).json({ ok: true, groupe: withStatut(groupe, getPref(req), secteur) });
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(rootDir, 'public', 'admin.html'));
});

app.get('/api/admin/ajouts', (_req, res) => {
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
  } catch (err) {
    console.error(err);
  }
  const secteur = secteurs.find((s) => s.num === a.num);
  res.json({ ok: true, groupe: withStatut(a.groupe, 'all', secteur) });
});

app.delete('/api/admin/ajouts/:id', (req, res) => {
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

app.listen(PORT, () => {
  console.log(`Consommer européen démarré sur http://localhost:${PORT}`);
});
