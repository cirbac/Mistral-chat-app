const state = {
  meta: null,
  pref: (() => { try { return localStorage.getItem('ce-pref') || 'ue'; } catch { return 'ue'; } })(),
  view: 'home',
  secteurId: null,
};

const ICONES = {
  '01': '🚗', '02': '🛵', '03': '🛞', '04': '🧊', '05': '📺',
  '06': '💻', '07': '💿', '08': '🍽️', '09': '🧴', '10': '👕',
  '11': '🎒', '12': '🛒', '13': '📡', '14': '🏦', '15': '🚆',
  '16': '🏨', '17': '🎮', '18': '🏡', '19': '⌚', '20': '🎬', '21': '🍔',
};

const el = {
  pref: document.getElementById('pref'),
  accountBtn: document.getElementById('account-btn'),
  accountModal: document.getElementById('account-modal'),
  accountClose: document.getElementById('account-close'),
  accountEmail: document.getElementById('account-email'),
  pwForm: document.getElementById('pw-form'),
  pwMsg: document.getElementById('pw-msg'),
  themeToggle: document.getElementById('theme-toggle'),
  logout: document.getElementById('logout'),
  search: document.getElementById('search'),
  chips: document.getElementById('secteur-chips'),
  home: document.getElementById('home'),
  results: document.getElementById('results'),
  detail: document.getElementById('detail'),
  contenu: document.querySelector('.contenu'),
  footer: document.getElementById('footer'),
};

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem('ce-theme', theme); } catch {}
  el.themeToggle.textContent = theme === 'dark' ? '☀️ Passer en mode jour' : '🌙 Passer en mode nuit';
}

function currentTheme() {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

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

function renderHome() {
  show('home');
  el.detail.classList.add('hidden');
  el.contenu.classList.remove('avec-detail');
  el.results.textContent = '';
  el.chips.textContent = '';
  el.home.textContent = '';
  const titre = document.createElement('h2');
  titre.className = 'home-titre';
  titre.textContent = 'Par quoi commencez-vous ?';
  el.home.appendChild(titre);
  const grid = document.createElement('div');
  grid.className = 'home-grid';
  for (const s of state.meta.secteurs) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'cat-card';
    const icone = document.createElement('span');
    icone.className = 'cat-icone';
    icone.textContent = ICONES[s.num] || '🛍️';
    const corps = document.createElement('span');
    corps.className = 'cat-corps';
    const nom = document.createElement('strong');
    nom.textContent = s.nom;
    const count = document.createElement('small');
    count.textContent = `${s.nbGroupes} marque${s.nbGroupes > 1 ? 's' : ''} référencée${s.nbGroupes > 1 ? 's' : ''}`;
    corps.append(nom, count);
    card.append(icone, corps);
    card.addEventListener('click', () => showSecteur(s.id));
    grid.appendChild(card);
  }
  el.home.appendChild(grid);
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

  if (s.sous_categories.length > 0) {
    const sous = document.createElement('div');
    sous.className = 'sous-cats';
    const label = document.createElement('span');
    label.className = 'sous-cats-label';
    label.textContent = 'Sous-catégories :';
    sous.appendChild(label);
    for (const sc of s.sous_categories) {
      const chip = document.createElement('span');
      chip.className = 'chip chip-static';
      chip.textContent = sc;
      sous.appendChild(chip);
    }
    el.results.appendChild(sous);
  }

  const titreMarques = document.createElement('h3');
  titreMarques.className = 'cat-sous-titre';
  titreMarques.textContent = `Marques (${s.groupes.length} affichées${s.masquees > 0 ? `, ${s.masquees} masquée(s) par votre préférence` : ''})`;
  el.results.appendChild(titreMarques);

  if (s.groupes.length === 0) {
    const p = document.createElement('p');
    p.className = 'vide';
    p.textContent = 'Aucune marque dans cette catégorie avec cette préférence.';
    el.results.appendChild(p);
  }
  for (const g of s.groupes) el.results.appendChild(carteGroupe(g));
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
  try { localStorage.setItem('ce-pref', state.pref); } catch {}
  if (state.view === 'sector' && state.secteurId) showSecteur(state.secteurId);
  else doSearch();
});

el.themeToggle.addEventListener('click', () => {
  applyTheme(currentTheme() === 'dark' ? 'light' : 'dark');
});

el.accountBtn.addEventListener('click', () => {
  el.accountEmail.textContent = el.accountEmail.dataset.email || '';
  el.accountModal.classList.remove('hidden');
});

el.accountClose.addEventListener('click', () => el.accountModal.classList.add('hidden'));

el.accountModal.addEventListener('click', (e) => {
  if (e.target === el.accountModal) el.accountModal.classList.add('hidden');
});

el.pwForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const pwCurrent = document.getElementById('pw-current');
  const pwNew = document.getElementById('pw-new');
  const pwConfirm = document.getElementById('pw-confirm');
  el.pwMsg.hidden = true;
  el.pwMsg.className = 'pw-msg';
  if (pwNew.value !== pwConfirm.value) {
    el.pwMsg.textContent = 'Les deux nouveaux mots de passe ne correspondent pas.';
    el.pwMsg.classList.add('ko');
    el.pwMsg.hidden = false;
    return;
  }
  const res = await fetch('/api/account/password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ currentPassword: pwCurrent.value, newPassword: pwNew.value }),
  });
  const data = await res.json().catch(() => ({}));
  el.pwMsg.textContent = res.ok ? 'Mot de passe enregistré.' : (data.error || 'Erreur.');
  el.pwMsg.classList.add(res.ok ? 'ok' : 'ko');
  el.pwMsg.hidden = false;
  if (res.ok) el.pwForm.reset();
});

el.logout.addEventListener('click', async () => {
  await fetch('/api/logout', { method: 'POST' });
  window.location.href = '/login.html';
});

async function init() {
  let me;
  try {
    me = await api('/api/me');
    el.accountEmail.dataset.email = me.email;
    el.accountEmail.textContent = me.email;
  } catch {
    return;
  }
  state.meta = await api('/api/meta');
  if (!state.meta.preferences.some((p) => p.id === state.pref)) state.pref = 'ue';
  renderPrefSelect();
  applyTheme(currentTheme());
  const stats = state.meta.meta.stats;
  if (stats) {
    el.footer.textContent = `Grille v${state.meta.meta.version} : ${stats.lignes} lignes · ${stats.secteurs} secteurs · ${stats.rang1} Rang 1 · ${stats.rang2} Rang 2 · ${stats.vigilance} Vigilance · ${stats.hors_zones} Hors zones · ${stats.a_ecarter} À écarter. ${state.meta.meta.disclaimer}`;
  }
  renderHome();
}

init();
