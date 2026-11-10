const state = { meta: null, pref: 'ue', statuts: {} };

const el = {
  pref: document.getElementById('pref'),
  user: document.getElementById('user'),
  logout: document.getElementById('logout'),
  legende: document.getElementById('legende'),
  search: document.getElementById('search'),
  chips: document.getElementById('secteur-chips'),
  results: document.getElementById('results'),
  detail: document.getElementById('detail'),
  footer: document.getElementById('footer'),
  metaSource: document.getElementById('meta-source'),
};

async function api(path) {
  const res = await fetch(path);
  if (res.status === 401) {
    window.location.href = '/login.html';
    throw new Error('Non authentifié');
  }
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

function renderLegend() {
  el.legende.textContent = '';
  for (const st of state.meta.statuts) {
    const b = badge(st.label, st.couleur);
    b.title = st.description;
    el.legende.appendChild(b);
  }
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
  if (g.secteurNom) {
    const sec = document.createElement('span');
    sec.textContent = `Secteur : ${g.secteurNom}`;
    meta.appendChild(sec);
  }
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

async function doSearch() {
  const q = el.search.value.trim();
  el.chips.textContent = '';
  el.results.textContent = '';
  if (!q) return;
  const data = await api(`/api/search?q=${encodeURIComponent(q)}&pref=${state.pref}`);
  for (const s of data.secteurs) {
    const chip = document.createElement('button');
    chip.className = 'chip';
    chip.type = 'button';
    chip.textContent = `${s.num} · ${s.nom} (${s.nbGroupes})`;
    chip.addEventListener('click', () => showSecteur(s.id));
    el.chips.appendChild(chip);
  }
  if (data.groupes.length === 0) {
    const p = document.createElement('p');
    p.className = 'vide';
    p.textContent = `Aucun groupe recommandé pour « ${q} » avec cette préférence.`;
    el.results.appendChild(p);
  }
  for (const g of data.groupes) el.results.appendChild(carteGroupe(g));
  if (data.masquees > 0) {
    const p = document.createElement('p');
    p.className = 'vide';
    p.textContent = `${data.masquees} ligne(s) hors de votre périmètre masquée(s) — choisissez « Tout afficher » pour les voir.`;
    el.results.appendChild(p);
  }
}

async function showSecteur(id) {
  const s = await api(`/api/secteurs/${id}?pref=${state.pref}`);
  el.detail.classList.remove('hidden');
  el.detail.innerHTML = '';
  const h = document.createElement('h2');
  h.textContent = `${s.num} · ${s.nom}`;
  el.detail.appendChild(h);
  if (s.note) {
    const p = document.createElement('p');
    p.textContent = s.note;
    p.style.fontSize = '0.85rem';
    el.detail.appendChild(p);
  }
  if (s.groupes.length === 0) {
    const p = document.createElement('p');
    p.className = 'vide';
    p.textContent = 'Aucune ligne importée pour ce secteur pour le moment (voir README pour compléter les données).';
    el.detail.appendChild(p);
  }
  for (const g of s.groupes) {
    const card = carteGroupe(g);
    el.detail.appendChild(card);
  }
  if (s.masquees > 0) {
    const p = document.createElement('p');
    p.className = 'vide';
    p.textContent = `${s.masquees} ligne(s) masquée(s) par votre préférence.`;
    el.detail.appendChild(p);
  }
  el.detail.scrollIntoView({ behavior: 'smooth' });
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
  el.detail.innerHTML = '';

  const retour = document.createElement('button');
  retour.className = 'retour';
  retour.type = 'button';
  retour.textContent = '← Fermer la fiche';
  retour.addEventListener('click', () => el.detail.classList.add('hidden'));
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

  if (g.commentaire) {
    const h = document.createElement('h3');
    h.textContent = 'Détention, contrôle et commentaires';
    const p = document.createElement('p');
    p.style.fontSize = '0.9rem';
    p.textContent = g.commentaire.replace(/\[(\d+)\]/g, '[$1]');
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
  el.detail.innerHTML = '';

  const retour = document.createElement('button');
  retour.className = 'retour';
  retour.type = 'button';
  retour.textContent = '← Retour à la fiche groupe';
  retour.addEventListener('click', () => showGroupe(g.id));
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
  doSearch();
});

el.logout.addEventListener('click', async () => {
  await fetch('/api/logout', { method: 'POST' });
  window.location.href = '/login.html';
});

async function init() {
  try {
    const me = await api('/api/me');
    el.user.textContent = me.email;
  } catch {
    return;
  }
  state.meta = await api('/api/meta');
  state.statuts = Object.fromEntries(state.meta.statuts.map((s) => [s.id, s]));
  el.metaSource.textContent = `Source : ${state.meta.meta.source_document} — version ${state.meta.meta.version} du ${state.meta.meta.date}`;
  renderPrefSelect();
  renderLegend();
  const stats = state.meta.meta.stats;
  if (stats) {
    el.footer.textContent = `Grille v${state.meta.meta.version} : ${stats.lignes} lignes · ${stats.secteurs} secteurs · ${stats.rang1} Rang 1 · ${stats.rang2} Rang 2 · ${stats.vigilance} Vigilance · ${stats.hors_zones} Hors zones · ${stats.a_ecarter} À écarter. ${state.meta.meta.disclaimer}`;
  }
}

init();
