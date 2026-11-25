const el = { ajouts: document.getElementById('ajouts'), vide: document.getElementById('vide') };

function adminToken() {
  let t = sessionStorage.getItem('ce-admin-token');
  if (!t) {
    t = prompt('Jeton administrateur (ADMIN_TOKEN) :');
    if (t) sessionStorage.setItem('ce-admin-token', t);
  }
  return t;
}

async function api(path, opts = {}) {
  const token = adminToken();
  opts.headers = { ...(opts.headers || {}), ...(token ? { 'x-admin-token': token } : {}) };
  const res = await fetch(path, opts);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Erreur ${res.status}`);
  }
  return res.json();
}

async function load(meta) {
  const data = await api('/api/admin/ajouts');
  el.ajouts.textContent = '';
  el.vide.classList.toggle('hidden', data.ajouts.length > 0);
  for (const a of data.ajouts) {
    const g = a.groupe;
    const card = document.createElement('div');
    card.className = 'carte';
    const h = document.createElement('h3');
    h.textContent = g.groupe;
    const badges = document.createElement('div');
    badges.className = 'meta-ligne';
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.style.background = '#8250df';
    badge.textContent = 'Proposé';
    badges.appendChild(badge);
    const sec = document.createElement('span');
    sec.textContent = `Catégorie : ${a.secteurNom}`;
    badges.appendChild(sec);
    const marques = document.createElement('p');
    marques.className = 'marques';
    marques.textContent = (g.marques || []).join(', ') + (g.produits?.length ? ` — produit : ${g.produits.map((p) => p.nom).join(', ')}` : '');
    const comm = document.createElement('p');
    comm.className = 'cat-note';
    comm.textContent = g.commentaire || '';

    const form = document.createElement('form');
    form.className = 'admin-form';
    const sel = document.createElement('select');
    for (const st of meta.statuts) {
      if (st.id === 'propose') continue;
      const opt = document.createElement('option');
      opt.value = st.id;
      opt.textContent = st.label;
      sel.appendChild(opt);
    }
    const src = document.createElement('input');
    src.type = 'text';
    src.placeholder = 'Source (URL ou référence)';
    src.maxLength = 300;
    const btnOk = document.createElement('button');
    btnOk.type = 'submit';
    btnOk.textContent = '✓ Valider';
    const btnKo = document.createElement('button');
    btnKo.type = 'button';
    btnKo.className = 'btn-refuser';
    btnKo.textContent = '✗ Refuser';
    form.append(sel, src, btnOk);
    card.append(h, badges, marques, comm, form, btnKo);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      await api(`/api/admin/ajouts/${encodeURIComponent(g.id)}/valider`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statut: sel.value, source: src.value }),
      });
      load(meta);
    });
    btnKo.addEventListener('click', async () => {
      if (!confirm(`Refuser et supprimer « ${g.groupe} » ?`)) return;
      await api(`/api/admin/ajouts/${encodeURIComponent(g.id)}`, { method: 'DELETE' });
      load(meta);
    });

    el.ajouts.appendChild(card);
  }
}

function initForm(meta) {
  const f = {
    secteur: document.getElementById('f-secteur'),
    statut: document.getElementById('f-statut'),
    souscat: document.getElementById('f-souscategorie'),
    nom: document.getElementById('f-nom'),
    marques: document.getElementById('f-marques'),
    siege: document.getElementById('f-siege'),
    pays: document.getElementById('f-pays'),
    commentaire: document.getElementById('f-commentaire'),
    source: document.getElementById('f-source'),
    motscles: document.getElementById('f-motscles'),
    produits: document.getElementById('f-produits'),
    msg: document.getElementById('form-msg'),
    form: document.getElementById('form-groupe'),
    import: document.getElementById('f-import'),
    btnImport: document.getElementById('btn-import'),
    importMsg: document.getElementById('import-msg'),
  };
  for (const s of meta.secteurs) {
    const o = document.createElement('option');
    o.value = s.num;
    o.textContent = `${s.num} — ${s.nom}`;
    f.secteur.appendChild(o);
  }
  for (const st of meta.statuts) {
    const o = document.createElement('option');
    o.value = st.id;
    o.textContent = st.label;
    f.statut.appendChild(o);
  }
  const fillSousCats = () => {
    f.souscat.textContent = '';
    const s = meta.secteurs.find((x) => x.num === f.secteur.value);
    const vide = document.createElement('option');
    vide.value = '';
    vide.textContent = '(sans sous-cat)';
    f.souscat.appendChild(vide);
    for (const sc of s?.sous_categories ?? []) {
      const o = document.createElement('option');
      o.value = sc;
      o.textContent = sc;
      f.souscat.appendChild(o);
    }
  };
  f.secteur.addEventListener('change', fillSousCats);
  fillSousCats();

  f.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    f.msg.textContent = '';
    const produits = f.produits.value
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const [nom, assemblage, origine] = l.split('|').map((x) => (x || '').trim());
        return { nom, assemblage, origine_pieces: origine };
      });
    const payload = {
      num: f.secteur.value,
      groupe: {
        groupe: f.nom.value.trim(),
        marques: f.marques.value.split(',').map((x) => x.trim()).filter(Boolean),
        siege: f.siege.value.trim(),
        siege_pays: f.pays.value.trim().toUpperCase(),
        statut: f.statut.value,
        sous_categorie: f.souscat.value,
        commentaire: f.commentaire.value.trim(),
      },
      produits,
      motsCles: f.motscles.value.split(',').map((x) => x.trim()).filter(Boolean),
      sourceTexte: f.source.value.trim(),
    };
    try {
      const r = await api('/api/admin/groupe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      f.msg.textContent = `✓ ${r.groupe.groupe} ajouté (id ${r.groupe.id}${r.sourceId ? `, source #${r.sourceId}` : ''}). Rafraîchis la page d'accueil pour le voir.`;
      f.form.reset();
      fillSousCats();
      load(meta);
    } catch (err) {
      f.msg.textContent = `✗ ${err.message}`;
    }
  });

  f.btnImport.addEventListener('click', async () => {
    f.importMsg.textContent = '';
    let items;
    try {
      items = JSON.parse(f.import.value);
    } catch {
      f.importMsg.textContent = '✗ JSON invalide.';
      return;
    }
    try {
      const r = await api('/api/admin/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(items),
      });
      f.importMsg.textContent = `✓ ${r.ajoutes} marque(s) ajoutée(s)` + (r.erreurs.length ? ` — ${r.erreurs.length} erreur(s) : ${r.erreurs.join(' ; ')}` : '');
      load(meta);
    } catch (err) {
      f.importMsg.textContent = `✗ ${err.message}`;
    }
  });
}

(async () => {
  const meta = await api('/api/meta');
  initForm(meta);
  load(meta);
})();
