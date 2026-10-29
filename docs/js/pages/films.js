// Tous les films : grille, filtres (humeur, note, année, cinéma, version), tri, recherche.
// L'état des filtres vit dans l'URL (#/films?mood=leger&sort=rating) pour pouvoir partager un lien.
import { seenFilms, watchlist } from '../store.js';
import { MOODS, VERSIONS, TIERS, card, esc } from '../ui.js';

const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const DEFAULTS = { tab: 'seen', q: '', mood: '', note: '', year: '', venue: '', version: '', sort: 'date' };

let ctx = null; // { app, list, state }

const readState = query => Object.fromEntries(Object.entries(DEFAULTS).map(([k, v]) => [k, query.get(k) ?? v]));
function writeState(state) {
  const qs = new URLSearchParams(Object.entries(state).filter(([k, v]) => v && v !== DEFAULTS[k])).toString();
  history.replaceState(null, '', '#/films' + (qs ? '?' + qs : ''));
}

function apply(list, s) {
  let out = s.tab === 'watchlist' ? watchlist(list) : seenFilms(list);
  const moods = s.mood ? s.mood.split(',') : [];
  if (moods.length) out = out.filter(f => moods.includes(f.mood));
  if (s.tab === 'seen') {
    if (s.note === 'tbd') out = out.filter(f => f.rating == null);
    else if (s.note) out = out.filter(f => f.rating != null && f.rating >= Number(s.note));
    if (s.year) out = out.filter(f => (f.watchedAt || '').startsWith(s.year));
    if (s.venue) out = out.filter(f => f.venue?.label === s.venue);
    if (s.version) out = out.filter(f => f.version === s.version);
  }
  if (s.q) {
    const q = fold(s.q.trim());
    out = out.filter(f => fold([f.title, f.originalTitle, f.director, ...f.cast.map(c => c.name)].join(' ')).includes(q));
  }
  const byTitle = (a, b) => a.title.localeCompare(b.title, 'fr', { sensitivity: 'base' });
  if (s.sort === 'rating') out = [...out].sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1) || byTitle(a, b));
  else if (s.sort === 'title') out = [...out].sort(byTitle);
  return out;
}

const option = (value, label, current) => `<option value="${esc(value)}"${String(value) === String(current) ? ' selected' : ''}>${esc(label)}</option>`;

function controls(list, s) {
  const seen = seenFilms(list);
  const years = [...new Set(seen.map(f => (f.watchedAt || '').slice(0, 4)).filter(Boolean))].sort().reverse();
  const venues = Object.entries(seen.reduce((m, f) => { if (f.venue) m[f.venue.label] = (m[f.venue.label] || 0) + 1; return m; }, {}))
    .sort((a, b) => b[1] - a[1]).map(([v]) => v);
  // Seuils par verdict (note /10) : « Très bon et + » = 7 et plus
  const notes = TIERS.filter(t => t.min > 0).map((t, i) => [t.min, i ? `${t.label} et +` : t.label]);
  const seenTab = s.tab === 'seen';
  const moods = s.mood ? s.mood.split(',') : [];
  const active = ['note', 'year', 'venue', 'version'].filter(k => s[k]).length;
  return `
    <div class="tabs" role="group" aria-label="Liste">
      <button type="button" data-tab="seen" aria-pressed="${seenTab}">Vus <span class="mood-tag">${seen.length}</span></button>
      <button type="button" data-tab="watchlist" aria-pressed="${!seenTab}">À voir <span class="mood-tag">${watchlist(list).length}</span></button>
    </div>
    <div class="toolbar">
      <label class="search"><span class="visually-hidden">Rechercher</span>
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="M20 20l-4-4" stroke="currentColor" stroke-width="2"/></svg>
        <input type="search" name="q" value="${esc(s.q)}" placeholder="Titre, réalisateur, acteur…" autocomplete="off" enterkeyhint="search">
      </label>
      ${seenTab ? `<button type="button" class="btn-ghost filters-toggle" aria-expanded="false" aria-controls="filters">Filtres${active ? ` (${active})` : ''}</button>` : ''}
      <label class="field"><span class="visually-hidden">Trier par</span>
        <select name="sort">${option('date', seenTab ? 'Plus récents' : 'Ajout récent', s.sort)}${seenTab ? option('rating', 'Mieux notés', s.sort) : ''}${option('title', 'Titre A–Z', s.sort)}</select>
      </label>
    </div>
    ${seenTab ? `<div class="filters" id="filters">
      <label class="field">Note<select name="note">${option('', 'Toutes', s.note)}${notes.map(([v, l]) => option(v, l, s.note)).join('')}${option('tbd', 'À noter', s.note)}</select></label>
      <label class="field">Vu en<select name="year">${option('', 'Toutes', s.year)}${years.map(y => option(y, y, s.year)).join('')}</select></label>
      <label class="field">Lieu<select name="venue">${option('', 'Tous', s.venue)}${venues.map(v => option(v, v, s.venue)).join('')}</select></label>
      <label class="field">Version<select name="version">${option('', 'Toutes', s.version)}${VERSIONS.map(v => option(v, v, s.version)).join('')}</select></label>
    </div>` : ''}
    <div class="chips" role="group" aria-label="Humeur">
      ${MOODS.map(m => `<button type="button" class="chip" data-mood="${m.id}" style="--ink:${m.color}" aria-pressed="${moods.includes(m.id)}"><span class="dot"></span>${m.label}</button>`).join('')}
    </div>`;
}

function renderGrid() {
  const { app, list, state } = ctx;
  const films = apply(list, state);
  const filtered = Object.entries(state).some(([k, v]) => k !== 'tab' && k !== 'sort' && v);
  app.querySelector('.result-count').innerHTML = `${films.length} film${films.length > 1 ? 's' : ''}${filtered ? ' · <button type="button" class="reset">Effacer les filtres</button>' : ''}`;
  app.querySelector('.grid').innerHTML = films.length
    ? films.map(f => card(f, { compact: false, sizes: '(max-width:640px) 31vw, 180px' })).join('')
    : '<p class="empty" style="grid-column:1/-1">Aucun film ne correspond.</p>';
}

function renderControls() {
  ctx.app.querySelector('.controls').innerHTML = controls(ctx.list, ctx.state);
}

function update(patch, { rebuild = false } = {}) {
  Object.assign(ctx.state, patch);
  writeState(ctx.state);
  if (rebuild) renderControls();
  renderGrid();
}

export function render(app, route, list) {
  ctx = { app, list, state: readState(route.query) };
  app.innerHTML = `<div class="wrap">
    <header class="page-head"><h1>Tous les films</h1></header>
    <div class="controls"></div>
    <p class="result-count" aria-live="polite"></p>
    <div class="grid"></div>
  </div>`;
  renderControls();
  renderGrid();

  const root = app.querySelector('.wrap');
  let typing;
  root.addEventListener('input', e => {
    if (e.target.name !== 'q') return;
    clearTimeout(typing);
    typing = setTimeout(() => update({ q: e.target.value }), 120);
  });
  root.addEventListener('change', e => {
    const { name, value } = e.target;
    if (name && name !== 'q' && name in DEFAULTS) update({ [name]: value }, { rebuild: name !== 'sort' });
  });
  root.addEventListener('click', e => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.tab) update({ tab: t.dataset.tab, note: '', year: '', venue: '', version: '', sort: 'date' }, { rebuild: true });
    else if (t.dataset.mood) {
      const set = new Set(ctx.state.mood ? ctx.state.mood.split(',') : []);
      set.has(t.dataset.mood) ? set.delete(t.dataset.mood) : set.add(t.dataset.mood);
      t.setAttribute('aria-pressed', String(set.has(t.dataset.mood)));
      update({ mood: [...set].join(',') });
    } else if (t.classList.contains('filters-toggle')) {
      const f = root.querySelector('#filters');
      const open = f.classList.toggle('open');
      t.setAttribute('aria-expanded', String(open));
    } else if (t.classList.contains('reset')) {
      update({ q: '', mood: '', note: '', year: '', venue: '', version: '' }, { rebuild: true });
    }
  });
}

export function onQueryChange(route) {
  ctx.state = readState(route.query);
  renderControls();
  renderGrid();
}
