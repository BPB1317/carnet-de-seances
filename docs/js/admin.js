// Espace admin : connexion Google, ajout / modification / suppression, import initial, réglages.
// Rien ici n'est une protection : c'est l'interface. Les écritures sont autorisées ou refusées
// par les règles Firestore (firestore.rules), qui vérifient l'UID du compte connecté.
import { firebaseApp, firestore, FIREBASE_SDK, getFilms, seenFilms } from './store.js';
import { MOODS, VERSIONS, esc, fmtScore, tierOf, tmdbImg, todayISO, initials } from './ui.js';

const KEY_STORE = 'carnet:tmdbKey';
const DEFAULT_VENUE = { name: 'Pathé', city: 'Mâcon', label: 'Pathé Mâcon', kind: 'cinema' };

let auth, A, user = null;
let loginBtn;

const ls = {
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} },
};

export async function init(btn) {
  loginBtn = btn;
  const app = await firebaseApp();
  A = await import(`${FIREBASE_SDK}/firebase-auth.js`);
  auth = A.getAuth(app);
  A.onAuthStateChanged(auth, u => {
    user = u;
    document.body.classList.toggle('is-admin', Boolean(u));
    loginBtn.textContent = u ? 'Déconnexion' : 'Connexion';
    ls.set('carnet:admin', u ? '1' : null);
    u ? mountChrome() : unmountChrome();
  });
  document.addEventListener('click', onDocClick);
  return {
    async toggle() {
      if (user) return A.signOut(auth);
      try { await A.signInWithPopup(auth, new A.GoogleAuthProvider()); }
      catch (e) {
        if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment') return A.signInWithRedirect(auth, new A.GoogleAuthProvider());
        if (e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') toast('Connexion impossible : ' + e.message, true);
      }
    },
  };
}

// ---------- éléments visibles une fois connecté ----------
function mountChrome() {
  if (!document.getElementById('fab')) {
    document.body.insertAdjacentHTML('beforeend', `<button type="button" class="fab" id="fab"><span aria-hidden="true">+</span> Ajouter un film</button>`);
    document.getElementById('fab').addEventListener('click', () => openForm());
  }
  if (!document.getElementById('settings-btn')) {
    loginBtn.insertAdjacentHTML('beforebegin', `<button type="button" class="login" id="settings-btn">Réglages</button>`);
    document.getElementById('settings-btn').addEventListener('click', openSettings);
  }
}
function unmountChrome() {
  document.getElementById('fab')?.remove();
  document.getElementById('settings-btn')?.remove();
}

async function onDocClick(e) {
  const edit = e.target.closest('[data-edit]');
  const del = e.target.closest('[data-delete]');
  if (!user || (!edit && !del)) return;
  const list = await getFilms();
  if (edit) { const f = list.find(x => x.id === edit.dataset.edit); if (f) openForm(f); }
  if (del) {
    const f = list.find(x => x.id === del.dataset.delete);
    if (!f || !confirm(`Supprimer « ${f.title} » du carnet ? C'est définitif.`)) return;
    try {
      const { db, fs } = await firestore();
      await fs.deleteDoc(fs.doc(db, 'films', f.id));
      await getFilms({ force: true });
      toast('Film supprimé.');
      location.hash = '#/films';
    } catch (err) { toast(writeError(err), true); }
  }
}

const writeError = e => e?.code === 'permission-denied'
  ? 'Écriture refusée par les règles Firestore : ce compte n\'est pas autorisé (vérifie ton UID dans les règles).'
  : 'Échec de l\'enregistrement : ' + (e?.message || e);

// ---------- petites briques ----------
function toast(msg, error = false) {
  const t = document.createElement('div');
  t.className = 'toast' + (error ? ' error' : '');
  t.setAttribute('role', error ? 'alert' : 'status');
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), error ? 7000 : 3200);
}

function sheet(html, { onClose, backdropClose = true } = {}) {
  const d = document.createElement('dialog');
  d.className = 'sheet';
  d.innerHTML = html;
  document.body.appendChild(d);
  d.addEventListener('close', () => { d.remove(); onClose?.(); });
  d.addEventListener('click', e => { if ((backdropClose && e.target === d) || e.target.closest('[data-close]')) d.close(); });
  d.showModal();
  return d;
}

const slugify = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'film';

// ---------- TMDB (clé stockée uniquement sur cet appareil) ----------
async function tmdb(path, params = {}) {
  const key = ls.get(KEY_STORE);
  if (!key) throw new Error('Clé TMDB manquante');
  const u = new URL('https://api.themoviedb.org/3' + path);
  const headers = { accept: 'application/json' };
  if (key.length > 40) headers.Authorization = 'Bearer ' + key; else u.searchParams.set('api_key', key);
  u.searchParams.set('language', 'fr-FR');
  Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
  const r = await fetch(u, { headers });
  if (r.status === 401) throw new Error('Clé TMDB refusée');
  if (!r.ok) throw new Error('TMDB ' + r.status);
  return r.json();
}

// ---------- réglages ----------
async function openSettings() {
  const hasKey = Boolean(ls.get(KEY_STORE));
  let canImport = false;
  try { canImport = (await fetch('dev-films.json', { method: 'HEAD', cache: 'no-store' })).ok; } catch {}
  const d = sheet(`
    <form method="dialog" class="form">
      <header class="sheet-head"><h2>Réglages</h2><button type="button" class="x" data-close aria-label="Fermer">×</button></header>
      <section class="block">
        <h3>Mon compte</h3>
        <p class="hint">Connecté avec ${esc(user.email)}.</p>
        <label class="lbl">Mon UID (à mettre dans les règles Firestore)
          <span class="copy"><input readonly value="${esc(user.uid)}"><button type="button" class="btn" data-copy>Copier</button></span>
        </label>
      </section>
      <section class="block">
        <h3>Clé TMDB</h3>
        <p class="hint">Stockée uniquement dans ce navigateur, jamais envoyée ailleurs qu'à TMDB. À saisir une fois par appareil.</p>
        <label class="lbl">Clé d'API ou jeton de lecture
          <input name="key" type="password" autocomplete="off" placeholder="${hasKey ? 'Clé enregistrée (laisser vide pour la garder)' : 'Colle ta clé ici'}">
        </label>
        <div class="row-btns">
          <button type="button" class="btn primary" data-save-key>Enregistrer</button>
          ${hasKey ? '<button type="button" class="btn" data-forget-key>Oublier la clé</button>' : ''}
        </div>
      </section>
      ${canImport ? `<section class="block">
        <h3>Import initial</h3>
        <p class="hint">Envoie dans Firestore les films de <code>dev-films.json</code> (ton Excel converti). Les films déjà présents avec le même identifiant sont remplacés.</p>
        <button type="button" class="btn" data-import>Importer mes films</button>
      </section>` : ''}
    </form>`);
  d.querySelector('[data-copy]').addEventListener('click', e => { navigator.clipboard?.writeText(user.uid); e.target.textContent = 'Copié'; });
  d.querySelector('[data-save-key]').addEventListener('click', async () => {
    const v = d.querySelector('[name=key]').value.trim();
    if (!v) return d.close();
    ls.set(KEY_STORE, v);
    try { await tmdb('/configuration'); toast('Clé TMDB enregistrée sur cet appareil.'); d.close(); }
    catch (e) { ls.set(KEY_STORE, null); toast(e.message, true); }
  });
  d.querySelector('[data-forget-key]')?.addEventListener('click', () => { ls.set(KEY_STORE, null); toast('Clé oubliée.'); d.close(); });
  d.querySelector('[data-import]')?.addEventListener('click', async e => {
    const films = await (await fetch('dev-films.json', { cache: 'no-store' })).json();
    if (!confirm(`Importer ${films.length} films dans Firestore ?`)) return;
    e.target.disabled = true; e.target.textContent = 'Import en cours…';
    try {
      const { db, fs } = await firestore();
      for (let i = 0; i < films.length; i += 400) {
        const batch = fs.writeBatch(db);
        films.slice(i, i + 400).forEach(({ id, ...data }) => batch.set(fs.doc(db, 'films', id), { ...clean(data), createdAt: fs.serverTimestamp(), updatedAt: fs.serverTimestamp() }));
        await batch.commit();
      }
      toast(`${films.length} films importés.`);
      d.close();
      window.dispatchEvent(new Event('films:changed'));
    } catch (err) { toast(writeError(err), true); e.target.disabled = false; e.target.textContent = 'Importer mes films'; }
  });
}

// Firestore refuse les undefined
const clean = o => JSON.parse(JSON.stringify(o, (k, v) => (v === undefined ? null : v)));

// ---------- formulaire d'ajout / modification ----------

async function openForm(existing = null) {
  const list = await getFilms();
  const seen = seenFilms(list);
  // Lieux déjà utilisés, du plus fréquent au moins fréquent
  const venueCount = new Map();
  seen.forEach(f => { if (f.venue) { const v = venueCount.get(f.venue.label) || { v: f.venue, n: 0 }; v.n++; venueCount.set(f.venue.label, v); } });
  if (!venueCount.has(DEFAULT_VENUE.label)) venueCount.set(DEFAULT_VENUE.label, { v: DEFAULT_VENUE, n: 0 });
  const venues = [...venueCount.values()].sort((a, b) => b.n - a.n).map(x => x.v);
  // Acteurs déjà marqués favoris : pré-cochés au casting
  const knownFavs = new Set(list.flatMap(f => f.cast.filter(c => c.favorite).map(c => c.tmdbPersonId || c.name)));

  const s = existing ? structuredClone(existing) : {
    status: 'seen', title: '', originalTitle: null, year: null, rating: null, review: null, mood: null,
    director: null, cast: [], genre: null, countries: [], runtime: null, budget: null, budgetCurrency: 'USD',
    venue: venues[0] || DEFAULT_VENUE, watchedAt: todayISO(), watchedAtPrecision: 'day', version: 'VOSTFR',
    tmdbId: null, posterPath: null, backdropPath: null,
  };
  if (existing && !s.watchedAt) s.watchedAt = todayISO();
  const hasKey = Boolean(ls.get(KEY_STORE));

  const d = sheet(`
    <form class="form film-form" novalidate>
      <header class="sheet-head"><h2>${existing ? 'Modifier' : 'Ajouter un film'}</h2><button type="button" class="x" data-close aria-label="Fermer">×</button></header>
      <div class="seg status" role="radiogroup" aria-label="Statut">
        <label><input type="radio" name="status" value="seen" ${s.status === 'seen' ? 'checked' : ''}><span>Vu</span></label>
        <label><input type="radio" name="status" value="watchlist" ${s.status === 'watchlist' ? 'checked' : ''}><span>À voir</span></label>
      </div>
      ${existing ? '' : `<section class="block search-block">
        ${hasKey ? '' : '<p class="hint warn">Ajoute ta clé TMDB dans <b>Réglages</b> pour avoir les suggestions. Tu peux aussi tout saisir à la main.</p>'}
        <label class="lbl">Titre
          <input name="q" type="search" autocomplete="off" placeholder="Commence à taper le titre…" enterkeyhint="search" ${hasKey ? 'autofocus' : ''}>
        </label>
        <ul class="results" role="listbox" aria-label="Suggestions TMDB"></ul>
      </section>`}
      <div class="picked"></div>
      <section class="block seen-only">
        <h3>Ma note</h3>
        <div class="rate" role="slider" tabindex="0" aria-label="Note sur 10" aria-valuemin="1" aria-valuemax="10"></div>
        <div class="rate-row">
          <button type="button" class="btn half" data-half aria-pressed="false">+0,5</button>
          <span class="rate-val"></span>
          <button type="button" class="link" data-clear-rate>À noter plus tard</button>
        </div>
      </section>
      <section class="block seen-only">
        <label class="lbl">Mon avis<textarea name="review" rows="3" placeholder="Ce que j'en ai pensé en sortant…">${esc(s.review || '')}</textarea></label>
      </section>
      <section class="block">
        <h3>Humeur</h3>
        <div class="chips">${MOODS.map(m => `<label class="chip" style="--ink:${m.color}"><input type="radio" name="mood" value="${m.id}" ${s.mood === m.id ? 'checked' : ''}><span class="dot"></span>${m.label}</label>`).join('')}</div>
      </section>
      <section class="block seen-only two-col">
        <label class="lbl">Date<input name="watchedAt" type="date" value="${esc(s.watchedAt && s.watchedAt.length === 10 ? s.watchedAt : '')}" max="${todayISO()}"></label>
        <div>
          <span class="lbl">Version</span>
          <div class="seg">${VERSIONS.map(v => `<label><input type="radio" name="version" value="${v}" ${s.version === v ? 'checked' : ''}><span>${v}</span></label>`).join('')}</div>
        </div>
      </section>
      <section class="block seen-only">
        <h3>Où</h3>
        <div class="chips venues">${venues.map((v, i) => `<label class="chip"><input type="radio" name="venue" value="${i}" ${s.venue?.label === v.label ? 'checked' : ''}>${esc(v.label)}</label>`).join('')}
          <label class="chip"><input type="radio" name="venue" value="other" ${s.venue && !venues.some(v => v.label === s.venue.label) ? 'checked' : ''}>Autre…</label></div>
        <div class="other-venue two-col" hidden>
          <label class="lbl">Salle ou plateforme<input name="vname" placeholder="ex. Pathé, Netflix"></label>
          <label class="lbl">Ville<input name="vcity" placeholder="ex. Lyon (vide si à la maison)"></label>
          <label class="check"><input type="checkbox" name="vstream"> À la maison (streaming, TV)</label>
        </div>
      </section>
      <section class="block cast-block"></section>
      <details class="block details">
        <summary>Détails du film</summary>
        <div class="two-col">
          <label class="lbl">Titre<input name="title" required></label>
          <label class="lbl">Titre original<input name="originalTitle"></label>
          <label class="lbl">Année de sortie<input name="year" type="number" inputmode="numeric" min="1890" max="2100"></label>
          <label class="lbl">Réalisation<input name="director"></label>
          <label class="lbl">Genre<input name="genre"></label>
          <label class="lbl">Pays (codes, ex. FR, US)<input name="countries"></label>
          <label class="lbl">Durée (min)<input name="runtime" type="number" inputmode="numeric" min="1"></label>
          <label class="lbl">Budget<span class="copy"><input name="budget" type="number" inputmode="numeric" min="0"><select name="budgetCurrency"><option>USD</option><option>EUR</option></select></span></label>
        </div>
      </details>
      <footer class="sheet-foot">
        <button type="button" class="btn" data-close>Annuler</button>
        <button type="submit" class="btn primary">${existing ? 'Enregistrer' : 'Ajouter au carnet'}</button>
      </footer>
    </form>`, { backdropClose: false }); // un clic à côté ne doit pas faire perdre la saisie

  const form = d.querySelector('form');
  const $ = sel => form.querySelector(sel);

  // --- note sur 10 : une case par point, « +0,5 » pour le demi-point ---
  const rate = $('.rate');
  rate.innerHTML = Array.from({ length: 10 }, (_, i) => `<button type="button" tabindex="-1" data-r="${i + 1}" aria-label="${i + 1}">${i + 1}</button>`).join('');
  const half = $('[data-half]');
  const drawRate = () => {
    const r = s.rating, t = tierOf(r);
    rate.className = 'rate' + (t ? ' k' + t.k : '');
    rate.querySelectorAll('[data-r]').forEach(el => {
      const n = +el.dataset.r;
      el.classList.toggle('on', r != null && n <= r);
      el.classList.toggle('half-on', r != null && n === Math.floor(r) + 1 && r % 1 !== 0);
    });
    half.setAttribute('aria-pressed', String(r != null && r % 1 !== 0));
    half.disabled = r == null || r >= 10;
    rate.setAttribute('aria-valuenow', r ?? '');
    rate.setAttribute('aria-valuetext', r == null ? 'à noter' : `${fmtScore(r)} sur 10, ${t.label}`);
    $('.rate-val').textContent = r == null ? 'à noter' : `${fmtScore(r)} / 10 · ${t.label}`;
  };
  rate.addEventListener('click', e => {
    const b = e.target.closest('[data-r]'); if (!b) return;
    s.rating = +b.dataset.r;
    drawRate();
  });
  half.addEventListener('click', () => {
    if (s.rating == null) return;
    s.rating = s.rating % 1 ? Math.floor(s.rating) : Math.min(10, s.rating + 0.5);
    drawRate();
  });
  rate.addEventListener('keydown', e => {
    const step = { ArrowRight: 0.5, ArrowUp: 0.5, ArrowLeft: -0.5, ArrowDown: -0.5 }[e.key];
    if (!step) return;
    e.preventDefault();
    s.rating = Math.max(1, Math.min(10, (s.rating ?? 0) + step));
    drawRate();
  });
  $('[data-clear-rate]').addEventListener('click', () => { s.rating = null; drawRate(); });
  drawRate();

  // --- statut vu / à voir ---
  const syncStatus = () => form.querySelectorAll('.seen-only').forEach(el => { el.hidden = s.status !== 'seen'; });
  form.addEventListener('change', e => {
    if (e.target.name === 'status') { s.status = e.target.value; syncStatus(); }
    if (e.target.name === 'venue') $('.other-venue').hidden = e.target.value !== 'other';
  });
  syncStatus();
  if (s.venue && !venues.some(v => v.label === s.venue.label)) {
    $('.other-venue').hidden = false;
    $('[name=vname]').value = s.venue.name || '';
    $('[name=vcity]').value = s.venue.city || '';
    $('[name=vstream]').checked = s.venue.kind === 'streaming';
  }

  // --- aperçu, détails, casting ---
  const fillDetails = () => {
    $('[name=title]').value = s.title || '';
    $('[name=originalTitle]').value = s.originalTitle || '';
    $('[name=year]').value = s.year || '';
    $('[name=director]').value = s.director || '';
    $('[name=genre]').value = s.genre || '';
    $('[name=countries]').value = (s.countries || []).join(', ');
    $('[name=runtime]').value = s.runtime || '';
    $('[name=budget]').value = s.budget || '';
    $('[name=budgetCurrency]').value = s.budgetCurrency || 'USD';
    const poster = tmdbImg('w185', s.posterPath), back = tmdbImg('w780', s.backdropPath);
    $('.picked').innerHTML = s.title ? `<div class="picked-card" ${back ? `style="background-image:linear-gradient(90deg,var(--surface) 35%,rgba(26,23,20,.6)),url('${back}')"` : ''}>
      ${poster ? `<img src="${poster}" alt="" width="70" height="105">` : '<span class="nopo"></span>'}
      <div><strong>${esc(s.title)}</strong><span>${[s.year, s.director, s.runtime && s.runtime + ' min'].filter(Boolean).map(esc).join(' · ')}</span>
      ${existing ? '' : '<button type="button" class="link" data-repick>Changer de film</button>'}</div></div>` : '';
    $('[data-repick]')?.addEventListener('click', () => { const q = $('[name=q]'); $('.search-block').hidden = false; q.focus(); q.select(); });
    drawCast();
  };
  const drawCast = () => {
    const block = $('.cast-block');
    if (!s.cast.length) { block.innerHTML = ''; return; }
    block.innerHTML = `<h3>Casting <span class="hint">touche un acteur pour le marquer favori</span></h3>
      <ul class="cast-pick">${s.cast.map((c, i) => {
        const img = tmdbImg('w185', c.profilePath);
        return `<li><button type="button" data-fav="${i}" aria-pressed="${Boolean(c.favorite)}">
          <span class="face" ${img ? `style="background-image:url('${img}')"` : ''}>${img ? '' : esc(initials(c.name))}</span>
          <span class="nm">${esc(c.name)}</span><span class="fv">Favori</span></button></li>`;
      }).join('')}</ul>`;
  };
  // Humeur : toucher l'humeur déjà choisie la retire
  form.querySelectorAll('[name=mood]').forEach(r => {
    r.closest('label').addEventListener('pointerdown', () => { r.dataset.was = String(r.checked); });
    r.addEventListener('click', () => { if (r.dataset.was === 'true') r.checked = false; r.dataset.was = 'false'; });
  });
  form.addEventListener('click', e => {
    const b = e.target.closest('[data-fav]'); if (!b) return;
    const c = s.cast[+b.dataset.fav]; c.favorite = !c.favorite;
    b.setAttribute('aria-pressed', String(c.favorite));
  });
  fillDetails();

  // --- recherche TMDB ---
  const q = $('[name=q]');
  if (q) {
    let timer, seq = 0;
    const results = $('.results');
    q.addEventListener('input', () => {
      clearTimeout(timer);
      const text = q.value.trim();
      if (!ls.get(KEY_STORE) || text.length < 2) { results.innerHTML = ''; if (!s.tmdbId) { s.title = text; } return; }
      timer = setTimeout(async () => {
        const my = ++seq;
        try {
          const { results: r } = await tmdb('/search/movie', { query: text, include_adult: 'false' });
          if (my !== seq) return;
          results.innerHTML = (r || []).slice(0, 8).map(m => `<li><button type="button" data-tmdb="${m.id}">
            ${m.poster_path ? `<img src="${tmdbImg('w92', m.poster_path)}" alt="" width="46" height="69" loading="lazy">` : '<span class="nopo"></span>'}
            <span><strong>${esc(m.title)}</strong><span>${esc((m.release_date || '').slice(0, 4) || '—')}${m.original_title !== m.title ? ' · ' + esc(m.original_title) : ''}</span></span>
          </button></li>`).join('') + `<li><button type="button" data-manual><span class="nopo"></span><span><strong>Saisir « ${esc(text)} » à la main</strong><span>sans TMDB</span></span></button></li>`;
        } catch (err) { results.innerHTML = `<li class="hint warn">${esc(err.message)}</li>`; }
      }, 250);
    });
    results.addEventListener('click', async e => {
      const manual = e.target.closest('[data-manual]');
      if (manual) { s.title = q.value.trim(); results.innerHTML = ''; $('.search-block').hidden = true; fillDetails(); $('.details').open = true; return; }
      const b = e.target.closest('[data-tmdb]'); if (!b) return;
      b.disabled = true;
      try {
        const m = await tmdb(`/movie/${b.dataset.tmdb}`, { append_to_response: 'credits' });
        const orig = (m.original_title || '').replace(/[‎‏]/g, '').trim();
        Object.assign(s, {
          tmdbId: m.id, title: m.title, originalTitle: orig && orig.toLowerCase() !== m.title.toLowerCase() ? orig : null,
          year: Number((m.release_date || '').slice(0, 4)) || null,
          director: (m.credits?.crew || []).filter(c => c.job === 'Director').map(c => c.name).join(', ') || null,
          genre: m.genres?.[0]?.name || null,
          countries: (m.production_countries || []).map(c => c.iso_3166_1),
          runtime: m.runtime || null, budget: m.budget || null, budgetCurrency: 'USD',
          posterPath: m.poster_path || null, backdropPath: m.backdrop_path || null,
          cast: (m.credits?.cast || []).slice(0, 12).map(c => ({ name: c.name, favorite: knownFavs.has(c.id) || knownFavs.has(c.name), profilePath: c.profile_path || null, tmdbPersonId: c.id })),
        });
        // Film en français -> VO ; sinon VOSTFR par défaut
        const ver = m.original_language === 'fr' ? 'VO' : 'VOSTFR';
        s.version = ver; form.querySelector(`[name=version][value=${ver}]`).checked = true;
        results.innerHTML = '';
        $('.search-block').hidden = true;
        fillDetails();
      } catch (err) { toast(err.message, true); b.disabled = false; }
    });
  }

  // --- enregistrement ---
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const val = n => form.elements[n]?.value?.trim() || null;
    const num = n => { const v = Number(val(n)); return Number.isFinite(v) && v > 0 ? v : null; };
    s.title = val('title') || (q && q.value.trim()) || s.title;
    if (!s.title) { toast('Il faut au moins un titre.', true); return; }
    const venueChoice = form.querySelector('[name=venue]:checked')?.value;
    let venue = null;
    if (venueChoice === 'other') {
      const name = val('vname'), city = val('vcity');
      if (name) venue = { name, city, label: [name, city].filter(Boolean).join(' '), kind: form.elements.vstream.checked ? 'streaming' : 'cinema' };
    } else if (venueChoice != null) venue = venues[+venueChoice];
    const seenNow = s.status === 'seen';
    const data = clean({
      status: s.status,
      title: s.title,
      originalTitle: val('originalTitle'),
      year: num('year'),
      rating: seenNow ? s.rating : null,
      review: seenNow ? val('review') : null,
      mood: form.querySelector('[name=mood]:checked')?.value || null,
      director: val('director'),
      cast: s.cast,
      genre: val('genre'),
      countries: (val('countries') || '').split(/[\s,\/]+/).map(c => c.toUpperCase()).filter(Boolean),
      runtime: num('runtime'),
      budget: num('budget'),
      budgetCurrency: val('budgetCurrency') || 'USD',
      venue: seenNow ? venue : null,
      watchedAt: seenNow ? (val('watchedAt') || (existing?.watchedAtPrecision === 'month' ? existing.watchedAt : todayISO())) : null,
      watchedAtPrecision: seenNow ? (val('watchedAt') ? 'day' : existing?.watchedAtPrecision || 'day') : null,
      version: seenNow ? form.querySelector('[name=version]:checked')?.value || null : null,
      tmdbId: s.tmdbId || null,
      posterPath: s.posterPath || null,
      backdropPath: s.backdropPath || null,
      addedAt: existing?.addedAt || todayISO(),
    });
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true; btn.textContent = 'Enregistrement…';
    try {
      const { db, fs } = await firestore();
      let id = existing?.id;
      if (!id) {
        const base = slugify(data.title) + (data.year ? '-' + data.year : '');
        id = base;
        for (let n = 2; list.some(f => f.id === id); n++) id = `${base}-${n}`;
      }
      await fs.setDoc(fs.doc(db, 'films', id), { ...data, updatedAt: fs.serverTimestamp(), ...(existing ? {} : { createdAt: fs.serverTimestamp() }) }, { merge: Boolean(existing) });
      await getFilms({ force: true });
      d.close();
      toast(existing ? 'Modifications enregistrées.' : `« ${data.title} » ajouté au carnet.`);
      const target = `#/film/${encodeURIComponent(id)}`;
      if (location.hash === target) window.dispatchEvent(new Event('films:changed')); else location.hash = target;
    } catch (err) {
      toast(writeError(err), true);
      btn.disabled = false; btn.textContent = existing ? 'Enregistrer' : 'Ajouter au carnet';
    }
  });
}
