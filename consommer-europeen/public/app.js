const state = {
  catalogueFiltres: { secteur: '', statut: '', page: 0 },
  vocab: [],
  precedent: null,
  meta: null,
  pref: (() => { try { return localStorage.getItem('ce-pref') || 'ue'; } catch { return 'ue'; } })(),
  view: 'home',
  secteurId: null,
};

const IMAGES = {
  '01': 'assets/cats/01-1503376780353-7e6692767b70.jpg',
  '02': 'assets/cats/02-1558981403-c5f9899a28bc.jpg',
  '03': 'assets/cats/03-1578844251758-2f71da64c96f.jpg',
  '04': 'assets/cats/04-1626806787461-102c1bfaaea1.jpg',
  '05': 'assets/cats/05-1593359677879-a4bb92f829d1.jpg',
  '06': 'assets/cats/06-1511707171634-5f897ff02aa9.jpg',
  '07': 'assets/cats/07-1461749280684-dccba630e2f6.jpg',
  '08': 'assets/cats/08-1504674900247-0877df9cc836.jpg',
  '09': 'assets/cats/09-1556228720-195a672e8a03.jpg',
  '09b': 'assets/cats/09b-1596462502278-27bfdc403348.jpg',
  '10': 'assets/cats/10-1441986300917-64674bd600d8.jpg',
  '11': 'assets/cats/11-1488646953014-85cb44e25828.jpg',
  '12': 'assets/cats/12-1563013544-824ae1b704d3.jpg',
  '13': 'assets/cats/13-1466611653911-95081537e5b7.jpg',
  '14': 'assets/cats/14-1541354329998-f4d9a9f9297f.jpg',
  '15': 'assets/cats/15-1474487548417-781cb71495f3.jpg',
  '16': 'assets/cats/16-1566073771259-6a8506099945.jpg',
  '17': 'assets/cats/17-1493711662062-fa541adb3fc8.jpg',
  '18': 'assets/cats/18-1585320806297-9794b3e4eeae.jpg',
  '19': 'assets/cats/19-1523275335684-37898b6baf30.jpg',
  '20': 'assets/cats/20-1522869635100-9f4c5e86aa37.jpg',
  '21': 'assets/cats/21-1517248135467-4c7edcad34c4.jpg',
};

const el = {
  pref: document.getElementById('pref'),
  search: document.getElementById('search'),
  suggestions: document.getElementById('suggestions'),
  chips: document.getElementById('secteur-chips'),
  home: document.getElementById('home'),
  homeGrid: document.getElementById('home-grid'),
  catalogue: document.getElementById('catalogue'),
  catalogueRetour: document.getElementById('catalogue-retour'),
  catalogueCount: document.getElementById('catalogue-count'),
  catFiltresStatuts: document.getElementById('cat-filtres-statuts'),
  catFiltresSecteurs: document.getElementById('cat-filtres-secteurs'),
  catalogueResults: document.getElementById('catalogue-results'),
  cataloguePlus: document.getElementById('catalogue-plus'),
  btnCatalogue: document.getElementById('btn-catalogue'),
  heroStats: document.getElementById('hero-stats'),
  results: document.getElementById('results'),
  detail: document.getElementById('detail'),
  detailModal: document.getElementById('detail-modal'),
  detailClose: document.getElementById('detail-close'),
  contenu: document.querySelector('.contenu'),
  footer: document.getElementById('footer'),
  logoHome: document.getElementById('logo-home'),
  addModal: document.getElementById('add-modal'),
  addClose: document.getElementById('add-close'),
  addForm: document.getElementById('add-form'),
  addQ: document.getElementById('add-q'),
  addSecteur: document.getElementById('add-secteur'),
  addMarque: document.getElementById('add-marque'),
  addNote: document.getElementById('add-note'),
  addMsg: document.getElementById('add-msg'),
};

let netBannerTimer;
function showNetBanner(msg) {
  const b = document.getElementById('net-banner');
  if (!b) return;
  b.textContent = msg;
  b.classList.remove('hidden');
  clearTimeout(netBannerTimer);
  netBannerTimer = setTimeout(() => b.classList.add('hidden'), 8000);
}

async function api(path) {
  try {
    const res = await fetch(path);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Erreur ${res.status}`);
    }
    return await res.json();
  } catch (e) {
    showNetBanner('Le service démarre ou est indisponible — nouvelle tentative…');
    throw e;
  }
}

let detailLastFocus = null;
function openDetail() {
  detailLastFocus = document.activeElement;
  el.detailModal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  el.detailClose.focus();
}

function closeDetail() {
  el.detailModal.classList.add('hidden');
  document.body.style.overflow = '';
  el.contenu.classList.remove('avec-detail');
  if (detailLastFocus && detailLastFocus.focus) detailLastFocus.focus();
}

el.detailClose.addEventListener('click', closeDetail);
el.detailModal.addEventListener('click', (e) => {
  if (e.target === el.detailModal) closeDetail();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !el.detailModal.classList.contains('hidden')) closeDetail();
});

function badge(statutLabel, couleur) {
  const s = document.createElement('span');
  s.className = 'badge';
  s.style.background = couleur;
  s.textContent = statutLabel;
  return s;
}

function esc(text) {
  const d = document.createElement('div');
  d.textContent = text;
  return d.innerHTML;
}

function show(view) {
  state.view = view;
  hideSuggestions();
  if (view !== 'results') el.search.value = '';
  document.body.classList.toggle('hero-compact', view !== 'home');
  el.home.classList.toggle('hidden', view !== 'home');
  el.results.classList.toggle('hidden', view === 'home' || view === 'catalogue');
  el.catalogue.classList.toggle('hidden', view !== 'catalogue');
  closeDetail();
  if (view === 'home') el.search.value = '';
}

function renderPrefSelect() {
  el.pref.textContent = '';
  for (const p of state.meta.preferences) {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.label;
    opt.title = p.description;
    if (p.id === state.pref) opt.selected = true;
    el.pref.appendChild(opt);
  }
}

function renderHome() {
  state.precedent = { type: 'home' };
  show('home');
  closeDetail();
  el.results.textContent = '';
  el.chips.textContent = '';
  el.homeGrid.textContent = '';
  for (const s of state.meta.secteurs) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'cat-card';
    const imgWrap = document.createElement('div');
    imgWrap.className = 'cat-img';
    const icone = document.createElement('img');
    icone.src = IMAGES[s.num] || '';
    icone.alt = '';
    icone.loading = 'lazy';
    imgWrap.appendChild(icone);
    const corps = document.createElement('div');
    corps.className = 'cat-body';
    const nom = document.createElement('strong');
    nom.textContent = s.nom;
    const count = document.createElement('small');
    count.textContent = `${s.nbGroupes} marque${s.nbGroupes > 1 ? 's' : ''} référencée${s.nbGroupes > 1 ? 's' : ''}`;
    corps.append(nom, count);
    card.append(imgWrap, corps);
    card.addEventListener('click', () => showSecteur(s.id));
    el.homeGrid.appendChild(card);
  }
}

function carteGroupe(g) {
  const carte = document.createElement('div');
  carte.className = 'carte';
  if (g.logo) {
    const img = document.createElement('img');
    img.className = 'carte-logo';
    img.src = g.logo;
    img.alt = '';
    img.loading = 'lazy';
    img.onerror = () => img.remove();
    carte.appendChild(img);
  }
  const corps = document.createElement('div');
  corps.className = 'carte-corps';
  const h = document.createElement('h3');
  h.textContent = g.groupe;
  const marques = document.createElement('p');
  marques.className = 'marques';
  marques.textContent = g.marques.join(', ');
  corps.append(h, marques);
  if (g.histoire) {
    const hist = document.createElement('p');
    hist.className = 'carte-histoire';
    hist.textContent = g.histoire.split(/(?<=[.!?])\s+/)[0];
    corps.appendChild(hist);
  }
  const meta = document.createElement('div');
  meta.className = 'meta-ligne';
  meta.appendChild(badge(g.statutLabel, g.statutCouleur));
  const siege = document.createElement('span');
  siege.textContent = `Siège : ${g.siege}`;
  meta.appendChild(siege);
  if (g.recommande) {
    const tag = document.createElement('span');
    tag.className = 'tag-recommande';
    tag.textContent = '✓ recommandé';
    meta.appendChild(tag);
  }
  corps.appendChild(meta);
  carte.appendChild(corps);
  carte.setAttribute('role', 'button');
  carte.tabIndex = 0;
  carte.addEventListener('click', () => showGroupe(g.id));
  carte.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      showGroupe(g.id);
    }
  });
  return carte;
}

async function showSecteur(id) {
  const s = await api(`/api/secteurs/${id}?pref=${state.pref}`);
  state.secteurId = id;
  state.precedent = { type: 'sector', id };
  show('sector');
  el.chips.textContent = '';
  el.results.textContent = '';

  const head = document.createElement('div');
  head.className = 'cat-header';
  const retour = document.createElement('button');
  retour.className = 'retour';
  retour.type = 'button';
  retour.textContent = '← Toutes les catégories';
  retour.addEventListener('click', renderHome);
  const titre = document.createElement('h2');
  titre.textContent = `${s.num} · ${s.nom}`;
  head.append(retour, titre);
  if (s.note) {
    const note = document.createElement('p');
    note.className = 'cat-note';
    note.textContent = s.note;
    head.appendChild(note);
  }
  el.results.appendChild(head);

  const cards = [];
  if (s.sous_categories.length > 0) {
    const sous = document.createElement('div');
    sous.className = 'sous-cats';
    const label = document.createElement('span');
    label.className = 'sous-cats-label';
    label.textContent = 'Sous-catégories :';
    sous.appendChild(label);
    const tous = document.createElement('button');
    tous.type = 'button';
    tous.className = 'chip chip-active';
    tous.textContent = 'Toutes';
    tous.addEventListener('click', () => filtrerSousCat(null, tous));
    sous.appendChild(tous);
    for (const sc of s.sous_categories) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      chip.textContent = sc;
      chip.addEventListener('click', () => filtrerSousCat(sc, chip));
      sous.appendChild(chip);
    }
    el.results.appendChild(sous);
  }

  const titreMarques = document.createElement('h3');
  titreMarques.className = 'cat-sous-titre';
  el.results.appendChild(titreMarques);

  const liste = document.createElement('div');
  liste.className = 'results';
  let masq = 0;
  for (const g of s.groupes) {
    const c = carteGroupe(g);
    c.dataset.sousCat = g.sous_categorie || '';
    c.dataset.recommande = g.recommande ? '1' : '0';
    if (state.pref !== 'all' && !g.recommande) {
      masq++;
      c.style.display = 'none';
      c.classList.add('carte-grisee');
    }
    cards.push(c);
    liste.appendChild(c);
  }
  el.results.appendChild(liste);

  function majTitre(sc) {
    let aff = 0;
    for (const c of cards) {
      if (c.style.display !== 'none' && (!sc || c.dataset.sousCat === sc)) aff++;
    }
    titreMarques.textContent = `Marques (${aff} affichée${aff > 1 ? 's' : ''}${masq > 0 ? `, ${masq} masquée${masq > 1 ? 's' : ''} par votre préférence` : ''})`;
    let vide = el.results.querySelector('.vide-filtre');
    if (aff === 0) {
      if (!vide) {
        vide = document.createElement('p');
        vide.className = 'vide vide-filtre';
        el.results.appendChild(vide);
      }
      vide.textContent = masq > 0
        ? `Aucune marque recommandée dans cette sélection avec votre préférence (${masq} masquée${masq > 1 ? 's' : ''} au total). Passez en « Tout afficher » pour les voir.`
        : 'Aucune marque dans cette catégorie.';
    } else if (vide) {
      vide.remove();
    }
  }

  function filtrerSousCat(sc, chip) {
    for (const c of cards) {
      const match = !sc || c.dataset.sousCat === sc;
      const show = match && (sc || c.dataset.recommande === '1' || state.pref === 'all');
      c.style.display = show ? '' : 'none';
      c.classList.toggle('carte-grisee', show && c.dataset.recommande !== '1');
    }
    for (const b of el.results.querySelectorAll('.sous-cats .chip')) b.classList.remove('chip-active');
    if (chip) chip.classList.add('chip-active');
    majTitre(sc);
  }
  filtrerSousCat(null, el.results.querySelector('.sous-cats .chip'));
  window.scrollTo({ top: 0 });
}

function renderResults(data, q) {
  el.chips.textContent = '';
  el.results.textContent = '';
  state.precedent = { type: 'search', q };
  show('results');
  for (const s of data.secteurs) {
    const chip = document.createElement('button');
    chip.className = 'chip';
    chip.type = 'button';
    chip.textContent = `${s.num} · ${s.nom} (${s.nbGroupes})`;
    chip.addEventListener('click', () => showSecteur(s.id));
    el.chips.appendChild(chip);
  }
  const titre = document.createElement('h2');
  titre.className = 'home-titre';
  titre.textContent = `Résultats pour « ${q} »`;
  el.results.appendChild(titre);
  if (data.groupes.length > 0) {
    const tg = document.createElement('h3');
    tg.className = 'cat-sous-titre';
    tg.textContent = `Marques (${data.groupes.length})`;
    el.results.appendChild(tg);
  }
  if (data.groupes.length === 0) {
    const p = document.createElement('p');
    p.className = 'vide';
    if (data.masquees > 0) {
      p.textContent = `${data.masquees} marque${data.masquees > 1 ? 's' : ''} correspond${data.masquees > 1 ? 'ent' : ''} mais ${data.masquees > 1 ? 'sont' : 'est'} hors de votre préférence.`;
      el.results.appendChild(p);
      const voir = document.createElement('button');
      voir.type = 'button';
      voir.className = 'chip chip-active';
      voir.textContent = 'Les afficher (Tout afficher)';
      voir.addEventListener('click', () => {
        state.pref = 'all';
        try { localStorage.setItem('ce-pref', 'all'); } catch {}
        renderPrefSelect();
        runSearch(true);
      });
      el.results.appendChild(voir);
    } else {
      p.textContent = `Aucun résultat pour « ${q} ».`;
      el.results.appendChild(p);
    }
  }

  for (const g of data.groupes) el.results.appendChild(carteGroupe(g));
  if (data.masquees > 0) {
    const p = document.createElement('p');
    p.className = 'vide';
    p.textContent = `${data.masquees} ligne(s) hors de votre périmètre masquée(s) — choisissez « Tout afficher » pour les voir.`;
    el.results.appendChild(p);
  }
}

function ligneDtDd(dl, dtText, ddNode) {
  const dt = document.createElement('dt');
  dt.textContent = dtText;
  const dd = document.createElement('dd');
  if (typeof ddNode === 'string') dd.textContent = ddNode;
  else dd.appendChild(ddNode);
  dl.append(dt, dd);
}

function listeSources(container, sourcesResolues) {
  if (!sourcesResolues || sourcesResolues.length === 0) return;
  const h = document.createElement('h3');
  h.textContent = 'Sources';
  container.appendChild(h);
  const ul = document.createElement('ul');
  ul.className = 'sources';
  for (const s of sourcesResolues) {
    const li = document.createElement('li');
    const num = document.createElement('span');
    num.className = 'num';
    num.textContent = `[${s.num}] `;
    li.appendChild(num);
    li.appendChild(document.createTextNode(s.texte ?? 'voir document source (section Sources du PDF v4)'));
    ul.appendChild(li);
  }
  container.appendChild(ul);
}

async function showGroupe(id) {
  const g = await api(`/api/groupes/${id}?pref=${state.pref}`);
  openDetail();
  el.detail.innerHTML = '';

  const retour = document.createElement('button');
  retour.className = 'retour';
  retour.type = 'button';
  retour.textContent = '← Fermer la fiche';
  retour.addEventListener('click', () => {
    closeDetail();
  });
  el.detail.appendChild(retour);

  const head = document.createElement('div');
  head.className = 'fiche-head';
  if (g.logo) {
    const img = document.createElement('img');
    img.className = 'fiche-logo';
    img.src = g.logo;
    img.alt = `Logo ${g.groupe}`;
    img.loading = 'lazy';
    img.onerror = () => img.remove();
    head.appendChild(img);
  }
  const h = document.createElement('h2');
  h.textContent = g.groupe;
  head.appendChild(h);
  el.detail.appendChild(head);

  const badges = document.createElement('div');
  badges.style.display = 'flex';
  badges.style.gap = '8px';
  badges.style.alignItems = 'center';
  badges.appendChild(badge(g.statutLabel, g.statutCouleur));
  if (g.recommande) {
    const tag = document.createElement('span');
    tag.className = 'tag-recommande';
    tag.textContent = '✓ recommandé avec votre préférence';
    badges.appendChild(tag);
  }
  el.detail.appendChild(badges);

  const histoire = g.histoire || (g.commentaire || '').split(/(?<=[.!?])\s+/).slice(0, 2).join(' ');
  if (histoire) {
    const hh = document.createElement('h3');
    hh.textContent = 'Histoire & positionnement';
    const p = document.createElement('p');
    p.className = 'fiche-histoire';
    p.textContent = histoire;
    el.detail.append(hh, p);
  }

  if (g.site) {
    const a = document.createElement('a');
    a.className = 'lien-externe';
    a.href = g.site;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = `Site officiel ↗ (${g.site.replace(/^https?:\/\/(www\.)?/, '')})`;
    el.detail.appendChild(a);
  }

  const dl = document.createElement('dl');
  ligneDtDd(dl, 'Secteur', `${g.secteur.num} · ${g.secteur.nom}`);
  ligneDtDd(dl, 'Siège', g.siege);
  ligneDtDd(dl, 'Marques', g.marques.join(', '));
  el.detail.appendChild(dl);

  if (g.openfoodfacts) {
    const a = document.createElement('a');
    a.className = 'lien-externe';
    a.href = g.openfoodfacts;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = 'Voir la marque sur Open Food Facts ↗';
    el.detail.appendChild(a);
  }

  if (g.commentaire) {
    const h = document.createElement('h3');
    h.textContent = 'Détention, contrôle et commentaires';
    const p = document.createElement('p');
    p.style.fontSize = '0.9rem';
    p.textContent = g.commentaire;
    el.detail.append(h, p);
  }

  if (g.lieux_production.length > 0) {
    const h = document.createElement('h3');
    h.textContent = 'Lieux de production connus';
    const ul = document.createElement('ul');
    for (const l of g.lieux_production) {
      const li = document.createElement('li');
      li.textContent = l;
      ul.appendChild(li);
    }
    el.detail.append(h, ul);
  }

  if (g.certifications.length > 0) {
    const h = document.createElement('h3');
    h.textContent = 'Certifications';
    const ul = document.createElement('ul');
    for (const c of g.certifications) {
      const li = document.createElement('li');
      li.textContent = c;
      ul.appendChild(li);
    }
    el.detail.append(h, ul);
  }

  listeSources(el.detail, g.sourcesResolues);
  el.detailModal.querySelector('.detail-card').scrollTop = 0;
}

async function showProduit(id) {
  const data = await api(`/api/produits/${id}?pref=${state.pref}`);
  const p = data.produit;
  const g = data.groupe;
  openDetail();
  el.detail.innerHTML = '';

  const retour = document.createElement('button');
  retour.className = 'retour';
  retour.type = 'button';
  retour.textContent = '← Retour';
  retour.addEventListener('click', () => {
    const prec = state.precedent;
    closeDetail();
    if (!prec || prec.type === 'home') renderHome();
    else if (prec.type === 'sector') showSecteur(prec.id);
    else {
      el.search.value = prec.q;
      runSearch();
    }
  });
  el.detail.appendChild(retour);

  const h = document.createElement('h2');
  h.textContent = p.nom;
  el.detail.appendChild(h);
  const badges = document.createElement('div');
  badges.style.display = 'flex';
  badges.style.gap = '8px';
  badges.appendChild(badge(g.statutLabel, g.statutCouleur));
  el.detail.appendChild(badges);

  const dl = document.createElement('dl');
  ligneDtDd(dl, 'Groupe / marque', `${g.groupe} (${g.marques.join(', ')})`);
  ligneDtDd(dl, 'Secteur', `${data.secteur.num} · ${data.secteur.nom}`);
  ligneDtDd(dl, 'Assemblage', p.assemblage ?? 'À vérifier sur la fiche produit / étiquette');
  ligneDtDd(dl, 'Origine des pièces', p.origine_pieces ?? 'Non précisée dans la grille');
  el.detail.appendChild(dl);

  if (p.openfoodfacts) {
    const a = document.createElement('a');
    a.className = 'lien-externe';
    a.href = p.openfoodfacts;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = 'Voir le produit sur Open Food Facts ↗';
    el.detail.appendChild(a);

    const hOff = document.createElement('h3');
    hOff.textContent = 'Données Open Food Facts';
    el.detail.appendChild(hOff);
    const box = document.createElement('div');
    box.className = 'off-box';
    box.textContent = 'Chargement des données Open Food Facts…';
    el.detail.appendChild(box);
    fetch(`/api/produits/${p.id}/off`)
      .then((r) => r.json())
      .then((off) => {
        box.textContent = '';
        if (!off || !off.disponible) {
          box.textContent = 'Données Open Food Facts indisponibles pour ce produit.';
          return;
        }
        if (off.image) {
          const img = document.createElement('img');
          img.className = 'off-img';
          img.src = off.image;
          img.alt = off.nom || p.nom;
          box.appendChild(img);
        }
        const scores = document.createElement('div');
        scores.className = 'off-scores';
        const mk = (label, grade) => {
          if (!grade) return;
          const b = document.createElement('span');
          b.className = `off-score off-${String(grade).toLowerCase()}`;
          b.textContent = `${label} ${String(grade).toUpperCase()}`;
          scores.appendChild(b);
        };
        mk('Nutri-Score', off.nutriscore);
        mk('Green-Score', off.green);
        if (off.nova) {
          const b = document.createElement('span');
          b.className = 'off-score off-nova';
          b.textContent = `NOVA ${off.nova}`;
          scores.appendChild(b);
        }
        if (scores.childNodes.length) box.appendChild(scores);
        const dlOff = document.createElement('dl');
        if (off.marques) ligneDtDd(dlOff, 'Marques (OFF)', off.marques);
        if (off.quantite) ligneDtDd(dlOff, 'Quantité', off.quantite);
        if (off.origines) ligneDtDd(dlOff, 'Origine des ingrédients', off.origines);
        if (off.fabrication) ligneDtDd(dlOff, 'Lieu de fabrication', off.fabrication);
        if (off.emballage) ligneDtDd(dlOff, 'Emballage', off.emballage);
        if (off.pays) ligneDtDd(dlOff, 'Pays de vente', off.pays);
        if (off.allergenes && off.allergenes.length) ligneDtDd(dlOff, 'Allergènes', off.allergenes.join(', '));
        if (off.labels && off.labels.length) ligneDtDd(dlOff, 'Labels (OFF)', off.labels.map((l) => l.replace(/^en:/, '')).join(', '));
        if (dlOff.childNodes.length) box.appendChild(dlOff);
        if (off.ingredients) {
          const hi = document.createElement('h4');
          hi.textContent = 'Ingrédients';
          const pi = document.createElement('p');
          pi.className = 'off-ingredients';
          pi.textContent = off.ingredients;
          box.append(hi, pi);
        }
      })
      .catch(() => {
        box.textContent = 'Données Open Food Facts indisponibles pour le moment.';
      });
  }

  if (p.certifications.length > 0) {
    const h = document.createElement('h3');
    h.textContent = 'Certifications';
    const ul = document.createElement('ul');
    for (const c of p.certifications) {
      const li = document.createElement('li');
      li.textContent = c;
      ul.appendChild(li);
    }
    el.detail.append(h, ul);
  }

  if (p.note) {
    const h = document.createElement('h3');
    h.textContent = 'Note';
    const par = document.createElement('p');
    par.style.fontSize = '0.9rem';
    par.textContent = p.note;
    el.detail.append(h, par);
  }

  listeSources(el.detail, data.sourcesResolues);
  el.detailModal.querySelector('.detail-card').scrollTop = 0;
}

let searchTimer;
el.search.addEventListener('input', () => {
  renderLocalKeywords();
  clearTimeout(searchTimer);
  searchTimer = setTimeout(runSearch, 250);
});

const normLocal = (t) =>
  (t || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

function renderLocalKeywords() {
  const q = normLocal(el.search.value.trim());
  if (q.length < 2 || state.vocab.length === 0) {
    return;
  }
  let mots = state.vocab
    .filter((m) => m.includes(q))
    .sort((a, b) => (a.startsWith(q) ? 0 : 1) - (b.startsWith(q) ? 0 : 1) || a.length - b.length)
    .slice(0, 3);
  if (mots.length === 0 && q.length >= 3) {
    const dist = (a, b) => {
      const m = a.length, n = b.length;
      const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
      for (let j = 1; j <= n; j++) d[0][j] = j;
      for (let i = 1; i <= m; i++)
        for (let j = 1; j <= n; j++)
          d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      return d[m][n];
    };
    const maxD = Math.max(2, Math.floor(q.length / 2));
    mots = state.vocab
      .map((m) => ({ m, d: dist(q, m) }))
      .filter((x) => x.d <= maxD)
      .sort((a, b) => a.d - b.d || a.m.length - b.m.length)
      .slice(0, 3)
      .map((x) => x.m);
  }
  if (mots.length === 0) return;
  let kwWrap = el.suggestions.querySelector('.sug-kws');
  if (!kwWrap) {
    kwWrap = document.createElement('div');
    kwWrap.className = 'sug-kws';
    el.suggestions.prepend(kwWrap);
  }
  kwWrap.textContent = '';
  const lab = document.createElement('span');
  lab.className = 'sug-kws-label';
  lab.textContent = 'Mots-clés';
  kwWrap.appendChild(lab);
  for (const m of mots) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'sug-kw';
    b.textContent = m;
    b.addEventListener('click', () => {
      el.search.value = m;
      hideSuggestions();
      runSearch();
    });
    kwWrap.appendChild(b);
  }
  el.suggestions.classList.remove('hidden');
}

el.search.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    clearTimeout(searchTimer);
    hideSuggestions();
    runSearch(true);
  }
});

el.search.addEventListener('focus', () => {
  if (el.search.value.trim().length >= 2) runSearch();
});
el.search.addEventListener('blur', () => setTimeout(hideSuggestions, 150));

const searchClientCache = new Map();
let searchSeq = 0;
async function runSearch(fromEnter) {
  const q = el.search.value.trim();
  if (!q) {
    hideSuggestions();
    renderHome();
    return;
  }
  const seq = ++searchSeq;
  const key = `${state.pref}|${q}`;
  let data = searchClientCache.get(key);
  if (!data) {
    data = await api(`/api/search?q=${encodeURIComponent(q)}&pref=${state.pref}`);
    if (seq !== searchSeq) return;
    if (searchClientCache.size > 100) searchClientCache.clear();
    searchClientCache.set(key, data);
  }
  if (seq !== searchSeq) return;
  if (!fromEnter) renderSuggestions(data, q);
  renderResults(data, q);
}
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') hideSuggestions();
});

function hideSuggestions() {
  el.suggestions.classList.add('hidden');
  el.suggestions.textContent = '';
}

function renderSuggestions(data, q) {
  if (q.length < 2) {
    hideSuggestions();
    return;
  }
  el.suggestions.textContent = '';
  const MAX_SUG = 5;
  const mots = (data.mots || []).slice(0, 3);
  if (mots.length > 0) {
    const kwWrap = document.createElement('div');
    kwWrap.className = 'sug-kws';
    const lab = document.createElement('span');
    lab.className = 'sug-kws-label';
    lab.textContent = 'Mots-clés';
    kwWrap.appendChild(lab);
    for (const m of mots) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'sug-kw';
      b.textContent = m;
      b.addEventListener('click', () => {
        el.search.value = m;
        hideSuggestions();
        runSearch();
      });
      kwWrap.appendChild(b);
    }
    el.suggestions.appendChild(kwWrap);
  }
  const items = [];
  for (const g of (data.groupes || []).slice(0, 5)) {
    items.push({ kind: 'marque', label: g.groupe, sub: g.marques.slice(0, 3).join(', '), run: () => showGroupe(g.id) });
  }
  for (const sc of (data.secteurs || []).slice(0, 3)) {
    items.push({ kind: 'secteur', label: `${sc.num} · ${sc.nom}`, sub: `${sc.nbGroupes} marques`, run: () => showSecteur(sc.id) });
  }
  const itemsAffiches = items.slice(0, Math.max(0, MAX_SUG - mots.length));
  if (itemsAffiches.length === 0 && mots.length === 0) {
    hideSuggestions();
    return;
  }
  for (const it of itemsAffiches) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'sug-item';
    const tag = document.createElement('span');
    tag.className = 'sug-kind';
    tag.textContent = it.kind === 'produit' ? 'Produit' : it.kind === 'marque' ? 'Marque' : 'Catégorie';
    const label = document.createElement('span');
    label.className = 'sug-label';
    label.textContent = it.label;
    const sub = document.createElement('span');
    sub.className = 'sug-sub';
    sub.textContent = it.sub;
    b.append(tag, label, sub);
    b.addEventListener('click', () => {
      hideSuggestions();
      it.run();
    });
    el.suggestions.appendChild(b);
  }
  const all = document.createElement('button');
  all.type = 'button';
  all.className = 'sug-item sug-all';
  all.textContent = `Voir tous les résultats pour « ${q} »`;
  all.addEventListener('click', () => {
    hideSuggestions();
    runSearch();
  });
  el.suggestions.appendChild(all);
  el.suggestions.classList.remove('hidden');
}

el.pref.addEventListener('change', () => {
  state.pref = el.pref.value;
  try { localStorage.setItem('ce-pref', state.pref); } catch {}
  if (state.view === 'sector' && state.secteurId) showSecteur(state.secteurId);
  else if (state.view === 'catalogue') showCatalogue(true);
  else runSearch();
});


el.logoHome.addEventListener('click', () => renderHome());

el.btnCatalogue.addEventListener('click', () => showCatalogue(true));
el.catalogueRetour.addEventListener('click', () => renderHome());

function renderFiltresCatalogue() {
  el.catFiltresStatuts.textContent = '';
  const statuts = [{ id: '', label: 'Tous statuts' }, ...state.meta.statuts.filter((st) => st.id !== 'propose')];
  for (const st of statuts) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip' + (state.catalogueFiltres.statut === st.id ? ' chip-active' : '');
    b.textContent = st.label;
    b.addEventListener('click', () => {
      state.catalogueFiltres.statut = st.id;
      state.catalogueFiltres.page = 0;
      showCatalogue();
    });
    el.catFiltresStatuts.appendChild(b);
  }
  el.catFiltresSecteurs.textContent = '';
  const tous = document.createElement('button');
  tous.type = 'button';
  tous.className = 'chip' + (state.catalogueFiltres.secteur === '' ? ' chip-active' : '');
  tous.textContent = 'Tous secteurs';
  tous.addEventListener('click', () => {
    state.catalogueFiltres.secteur = '';
    state.catalogueFiltres.page = 0;
    showCatalogue();
  });
  el.catFiltresSecteurs.appendChild(tous);
  for (const s of state.meta.secteurs) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip' + (state.catalogueFiltres.secteur === s.id ? ' chip-active' : '');
    b.textContent = `${s.num} · ${s.nom}`;
    b.addEventListener('click', () => {
      state.catalogueFiltres.secteur = s.id;
      state.catalogueFiltres.page = 0;
      showCatalogue();
    });
    el.catFiltresSecteurs.appendChild(b);
  }
}

async function showCatalogue(reset) {
  if (reset) {
    state.catalogueFiltres = { secteur: '', statut: '', page: 0 };
  }
  state.precedent = { type: 'home' };
  show('catalogue');
  renderFiltresCatalogue();
  const f = state.catalogueFiltres;
  const data = await api(`/api/catalogue?pref=${state.pref}&secteur=${f.secteur}&statut=${f.statut}&page=${f.page}`);
  if (f.page === 0) el.catalogueResults.textContent = '';
  el.catalogueCount.textContent = `${data.total} marque${data.total > 1 ? 's' : ''} référencée${data.total > 1 ? 's' : ''}`;
  for (const g of data.groupes) el.catalogueResults.appendChild(carteGroupe(g));
  const hasMore = (f.page + 1) * data.pageSize < data.total;
  el.cataloguePlus.hidden = !hasMore;
  el.cataloguePlus.textContent = `Charger plus (${el.catalogueResults.childElementCount}/${data.total})`;
  window.scrollTo({ top: 0 });
}

el.cataloguePlus.addEventListener('click', () => {
  state.catalogueFiltres.page++;
  showCatalogue(false);
});



function ouvrirAjout(q) {
  el.addQ.value = q;
  el.addMsg.hidden = true;
  el.addModal.classList.remove('hidden');
}

el.addClose.addEventListener('click', () => el.addModal.classList.add('hidden'));
el.addModal.addEventListener('click', (e) => {
  if (e.target === el.addModal) el.addModal.classList.add('hidden');
});

el.addForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  el.addMsg.hidden = true;
  const res = await fetch('/api/produits', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      q: el.addQ.value.trim(),
      num: el.addSecteur.value,
      marque: el.addMarque.value.trim(),
      note: el.addNote.value.trim(),
    }),
  });
  const data = await res.json().catch(() => ({}));
  el.addMsg.textContent = res.ok
    ? `« ${el.addQ.value.trim()} » proposé (statut « Proposé », à vérifier). Il apparaît avec « Tout afficher ».`
    : data.error || 'Erreur.';
  el.addMsg.className = 'pw-msg ' + (res.ok ? 'ok' : 'ko');
  el.addMsg.hidden = false;
  if (res.ok) {
    setTimeout(() => {
      el.addModal.classList.add('hidden');
      el.addForm.reset();
      runSearch();
    }, 900);
  }
});

async function init() {
  state.meta = await api('/api/meta');
  if (!state.meta.preferences.some((p) => p.id === state.pref)) state.pref = 'ue';
  renderPrefSelect();
  el.addSecteur.textContent = '';
  for (const s of state.meta.secteurs) {
    const opt = document.createElement('option');
    opt.value = s.num;
    opt.textContent = `${s.num} · ${s.nom}`;
    el.addSecteur.appendChild(opt);
  }
  el.heroStats.textContent = `${state.meta.secteurs.length} catégories · ${state.meta.nbGroupes} marques référencées · ${state.meta.nbSources} sources`;
  try {
    const mc = await api('/api/mots-cles?all=1');
    state.vocab = mc.mots || [];
  } catch {}
  renderHome();
}

init();
