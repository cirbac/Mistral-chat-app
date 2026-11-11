const el = { ajouts: document.getElementById('ajouts'), vide: document.getElementById('vide') };

async function api(path, opts = {}) {
  const res = await fetch(path, opts);
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

(async () => {
  const me = await api('/api/me').catch(() => null);
  if (!me) return;
  const meta = await api('/api/meta');
  load(meta);
})();
