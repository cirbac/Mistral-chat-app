const state = {
  accueil: null,
  accueilPref: null,
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
  chips: document.getElementById('secteur-chips'),
  home: document.getElementById('home'),
  homeGrid: document.getElementById('home-grid'),
  pharesWrap: document.getElementById('phares-wrap'),
  pharesPrev: document.getElementById('phares-prev'),
  pharesNext: document.getElementById('phares-next'),
  pharesTitre: document.getElementById('phares-titre'),
  pharesGrid: document.getElementById('phares-grid'),
  nouveauxTitre: document.getElementById('nouveaux-titre'),
  nouveauxGrid: document.getElementById('nouveaux-grid'),
  heroStats: document.getElementById('hero-stats'),
  results: document.getElementById('results'),
  detail: document.getElementById('detail'),
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

async function api(path) {
  const res = await fetch(path);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Erreur ${res.status}`);
  }
  return res.json();
}

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
  el.home.classList.toggle('hidden', view !== 'home');
  el.results.classList.toggle('hidden', view === 'home');
  el.detail.classList.add('hidden');
  el.contenu.classList.remove('avec-detail');
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

function imageProduit(r) {
  return r.produit.image || IMAGES[r.secteur.num] || '';
}

function carteProduit(r) {
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'carte carte-produit';
  const img = document.createElement('img');
  img.className = 'prod-img';
  img.loading = 'lazy';
  img.alt = '';
  img.src = imageProduit(r);
  img.onerror = () => {
    if (IMAGES[r.secteur.num] && img.src !== IMAGES[r.secteur.num]) img.src = IMAGES[r.secteur.num];
    else img.remove();
  };
  card.appendChild(img);
  const h = document.createElement('h3');
  h.textContent = r.produit.nom;
  const meta = document.createElement('div');
  meta.className = 'meta-ligne';
  meta.appendChild(badge(r.groupe.statutLabel, r.groupe.statutCouleur));
  const marque = document.createElement('span');
  marque.textContent = `${r.groupe.groupe} · ${r.secteur.nom}`;
  meta.appendChild(marque);
  if (r.produit.assemblage) {
    const ass = document.createElement('span');
    ass.textContent = `Assemblage : ${r.produit.assemblage}`;
    meta.appendChild(ass);
  }
  card.append(h, meta);
  card.addEventListener('click', () => showProduit(r.produit.id));
  return card;
}

async function renderAccueil() {
  if (state.accueilPref !== state.pref) {
    state.accueil = await api(`/api/accueil?pref=${state.pref}`);
    state.accueilPref = state.pref;
  }
  const a = state.accueil;
  if (!a) return;
  el.pharesGrid.textContent = '';
  for (const r of a.phares) el.pharesGrid.appendChild(carteProduit(r));
  el.pharesTitre.hidden = a.phares.length === 0;
  el.pharesWrap.hidden = a.phares.length === 0;
  el.nouveauxGrid.textContent = '';
  for (const r of a.nouveaux) el.nouveauxGrid.appendChild(carteProduit(r));
  el.nouveauxTitre.hidden = a.nouveaux.length === 0;
  el.nouveauxGrid.hidden = a.nouveaux.length === 0;
}

function renderHome() {
  state.precedent = { type: 'home' };
  show('home');
  el.detail.classList.add('hidden');
  el.contenu.classList.remove('avec-detail');
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
  renderAccueil();
}

function carteGroupe(g) {
  const carte = document.createElement('div');
  carte.className = 'carte';
  const h = document.createElement('h3');
  h.textContent = g.groupe;
  const marques = document.createElement('p');
  marques.className = 'marques';
  marques.textContent = g.marques.join(', ');
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
  carte.append(h, marques, meta);
  carte.addEventListener('click', () => showGroupe(g.id));
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
  for (const g of s.groupes) {
    const c = carteGroupe(g);
    c.dataset.sousCat = g.sous_categorie || '';
    c.dataset.recommande = g.recommande ? '1' : '0';
    cards.push(c);
    liste.appendChild(c);
  }
  el.results.appendChild(liste);

  function majTitre(sc) {
    let aff = 0;
    let masq = 0;
    for (const c of cards) {
      const match = !sc || c.dataset.sousCat === sc;
      if (!match) continue;
      if (c.dataset.recommande === '1') aff++;
      else masq++;
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
        ? `Aucune marque recommandée dans cette sélection avec votre préférence (${masq} affichée${masq > 1 ? 's' : ''} en grisée ci-dessous).`
        : 'Aucune marque dans cette catégorie.';
    } else if (vide) {
      vide.remove();
    }
  }

  function filtrerSousCat(sc, chip) {
    for (const c of cards) {
      const match = !sc || c.dataset.sousCat === sc;
      c.style.display = match ? '' : 'none';
      c.classList.toggle('carte-grisee', match && c.dataset.recommande !== '1');
    }
    for (const b of el.results.querySelectorAll('.sous-cats .chip')) b.classList.remove('chip-active');
    if (chip) chip.classList.add('chip-active');
    majTitre(sc);
  }
  filtrerSousCat(null, el.results.querySelector('.sous-cats .chip'));
  window.scrollTo({ top: 0 });
}

async function doSearch() {
  const q = el.search.value.trim();
  el.chips.textContent = '';
  el.results.textContent = '';
  if (!q) {
    renderHome();
    return;
  }
  const data = await api(`/api/search?q=${encodeURIComponent(q)}&pref=${state.pref}`);
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
  if (data.produits && data.produits.length > 0) {
    const tp = document.createElement('h3');
    tp.className = 'cat-sous-titre';
    tp.textContent = `Produits (${data.produits.length})`;
    el.results.appendChild(tp);
    const PAGE = 50;
    let shown = 0;
    const plusBtn = document.createElement('button');
    plusBtn.type = 'button';
    plusBtn.className = 'chip';
    const renderLot = () => {
      for (const r of data.produits.slice(shown, shown + PAGE)) {
        const card = document.createElement('div');
        card.className = 'carte';
        const h = document.createElement('h3');
        h.textContent = r.produit.nom;
        const meta = document.createElement('div');
        meta.className = 'meta-ligne';
        meta.appendChild(badge(r.groupe.statutLabel, r.groupe.statutCouleur));
        const marque = document.createElement('span');
        marque.textContent = `${r.groupe.groupe} · ${r.secteur.nom}`;
        meta.appendChild(marque);
        if (r.produit.assemblage) {
          const ass = document.createElement('span');
          ass.textContent = `Assemblage : ${r.produit.assemblage}`;
          meta.appendChild(ass);
        }
        card.append(h, meta);
        card.addEventListener('click', () => showProduit(r.produit.id));
        el.results.insertBefore(card, plusBtn);
      }
      shown += PAGE;
      if (shown >= data.produits.length) plusBtn.remove();
      else plusBtn.textContent = `Afficher ${Math.min(PAGE, data.produits.length - shown)} produits de plus (${shown}/${data.produits.length})`;
    };
    plusBtn.addEventListener('click', renderLot);
    el.results.appendChild(plusBtn);
    renderLot();
  }
  if (data.groupes.length > 0) {
    const tg = document.createElement('h3');
    tg.className = 'cat-sous-titre';
    tg.textContent = `Marques (${data.groupes.length})`;
    el.results.appendChild(tg);
  }
  if (data.groupes.length === 0) {
    const p = document.createElement('p');
    p.className = 'vide';
    p.textContent = `Aucun résultat pour « ${q} ».`;
    el.results.appendChild(p);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip chip-active';
    btn.id = 'btn-ajouter';
    btn.textContent = `＋ Proposer l'ajout de « ${q} »`;
    btn.addEventListener('click', () => ouvrirAjout(q));
    el.results.appendChild(btn);
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
  el.detail.classList.remove('hidden');
  el.contenu.classList.add('avec-detail');
  el.detail.innerHTML = '';

  const retour = document.createElement('button');
  retour.className = 'retour';
  retour.type = 'button';
  retour.textContent = '← Fermer la fiche';
  retour.addEventListener('click', () => {
    el.detail.classList.add('hidden');
    el.contenu.classList.remove('avec-detail');
  });
  el.detail.appendChild(retour);

  const h = document.createElement('h2');
  h.textContent = g.groupe;
  el.detail.appendChild(h);

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

  if (g.produits.length > 0) {
    const h = document.createElement('h3');
    h.textContent = 'Produits / modèles mentionnés';
    el.detail.appendChild(h);
    for (const p of g.produits) {
      const btn = document.createElement('button');
      btn.className = 'produit';
      btn.type = 'button';
      btn.innerHTML = `${esc(p.nom)} — <small>${esc(p.assemblage ?? 'assemblage à vérifier')}</small>`;
      btn.addEventListener('click', () => showProduit(p.id));
      el.detail.appendChild(btn);
    }
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
  el.detail.scrollIntoView({ behavior: 'smooth' });
}

async function showProduit(id) {
  const data = await api(`/api/produits/${id}?pref=${state.pref}`);
  const p = data.produit;
  const g = data.groupe;
  el.detail.classList.remove('hidden');
  el.contenu.classList.add('avec-detail');
  el.detail.innerHTML = '';

  const retour = document.createElement('button');
  retour.className = 'retour';
  retour.type = 'button';
  retour.textContent = '← Retour';
  retour.addEventListener('click', () => {
    const prec = state.precedent;
    el.detail.classList.add('hidden');
    el.contenu.classList.remove('avec-detail');
    if (!prec || prec.type === 'home') renderHome();
    else if (prec.type === 'sector') showSecteur(prec.id);
    else {
      el.search.value = prec.q;
      doSearch();
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
  el.detail.scrollIntoView({ behavior: 'smooth' });
}

let debounce;
el.search.addEventListener('input', () => {
  clearTimeout(debounce);
  debounce = setTimeout(doSearch, 250);
});

el.pref.addEventListener('change', () => {
  state.pref = el.pref.value;
  try { localStorage.setItem('ce-pref', state.pref); } catch {}
  state.accueilPref = null;
  if (state.view === 'sector' && state.secteurId) showSecteur(state.secteurId);
  else doSearch();
});


el.logoHome.addEventListener('click', () => renderHome());

el.pharesPrev.addEventListener('click', () => el.pharesGrid.scrollBy({ left: -520, behavior: 'smooth' }));
el.pharesNext.addEventListener('click', () => el.pharesGrid.scrollBy({ left: 520, behavior: 'smooth' }));

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
      doSearch();
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
  el.heroStats.textContent = `${state.meta.secteurs.length} catégories · ${state.meta.nbGroupes} marques référencées · ${state.meta.nbProduits} produits · ${state.meta.nbSources} sources`;
  renderHome();
}

init();
