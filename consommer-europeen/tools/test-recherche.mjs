// Jeu de tests de pertinence pour GET /api/search (aucune écriture).
// Usage : node tools/test-recherche.mjs [http://localhost:3000] [--strict] [--json]
// Le serveur doit tourner (npm start). --strict : code de sortie 1 si un test échoue (CI).
const BASE = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'http://localhost:3000';
const AS_JSON = process.argv.includes('--json');

// Chaque test : q, pref, puis une ou plusieurs attentes.
// top1 : regex sur le nom du 1er groupe ; inTop:[n, regex] : un des n premiers correspond ;
// notInTop:[n, regex] : aucun des n premiers ne correspond ; max : nombre max de groupes ;
// top1Sector : regex sur le secteur du 1er groupe ; horsTop1 / horsHas : sur la liste des masquées ;
// corrige : valeur attendue du champ corrige ; maxMs : temps max (1er appel).
const T = [
  // Marques et noms exacts
  { q: 'renault', pref: 'fr', top1: /^Renault Group$/ },
  { q: 'dacia', pref: 'all', top1: /Dacia/ },
  { q: 'h&m', pref: 'all', top1: /^H&M Group$/ },
  { q: 'c&a', pref: 'all', top1: /^C&A$/ },
  { q: 'lg', pref: 'all', top1: /^LG Electronics$/ },
  { q: 'hp', pref: 'all', top1: /^HP/ },
  { q: 'mg', pref: 'all', top1: /^MG$/, max: 3 },
  { q: 'bmw', pref: 'all', top1: /^BMW Group$/ },
  { q: 'omega', pref: 'all', top1: /^Omega/ },
  { q: 'nestle', pref: 'all', top1: /^Nestlé$/ },
  { q: 'loreal', pref: 'all', top1: /^L'Oréal$/ },
  { q: "l'oréal paris", pref: 'all', top1: /^L'Oréal$/ },
  { q: 'coca cola', pref: 'all', top1: /Coca-Cola/, notInTop: [10, /Nicolas|Bricolage/] },
  { q: 'nutella', pref: 'all', top1: /^Ferrero$/ },
  { q: 'nespresso', pref: 'all', top1: /^Nespresso/ },
  { q: 'zara', pref: 'all', top1: /^Inditex$/ },
  { q: 'evian', pref: 'all', top1: /^Danone$/ },
  { q: 'free', pref: 'all', top1: /^Iliad$/, notInTop: [5, /^(Aldi|Auchan|Bel)$/] },
  { q: 'iphone', pref: 'all', top1: /^Apple$/ },
  { q: 'decathlon', pref: 'all', top1: /^Decathlon$/ },
  { q: 'samsung', pref: 'hautes_democraties', top1: /^Samsung/ },
  // Préférence : la marque cherchée doit apparaître en tête des masquées
  { q: 'samsung', pref: 'ue', horsTop1: /^Samsung/ },
  { q: 'huawei', pref: 'ue', horsHas: /^Huawei$/ },
  { q: 'shein', pref: 'ue', horsHas: /^Shein$/ },
  // Fautes de frappe et saisie partielle
  { q: 'renaut', pref: 'all', top1: /^Renault Group$/, corrige: 'renault' },
  { q: 'michelan', pref: 'all', top1: /Michelin/ },
  { q: 'decatlon', pref: 'all', top1: /^Decathlon$/ },
  { q: 'nestl', pref: 'all', top1: /^Nestlé$/ },
  { q: 'peug', pref: 'all', inTop: [3, /Stellantis|Peugeot/] },
  // Catégories et requêtes à plusieurs mots
  { q: 'voiture', pref: 'fr', top1Sector: /Automobile/ },
  { q: 'voitures', pref: 'fr', top1Sector: /Automobile/ },
  { q: 'botte de randonnée', pref: 'all', max: 10, inTop: [5, /Meindl|Scarpa|Fenix|Aigle/] },
  { q: 'chaussure de randonnée', pref: 'all', max: 15 },
  { q: 'thé', pref: 'all', inTop: [5, /Kusmi|Palais des Thés|Dammann/], notInTop: [10, /Document Foundation|Pokémon|Electronic Arts/] },
  { q: 'tea', pref: 'all', top1: /Kusmi/ },
  { q: 'café', pref: 'ue', inTop: [5, /Lavazza|Illy|Malongo|Dallmayr|Costa/] },
  { q: 'smartphone', pref: 'ue', notInTop: [5, /Hello bank|Wero/] },
  { q: 'parfum homme', pref: 'all', top1Sector: /Beauté/ },
  { q: 'jouet en bois', pref: 'ue', top1Sector: /Jouets/ },
  { q: 'velo', pref: 'all', notInTop: [10, /^(Bel|Danone)$/] },
  { q: 'ski', pref: 'all', notInTop: [10, /L'Oréal|Lactalis|Nestlé/] },
  { q: 'eau', pref: 'all', notInTop: [10, /Auchan Telecom|Deliveroo/] },
  { q: 'pneus', pref: 'all', inTop: [5, /Michelin/] },
  { q: 'yaourts', pref: 'all', sameTop1As: 'yaourt' },
  // Cas supplémentaires (bruit, ET/OU, fautes)
  { q: 'samsung', pref: 'ue', notInTop: [3, /Mistral/] },
  { q: 'omega', pref: 'all', notInTop: [3, /^(Aldi|Auchan|Carrefour)$/] },
  { q: 'cola', pref: 'all', top1: /Coca-Cola/, notInTop: [10, /Nicolas|Bricolage/] },
  { q: 'palais des thés', pref: 'all', top1: /Palais des Thés/, notInTop: [5, /CD Projekt|Document Foundation/] },
  { q: 'la vache qui rit', pref: 'all', top1: /^Bel$/, notInTop: [5, /Vacheron/] },
  { q: 'moulin roty', pref: 'all', top1: /Moulin Roty/, max: 2 },
  { q: 'kinder bueno', pref: 'all', top1: /^Ferrero$/, notInTop: [3, /^(Haribo|Nestlé)$/] },
  { q: 'eau minérale', pref: 'all', notInTop: [5, /Suez|Veolia/] },
  { q: 'jouet en bois', pref: 'all', inTop: [3, /Janod|Haba|Moulin Roty|Vilac|Djeco/] },
  { q: 'voiture électrique', pref: 'all', top1Sector: /Automobile/ },
  { q: 'automobile', pref: 'all', top1Sector: /Automobile/, notInTop: [20, /Nextcloud/] }, // PR #92
  { q: 'électroménager', pref: 'all', top1Sector: /Électroménager/ },
  { q: 'banque en ligne', pref: 'all', top1Sector: /Banque/ },
  { q: 'galaxy', pref: 'all', top1: /^Samsung/ },
  { q: 'clio', pref: 'all', top1: /^Renault Group$/ },
  { q: 'lorreal', pref: 'all', top1: /^L'Oréal$/ },
  { q: 'samsong', pref: 'all', top1: /^Samsung/ },
  { q: 'carefour', pref: 'all', top1: /^Carrefour$/ },
  { q: 'nesle', pref: 'all', top1: /^Nestlé$/ },
  // Limites
  { q: 'a', pref: 'all', max: 0 },
  { q: 'homme', pref: 'all', max: 0 },
  { q: '<script>alert(1)</script>', pref: 'all', max: 0 },
  { q: 'x'.repeat(500), pref: 'all', max: 0, maxMs: 60 },
];

async function get(q, pref) {
  const t0 = performance.now();
  const r = await fetch(`${BASE}/api/search?q=${encodeURIComponent(q)}&pref=${pref}`);
  const d = await r.json();
  return { d, ms: performance.now() - t0, status: r.status };
}

const rows = [];
const times = [];
for (const t of T) {
  const { d, ms, status } = await get(t.q, t.pref);
  times.push(ms);
  const g = d.groupes || [];
  const names = g.map((x) => x.groupe);
  const hors = (d.horsPref || []).map((x) => x.groupe);
  const fails = [];
  if (status !== 200) fails.push(`HTTP ${status}`);
  if (t.top1 && !t.top1.test(names[0] || '')) fails.push(`1er = « ${names[0] ?? 'aucun'} »`);
  if (t.inTop && !names.slice(0, t.inTop[0]).some((n) => t.inTop[1].test(n))) fails.push(`absent des ${t.inTop[0]} premiers`);
  if (t.notInTop) {
    const bad = names.slice(0, t.notInTop[0]).filter((n) => t.notInTop[1].test(n));
    if (bad.length) fails.push(`faux positifs : ${bad.join(', ')}`);
  }
  if (t.max !== undefined && g.length > t.max) fails.push(`${g.length} résultats (max ${t.max})`);
  if (t.top1Sector && !t.top1Sector.test((g[0] || {}).secteurNom || '')) fails.push(`secteur du 1er = « ${(g[0] || {}).secteurNom ?? 'aucun'} » (${names[0] ?? ''})`);
  if (t.horsTop1 && !t.horsTop1.test(hors[0] || '')) fails.push(`1re masquée = « ${hors[0] ?? 'aucune'} »`);
  if (t.horsHas && !hors.some((n) => t.horsHas.test(n))) fails.push(`masquées : ${hors.join(', ') || 'aucune'}`);
  if (t.corrige && d.corrige !== t.corrige) fails.push(`corrige = ${JSON.stringify(d.corrige ?? null)}`);
  if (t.sameTop1As) {
    const ref = await get(t.sameTop1As, t.pref);
    if ((ref.d.groupes[0] || {}).groupe !== names[0]) fails.push(`1er « ${names[0]} » ≠ « ${(ref.d.groupes[0] || {}).groupe} » pour « ${t.sameTop1As} »`);
  }
  if (t.maxMs && ms > t.maxMs) fails.push(`${Math.round(ms)} ms > ${t.maxMs}`);
  rows.push({ q: t.q.length > 30 ? t.q.slice(0, 12) + `…(${t.q.length})` : t.q, pref: t.pref, ok: fails.length === 0, fails, top: names.slice(0, 4), n: g.length, ms: Math.round(ms) });
}
times.sort((a, b) => a - b);
const pct = (p) => Math.round(times[Math.min(times.length - 1, Math.floor((p / 100) * times.length))]);
const summary = { reussis: rows.filter((r) => r.ok).length, total: rows.length, p50ms: pct(50), p95ms: pct(95), maxms: Math.round(times[times.length - 1]) };
if (process.argv.includes('--strict')) process.exitCode = summary.reussis === summary.total ? 0 : 1;
if (AS_JSON) console.log(JSON.stringify({ summary, rows }, null, 1));
else {
  for (const r of rows) console.log(`${r.ok ? 'OK  ' : 'ÉCHEC'} ${r.q.padEnd(24)} ${r.pref.padEnd(18)} ${String(r.n).padStart(3)} rés. ${String(r.ms).padStart(4)} ms  ${r.ok ? r.top.join(' ; ') : r.fails.join(' | ')}`);
  console.log(JSON.stringify(summary));
}
