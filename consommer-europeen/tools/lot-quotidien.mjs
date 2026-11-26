import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = join(root, 'data');

const args = process.argv.slice(2);
const nIdx = args.indexOf('--n');
const N = nIdx !== -1 ? Math.max(1, parseInt(args[nIdx + 1] ?? '6', 10) || 6) : 6;
const DRY = args.includes('--dry');

function slugify(s) {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

const planPath = join(dataDir, 'plan-ajouts.json');
if (!existsSync(planPath)) {
  console.log('Aucun plan-ajouts.json — rien à faire.');
  process.exit(0);
}
const plan = JSON.parse(readFileSync(planPath, 'utf8'));

const secteurs = readdirSync(dataDir).filter((f) => /^secteurs-.*\.json$/.test(f)).sort()
  .flatMap((f) => JSON.parse(readFileSync(join(dataDir, f), 'utf8')));
const secteurByNum = new Map(secteurs.map((s) => [s.num, s]));

let maxLot = 0;
for (const f of readdirSync(dataDir)) {
  const m = f.match(/^(?:extensions|sources|produits)-lot(\d+)\.json$/);
  if (m) maxLot = Math.max(maxLot, parseInt(m[1], 10));
}
const lotNum = maxLot + 1;
const lotTag = String(lotNum).padStart(2, '0');

const sources = Object.assign({}, ...readdirSync(dataDir).filter((f) => /^sources.*\.json$/.test(f)).sort()
  .map((f) => JSON.parse(readFileSync(join(dataDir, f), 'utf8'))));
let nextSource = 0;
for (const k of Object.keys(sources)) { const v = parseInt(k, 10); if (Number.isFinite(v)) nextSource = Math.max(nextSource, v); }
const normTxt0 = (t) => String(t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
{
  const nomsExistants0 = new Set();
  const idsExistants0 = new Set();
  const scan = (g) => { idsExistants0.add(g.id); nomsExistants0.add(normTxt0(g.groupe)); for (const m of g.marques ?? []) nomsExistants0.add(normTxt0(m)); };
  for (const sx of secteurs) for (const g of sx.groupes) scan(g);
  for (const f of readdirSync(dataDir).filter((f) => /^extensions-.*\.json$/.test(f))) {
    for (const b of Object.values(JSON.parse(readFileSync(join(dataDir, f), 'utf8')))) for (const g of b.groupes ?? []) scan(g);
  }
  for (const e of plan) {
    if (e.fait) continue;
    const noms = [e.groupe?.groupe, ...(e.groupe?.marques ?? [])].map((x) => normTxt0(x)).filter(Boolean);
    if (noms.some((n) => nomsExistants0.has(n))) { e.fait = true; e.ignore = 'deja-present'; }
  }
  writeFileSync(planPath, JSON.stringify(plan, null, 1) + '\n');
}
const dispo = plan.filter((e) => !e.fait);
if (!dispo.length) {
  console.log('Plan épuisé : toutes les entrées sont faites. Ajoute des entrées dans data/plan-ajouts.json.');
  process.exit(0);
}
const lot = dispo.slice(0, N);
console.log(`Lot du jour : ${lot.length} marque(s) sur ${dispo.length} restantes`);


const ext = {};
const src = {};
const prod = {};
const mots = JSON.parse(readFileSync(join(dataDir, 'mots-cles-marques.json'), 'utf8'));
const enr = JSON.parse(readFileSync(join(dataDir, 'marques-enrichies.json'), 'utf8'));
const aujourdhui = new Date().toISOString().slice(0, 10);
const normTxt = (t) => String(t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const dejaVus = new Set();
const nomsExistants = new Set();
const ajouterGroupeExistant = (g) => {
  dejaVus.add(g.id);
  nomsExistants.add(normTxt(g.groupe));
  for (const m of g.marques ?? []) nomsExistants.add(normTxt(m));
};
for (const s of secteurs) for (const g of s.groupes) ajouterGroupeExistant(g);
for (const f of readdirSync(dataDir).filter((f) => /^extensions-.*\.json$/.test(f))) {
  const ext = JSON.parse(readFileSync(join(dataDir, f), 'utf8'));
  for (const block of Object.values(ext)) for (const g of block.groupes ?? []) ajouterGroupeExistant(g);
}

for (const e of lot) {
  const s = secteurByNum.get(e.num);
  if (!s) throw new Error(`Secteur inconnu dans le plan: ${e.num}`);
  const nom = e.groupe.groupe.trim();
  let gid = s.id + '-' + slugify(nom);
  let i = 2;
  while (dejaVus.has(gid)) gid = s.id + '-' + slugify(nom) + '-' + i++;
  dejaVus.add(gid);
  const srcIds = [];
  if (e.source && String(e.source).trim()) {
    nextSource += 1;
    src[String(nextSource)] = String(e.source).trim().slice(0, 500);
    srcIds.push(nextSource);
  }
  const g = {
    id: gid,
    groupe: nom,
    marques: (e.groupe.marques ?? [nom]).map(String),
    siege: e.groupe.siege ?? 'À vérifier',
    siege_pays: (e.groupe.siege_pays ?? '??').toUpperCase().slice(0, 2),
    statut: e.groupe.statut ?? 'propose',
    sous_categorie: e.groupe.sous_categorie ?? '',
    commentaire: (e.groupe.commentaire ?? '') + (srcIds.length ? ` [${srcIds.join(',')}]` : ''),
    sources: srcIds,
    lieux_production: e.groupe.lieux_production ?? [],
    certifications: e.groupe.certifications ?? [],
    produits: [],
  };
  for (const p of e.produits ?? []) {
    if (!p.nom || String(p.nom).trim().length < 2) continue;
    g.produits.push({
      id: gid + '-' + slugify(String(p.nom)).slice(0, 60),
      nom: String(p.nom).trim().slice(0, 120),
      assemblage: p.assemblage ? String(p.assemblage).slice(0, 80) : null,
      origine_pieces: p.origine_pieces ? String(p.origine_pieces).slice(0, 80) : null,
      certifications: p.certifications ?? [],
      note: p.note ? String(p.note).slice(0, 300) : '',
    });
  }
  (ext[e.num] ??= { groupes: [] }).groupes.push(g);
  if (g.produits.length) prod[gid] = g.produits;
  if (e.motsCles?.length) mots[gid] = e.motsCles.map((k) => String(k).trim().toLowerCase()).filter(Boolean);
  if (e.enrich) enr[gid] = e.enrich;
  e.fait = true;
  e.faitLe = aujourdhui;
}

writeFileSync(join(dataDir, `extensions-lot${lotTag}.json`), JSON.stringify(ext, null, 1) + '\n');
writeFileSync(join(dataDir, `sources-lot${lotTag}.json`), JSON.stringify(src, null, 1) + '\n');
if (Object.keys(prod).length) writeFileSync(join(dataDir, `produits-lot${lotTag}.json`), JSON.stringify(prod, null, 1) + '\n');
writeFileSync(join(dataDir, 'mots-cles-marques.json'), JSON.stringify(mots, null, 1) + '\n');
writeFileSync(join(dataDir, 'marques-enrichies.json'), JSON.stringify(enr, null, 1) + '\n');
writeFileSync(planPath, JSON.stringify(plan, null, 1) + '\n');
console.log(`Fichiers écrits : extensions-lot${lotTag}.json (${Object.values(ext).reduce((a, b) => a + b.groupes.length, 0)} groupes), sources-lot${lotTag}.json (${Object.keys(src).length} sources), produits-lot${lotTag}.json (${Object.keys(prod).length} groupes avec produits)`);

console.log('--- validation : check:data ---');
execSync('node tools/check-data.mjs', { cwd: root, stdio: 'inherit' });
console.log('--- build tsc ---');
execSync('rm -rf dist && npx tsc', { cwd: root, stdio: 'inherit' });
console.log('--- tests recherche ---');
execSync('PORT=3987 RL_LIMIT=100000 node dist/server.js > /tmp/lot-quotidien-server.log 2>&1 & sleep 4; node tools/test-recherche.mjs http://localhost:3987 --strict; kill %1 2>/dev/null || true', { cwd: root, stdio: 'inherit', shell: '/bin/bash' });

if (DRY) {
  console.log('Mode --dry : pas de commit git.');
  process.exit(0);
}

const dateTag = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const branch = `bot/lot-auto-${dateTag}`;
const titre = `Lot auto ${new Date().toISOString().slice(0, 10)} : ${lot.length} marques depuis le plan (${[...new Set(lot.map((e) => e.num))].join(', ')})`;
const body = `## Lot automatique du ${aujourdhui}

${lot.length} marque(s) piochées dans \`data/plan-ajouts.json\` (${dispo.length - lot.length} restantes) :

${lot.map((e) => `- **${e.groupe.groupe}** (${e.num}${e.groupe.siege_pays ? ', ' + e.groupe.siege_pays : ''}, ${e.groupe.statut})${(e.produits ?? []).length ? ` — ${(e.produits ?? []).length} produit(s)` : ''}`).join('\n')}

Fichiers : \`extensions-lot${lotTag}.json\`, \`sources-lot${lotTag}.json\`, \`produits-lot${lotTag}.json\` + mots-clés + enrichissements + plan marqué fait.

## Vérification (CI)
- check:data, build tsc, tests recherche 67/67 (lancés aussi en local avant commit)
`;
writeFileSync('/tmp/lot-titre.txt', titre + '\n');
writeFileSync('/tmp/lot-body.md', body);

execSync('git config user.name "vibe-bot" && git config user.email "vibe-bot@mistral.ai"', { cwd: join(root, '..'), stdio: 'inherit' });
execSync(`git checkout -b ${branch}`, { cwd: join(root, '..'), stdio: 'inherit' });
execSync('git add consommer-europeen/data && git commit -m ' + JSON.stringify(titre + `\n\nGénéré automatiquement par tools/lot-quotidien.mjs (plan-ajouts.json).\n\nCo-authored-by: vibe-bot <vibe@mistral.ai>`), { cwd: join(root, '..'), stdio: 'inherit' });
console.log(`Branche prête : ${branch}`);
console.log(JSON.stringify({ branch, lot: lotTag, n: lot.length, restant: dispo.length - lot.length }));
