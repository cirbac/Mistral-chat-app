// Contrôle bloquant des données (CI) : ids uniques/valides, statuts valides,
// sources existantes et sans collision, pas d'entrées factices, sous-catégories connues,
// clés de mots-clés/enrichissement existantes.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const dataDir = new URL('../data/', import.meta.url).pathname;
const errors = [];
const VALID_STATUTS = new Set(['rang1', 'rang2', 'vigilance', 'hors_zones', 'a_ecarter', 'propose']);
const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, '');

const secteurs = readdirSync(dataDir)
  .filter((f) => /^secteurs-.*\.json$/.test(f))
  .sort()
  .flatMap((f) => JSON.parse(readFileSync(join(dataDir, f), 'utf8')));
for (const f of readdirSync(dataDir).filter((f) => /^extensions-.*\.json$/.test(f)).sort()) {
  const ext = JSON.parse(readFileSync(join(dataDir, f), 'utf8'));
  for (const [num, block] of Object.entries(ext)) {
    const s = secteurs.find((x) => x.num === num);
    if (s) s.groupes.push(...block.groupes);
  }
}

// sources : collision entre fichiers
const sourceOwner = new Map();
for (const f of readdirSync(dataDir).filter((f) => /^sources.*\.json$/.test(f))) {
  const src = JSON.parse(readFileSync(join(dataDir, f), 'utf8'));
  for (const k of Object.keys(src)) {
    if (sourceOwner.has(k) && sourceOwner.get(k) !== f) {
      errors.push(`collision source #${k}: ${sourceOwner.get(k)} vs ${f}`);
    }
    sourceOwner.set(k, f);
  }
}

const ids = new Set();
const names = new Map();
const warnings = [];
for (const s of secteurs) {
  const known = new Set(s.sous_categories ?? []);
  for (const g of s.groupes) {
    if (!g.id || /[?\s]/.test(g.id)) errors.push(`id invalide: ${g.id} (${s.num})`);
    if (ids.has(g.id)) errors.push(`id en double: ${g.id}`);
    ids.add(g.id);
    if (!g.groupe || g.groupe.trim().length < 2 || g.groupe.trim().toLowerCase() === 'x') errors.push(`groupe factice: ${g.id}`);
    if (g.marques?.some((m) => !m || m.trim() === 'x')) errors.push(`marque factice dans ${g.id}`);
    if (g.siege === 'x') errors.push(`siège factice: ${g.id}`);
    if (g.siege_pays === '??' || !g.siege) warnings.push(`siège à compléter: ${g.id}`);
    if (!VALID_STATUTS.has(g.statut)) errors.push(`statut invalide: ${g.statut} (${g.id})`);
    if (g.sous_categorie && !known.has(g.sous_categorie)) errors.push(`sous-catégorie inconnue: "${g.sous_categorie}" (${g.id})`);
    for (const n of g.sources ?? []) {
      if (typeof n !== 'number') errors.push(`source non entière: ${n} (${g.id})`);
      if (!sourceOwner.has(String(n))) errors.push(`source #${n} inexistante (${g.id})`);
    }
    const key = s.id + '|' + norm(g.groupe);
    if (names.has(key) && names.get(key) !== g.id && s.groupes.find((x) => x.id === names.get(key))?.statut !== 'propose' && g.statut !== 'propose') {
      errors.push(`doublon de nom dans le secteur ${s.num}: "${g.groupe}" (${names.get(key)} vs ${g.id})`);
    }
    names.set(key, g.id);
  }
}

for (const f of ['mots-cles-marques.json', 'marques-enrichies.json']) {
  const p = join(dataDir, f);
  if (!existsSync(p)) continue;
  const d = JSON.parse(readFileSync(p, 'utf8'));
  for (const k of Object.keys(d)) {
    if (!ids.has(k)) errors.push(`${f}: clé inconnue ${k}`);
    if (k.includes('?') || k.trim() === '') errors.push(`${f}: clé invalide ${k}`);
  }
}

if (warnings.length) console.warn(`check:data: ${warnings.length} avertissement(s) siège à compléter`);
if (errors.length) {
  console.error(`check:data: ${errors.length} erreur(s)\n` + errors.slice(0, 50).join('\n'));
  process.exit(1);
}
console.log(`check:data OK (${ids.size} groupes, ${sourceOwner.size} sources, ${warnings.length} avertissements)`);
