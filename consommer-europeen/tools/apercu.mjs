// Aperçu sans navigateur visible : captures d'écran + vérifications automatiques du design v2.
// Pensé pour un agent sans outil de visualisation : chaque règle de la maquette devient un test
// lisible en texte (OK / ÉCHEC), et les captures servent à la relecture humaine.
//
// Usage : node tools/apercu.mjs [url de base] [dossier de sortie]
//   ex.   node tools/apercu.mjs http://localhost:3000 apercu
// Prérequis : playwright installé (npm i --no-save playwright@1.63.0 && npx playwright install chromium)
// Code de sortie : 0 si toutes les vérifications passent, 1 sinon.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const BASE = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '');
const OUT = process.argv[3] || 'apercu';
mkdirSync(OUT, { recursive: true });

// Couleurs de la maquette (doivent correspondre aux variables --st-* de style.css)
const STATUTS = {
  rang1: { couleur: 'rgb(76, 195, 138)', fond: 'rgb(29, 61, 87)' },
  rang2: { couleur: 'rgb(108, 180, 255)', fond: 'rgb(34, 59, 105)' },
  vigilance: { couleur: 'rgb(242, 184, 75)', fond: 'rgb(56, 60, 77)' },
  hors_zones: { couleur: 'rgb(163, 173, 194)', fond: 'rgb(43, 58, 96)' },
  a_ecarter: { couleur: 'rgb(255, 128, 128)', fond: 'rgb(58, 51, 85)' },
};

const resultats = [];
const manquants = new Set();
function verifier(nom, ok, detail = '', bloquant = true) {
  const etat = ok ? 'OK' : bloquant ? 'ÉCHEC' : 'ATTENTION';
  resultats.push({ nom, ok: Boolean(ok), bloquant, etat, detail });
  console.log(`${etat.padEnd(9)} ${nom}${detail ? ` : ${detail}` : ''}`);
}

// Contraste WCAG calculé dans la page : couleur du texte contre le premier fond opaque des ancêtres
const CONTRASTE = `(sel) => {
  const lum = (c) => {
    const [r, g, b] = c.match(/[\\d.]+/g).slice(0, 3).map(Number).map((v) => {
      v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const fondDe = (e) => {
    for (let n = e; n; n = n.parentElement) {
      const bg = getComputedStyle(n).backgroundColor;
      const a = bg.match(/[\\d.]+/g);
      if (a && (a.length < 4 || Number(a[3]) > 0.9)) return bg;
    }
    return 'rgb(11, 22, 48)';
  };
  return [...document.querySelectorAll(sel)].slice(0, 30).map((e) => {
    const l1 = lum(getComputedStyle(e).color), l2 = lum(fondDe(e));
    return { texte: e.textContent.trim().slice(0, 30), ratio: (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05) };
  });
}`;

async function nouvellePage(navigateur, { mobile = false, pref = 'ue' } = {}) {
  const ctx = await navigateur.newContext(
    mobile
      ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
      : { viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 },
  );
  await ctx.addInitScript((p) => { try { localStorage.setItem('ce-pref', p); } catch {} }, pref);
  const page = await ctx.newPage();
  page.erreurs = [];
  page.on('pageerror', (e) => page.erreurs.push(String(e)));
  // Les 404 d'images sont suivis à part (logos téléchargés au démarrage du serveur, absents hors ligne)
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) page.erreurs.push(m.text()); });
  page.on('response', (r) => { if (r.status() >= 400) manquants.add(`${r.status()} ${r.url().replace(BASE, '')}`); });
  return page;
}

async function rechercher(page, q) {
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.fill('#search', q);
  await page.keyboard.press('Enter');
  await page.waitForSelector('#results .home-titre', { timeout: 10000 });
  await page.waitForTimeout(300);
}

async function capture(page, nom, pleinePage = false) {
  const fichier = path.join(OUT, `${nom}.png`);
  await page.screenshot({ path: fichier, fullPage: pleinePage });
  return fichier;
}

const navigateur = await chromium.launch();
const captures = [];
try {
  // 1. Accueil (bureau)
  const p = await nouvellePage(navigateur);
  await p.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  captures.push(await capture(p, '01-accueil-bureau'));
  const seg = await p.evaluate(() => {
    const s = document.querySelector('#pref-seg');
    const actif = s?.querySelector('button[aria-pressed="true"]');
    return { visible: s ? getComputedStyle(s).display !== 'none' : false, actif: actif?.textContent, nb: s?.querySelectorAll('button').length };
  });
  verifier('Préférence : sélecteur segmenté visible sur bureau', seg.visible, JSON.stringify(seg));
  verifier('Préférence : « Europe » actif avec pref=ue', seg.actif === 'Europe', `actif = ${seg.actif}`);

  // 2. Résultats « smartphone » (bureau)
  await rechercher(p, 'smartphone');
  captures.push(await capture(p, '02-resultats-smartphone-bureau', true));
  const cartes = await p.evaluate(() => [...document.querySelectorAll('#results .carte')].map((c) => ({
    v2: c.classList.contains('carte-v2'),
    statut: [...c.classList].find((k) => k.startsWith('st-'))?.slice(3),
    bordureInline: c.style.borderLeft || '',
    tuile: Boolean(c.querySelector('.carte-tuile svg')),
    couleurLibelle: c.querySelector('.carte-statut') ? getComputedStyle(c.querySelector('.carte-statut')).color : null,
    fondTuile: c.querySelector('.carte-tuile') ? getComputedStyle(c.querySelector('.carte-tuile')).backgroundColor : null,
    majuscules: c.querySelector('.carte-statut') ? getComputedStyle(c.querySelector('.carte-statut')).textTransform : null,
  })));
  verifier('Cartes : au moins une carte affichée', cartes.length > 0, `${cartes.length} cartes`);
  verifier('Cartes : toutes en design v2 (classe carte-v2)', cartes.every((c) => c.v2));
  verifier('Cartes : plus de liseré gauche en style inline', cartes.every((c) => !c.bordureInline));
  verifier('Cartes : tuile de statut avec pictogramme SVG', cartes.every((c) => c.tuile));
  verifier('Cartes : libellé de statut en majuscules', cartes.every((c) => c.majuscules === 'uppercase'));
  const malColorees = cartes.filter((c) => STATUTS[c.statut] && (c.couleurLibelle !== STATUTS[c.statut].couleur || c.fondTuile !== STATUTS[c.statut].fond));
  verifier('Cartes : couleurs de statut conformes à la maquette', malColorees.length === 0, malColorees.length ? JSON.stringify(malColorees[0]) : '');
  const colonnes = await p.evaluate(() => {
    const g = document.querySelector('.grille-cartes');
    return g ? getComputedStyle(g).gridTemplateColumns.split(' ').length : 1;
  });
  verifier('Résultats : 2 colonnes à 1280 px', colonnes === 2, `${colonnes} colonne(s)`);
  const titres = await p.$$eval('.res-groupe-titre', (h) => h.map((x) => x.textContent));
  verifier('Résultats : regroupés par secteur quand plusieurs secteurs', titres.length >= 2, titres.join(' / '));
  const contrastes = await p.evaluate(`(${CONTRASTE})('.carte-statut, .carte-controle, .carte-marques, .res-resume, .res-groupe-titre')`);
  const faibles = contrastes.filter((c) => c.ratio < 4.5);
  verifier('Contraste : textes des cartes ≥ 4,5:1', faibles.length === 0, faibles.length ? faibles.map((f) => `${f.texte} ${f.ratio.toFixed(2)}`).join(' ; ') : `min ${Math.min(...contrastes.map((c) => c.ratio)).toFixed(2)}`);

  // 3. Marque hors préférence : bloc « Hors de votre préférence »
  await rechercher(p, 'samsung');
  captures.push(await capture(p, '03-resultats-samsung-hors-preference', true));
  const hors = await p.evaluate(() => {
    const s = document.querySelector('.hors-pref');
    return s ? { titre: s.querySelector('h2')?.textContent, premier: s.querySelector('.hors-pref-nom')?.textContent } : null;
  });
  verifier('Hors préférence : bloc affiché pour « samsung » avec pref=ue', Boolean(hors), JSON.stringify(hors));
  verifier('Hors préférence : Samsung en premier', /^Samsung/.test(hors?.premier || ''), hors?.premier || '');

  // 4. Fiche (Huawei, hors préférence)
  await p.goto(`${BASE}/#/marque/informatique-huawei`, { waitUntil: 'networkidle' });
  await p.waitForSelector('#detail h2', { timeout: 10000 });
  await p.waitForTimeout(500);
  captures.push(await capture(p, '04-fiche-huawei-bureau'));
  const fiche = await p.evaluate(() => {
    const d = document.querySelector('#detail');
    const dialog = document.querySelector('#detail-modal');
    const liens = [...d.querySelectorAll('.fiche-texte sup a')];
    return {
      titreRelie: Boolean(document.getElementById(dialog.getAttribute('aria-labelledby') || '')),
      bandeau: d.querySelector('.fiche-statut-libelle')?.textContent,
      badgesDoublons: d.querySelectorAll('.badge').length,
      enBref: [...d.querySelectorAll('.en-bref-v2 dt')].map((x) => x.textContent),
      renvois: liens.length,
      renvoisCasses: liens.filter((a) => !d.querySelector(a.getAttribute('href'))).length,
      alternatives: [...d.querySelectorAll('.alt-carte strong')].map((x) => x.textContent),
    };
  });
  verifier('Fiche : la boîte de dialogue est reliée à son titre (#detail-titre)', fiche.titreRelie);
  verifier('Fiche : bandeau de statut présent', Boolean(fiche.bandeau), fiche.bandeau || '');
  verifier('Fiche : plus de badge de statut en double', fiche.badgesDoublons === 0, `${fiche.badgesDoublons} badge(s)`);
  verifier('Fiche : « En bref » complet', ['Contrôle', 'Production connue', 'Marques', 'Sources'].every((x) => fiche.enBref.includes(x)), fiche.enBref.join(', '));
  verifier('Fiche : renvois [n] cliquables et reliés aux sources', fiche.renvois > 0 && fiche.renvoisCasses === 0, `${fiche.renvois} renvoi(s), ${fiche.renvoisCasses} cassé(s)`);
  verifier('Fiche : alternatives de la même catégorie', fiche.alternatives.length > 0, fiche.alternatives.join(', '));
  const cFiche = await p.evaluate(`(${CONTRASTE})('#detail .fiche-statut-desc, #detail .en-bref-v2 dt, #detail .en-bref-v2 dd, #detail .alt-texte span, #detail .sources li, #detail .sources a')`);
  const cFaibles = cFiche.filter((c) => c.ratio < 4.5);
  verifier('Contraste : textes et liens de la fiche ≥ 4,5:1', cFaibles.length === 0, cFaibles.length ? cFaibles.map((f) => `${f.texte} ${f.ratio.toFixed(2)}`).join(' ; ') : `min ${Math.min(...cFiche.map((c) => c.ratio)).toFixed(2)}`);
  await p.evaluate(() => document.querySelector('.detail-card').scrollTo(0, 99999));
  await p.waitForTimeout(200);
  captures.push(await capture(p, '05-fiche-huawei-bas-bureau'));

  // 5. Page secteur : les cartes y sont aussi en design v2
  await p.goto(`${BASE}/#/secteur/informatique-et-telephonie`, { waitUntil: 'networkidle' });
  await p.waitForSelector('#results .carte', { timeout: 10000 });
  await p.waitForTimeout(300);
  captures.push(await capture(p, '05b-secteur-bureau'));
  const secteurV2 = await p.$$eval('#results .carte', (c) => c.length > 0 && c.every((x) => x.classList.contains('carte-v2')));
  verifier('Page secteur : cartes en design v2', secteurV2);
  const colSecteur = await p.evaluate(() => { const g = document.querySelector('#results > .results'); return g && getComputedStyle(g).display === 'grid' ? getComputedStyle(g).gridTemplateColumns.split(' ').length : 1; });
  verifier('Page secteur : 2 colonnes à 1280 px', colSecteur === 2, `${colSecteur} colonne(s)`);
  verifier('Bureau : aucune erreur JavaScript', p.erreurs.length === 0, p.erreurs.slice(0, 3).join(' | '));

  // 5. Mobile
  const m = await nouvellePage(navigateur, { mobile: true });
  await m.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  captures.push(await capture(m, '06-accueil-mobile'));
  const mob = await m.evaluate(() => ({
    segCache: !document.querySelector('#pref-seg') || getComputedStyle(document.querySelector('#pref-seg')).display === 'none',
    selectVisible: getComputedStyle(document.querySelector('.topbar-pref')).display !== 'none',
    etoiles: getComputedStyle(document.querySelector('.hero')).backgroundSize,
    debord: document.scrollingElement.scrollWidth - window.innerWidth,
  }));
  verifier('Mobile : liste déroulante à la place du sélecteur segmenté', mob.segCache && mob.selectVisible);
  verifier('Mobile : étoiles du héros masquées (ne recouvrent plus le titre)', /0px 0px/.test(mob.etoiles), mob.etoiles);
  verifier('Mobile : pas de défilement horizontal (accueil)', mob.debord <= 0, `${mob.debord} px`);
  await rechercher(m, 'smartphone');
  captures.push(await capture(m, '07-resultats-mobile', true));
  const debordRes = await m.evaluate(() => document.scrollingElement.scrollWidth - window.innerWidth);
  verifier('Mobile : pas de défilement horizontal (résultats)', debordRes <= 0, `${debordRes} px`);
  const cibles = await m.$$eval('.carte, .hors-pref-item, .chip', (els) => els.filter((e) => e.offsetParent).map((e) => e.getBoundingClientRect().height).filter((h) => h < 40).length);
  verifier('Mobile : cibles tactiles ≥ 40 px de haut', cibles === 0, `${cibles} trop petite(s)`);
  await m.goto(`${BASE}/#/marque/informatique-huawei`, { waitUntil: 'networkidle' });
  await m.waitForSelector('#detail h2', { timeout: 10000 });
  await m.waitForTimeout(400);
  captures.push(await capture(m, '08-fiche-mobile'));
  verifier('Mobile : aucune erreur JavaScript', m.erreurs.length === 0, m.erreurs.slice(0, 3).join(' | '));
  verifier('Ressources : aucune réponse HTTP en erreur (non bloquant)', manquants.size === 0, [...manquants].slice(0, 5).join(' ; ') + (manquants.size > 5 ? ` … (${manquants.size})` : ''), false);
} finally {
  await navigateur.close();
}

const echecs = resultats.filter((r) => !r.ok && r.bloquant);
const reussies = resultats.filter((r) => r.ok).length;
const alertes = resultats.filter((r) => !r.ok && !r.bloquant).length;
const bilan = `${reussies}/${resultats.length} vérifications réussies, ${echecs.length} échec(s) bloquant(s), ${alertes} avertissement(s).`;
const md = [
  `# Aperçu du design (${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC)`,
  '',
  `Base : ${BASE}`,
  '',
  `**${bilan}**`,
  '',
  '| Résultat | Vérification | Détail |',
  '|---|---|---|',
  ...resultats.map((r) => `| ${r.etat} | ${r.nom} | ${String(r.detail).replace(/\|/g, '/')} |`),
  '',
  '## Captures',
  '',
  ...captures.map((c) => `- ${path.basename(c)}`),
  '',
].join('\n');
writeFileSync(path.join(OUT, 'rapport.md'), md);
writeFileSync(path.join(OUT, 'rapport.json'), JSON.stringify({ base: BASE, resultats, captures }, null, 1));
console.log(`\n${bilan} Rapport : ${path.join(OUT, 'rapport.md')}`);
process.exitCode = echecs.length ? 1 : 0;
