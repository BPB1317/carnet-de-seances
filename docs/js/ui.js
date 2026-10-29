// Briques d'interface partagées : humeurs, étoiles, affiches, cartes, ticket, dates, infobulle.

// Ordre fixe (couleurs validées pour les daltoniens dans cet ordre)
export const MOODS = [
  { id: 'prenant', label: 'Prenant', color: 'var(--m-prenant)', hex: '#4A87BA' },
  { id: 'leger', label: 'Léger', color: 'var(--m-leger)', hex: '#7FA03A' },
  { id: 'humain', label: 'Humain', color: 'var(--m-humain)', hex: '#B868A8' },
  { id: 'divertissement', label: 'Divertissement', color: 'var(--m-divertissement)', hex: '#CC5235' },
];
export const moodOf = id => MOODS.find(m => m.id === id) || null;
export const inkOf = f => moodOf(f?.mood)?.color || 'var(--faint)';
export const VERSIONS = ['VO', 'VOSTFR', 'VF'];

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const tmdbImg = (size, path) => (path ? `https://image.tmdb.org/t/p/${size}${path}` : null);
const posterSrcset = p => `${tmdbImg('w185', p)} 185w, ${tmdbImg('w342', p)} 342w, ${tmdbImg('w500', p)} 500w`;
export const backdropUrl = (p, wide = innerWidth > 900) => tmdbImg(wide ? 'w1280' : 'w780', p);

const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2.6l2.76 6.1 6.64.62-5 4.43 1.46 6.53L12 16.9l-5.86 3.38L7.6 13.75l-5-4.43 6.64-.62z"/></svg>';
export const fmtStars = r => String(r / 2).replace('.', ',');

// Verdicts (note /10) : une couleur par palier, à la SeriesGraph (variables --t* dans style.css)
export const TIERS = [
  { k: 7, min: 9, label: 'Chef-d’œuvre', range: '9 et +' },
  { k: 6, min: 8, label: 'Excellent', range: '8 – 9' },
  { k: 5, min: 7, label: 'Très bon', range: '7 – 8' },
  { k: 4, min: 6, label: 'Bon', range: '6 – 7' },
  { k: 3, min: 5, label: 'Correct', range: '5 – 6' },
  { k: 2, min: 4, label: 'Décevant', range: '4 – 5' },
  { k: 1, min: 0, label: 'Raté', range: 'moins de 4' },
];
export const tierOf = r => (r == null ? null : TIERS.find(t => r >= t.min));
export const fmtScore = r => r.toFixed(1).replace('.', ',');
// Pastille : note chiffrée + verdict (ou « à noter » / « à voir »)
export function score(f, { verdict = true } = {}) {
  if (f.status === 'watchlist') return '<span class="tbd wl-tag">à voir</span>';
  if (f.rating == null) return '<span class="tbd">à noter</span>';
  const t = tierOf(f.rating);
  return `<span class="score k${t.k}"><span class="s" aria-label="${fmtScore(f.rating)} sur 10">${fmtScore(f.rating)}</span>${verdict ? `<span class="w">${t.label}</span>` : ''}</span>`;
}
// Grande note (film à la une, fiche film)
export function bigScore(f, note = '') {
  if (f.status !== 'seen' || f.rating == null) return '';
  const t = tierOf(f.rating);
  return `<div class="big-score k${t.k}"><span class="n">${fmtScore(f.rating)}<small>/10</small></span><span class="v">${t.label}${note ? `<span>${note}</span>` : ''}</span></div>`;
}
export function stars(f) {
  if (f.status === 'watchlist') return '<span class="tbd wl-tag">à voir</span>';
  if (f.rating == null) return '<span class="tbd">à noter</span>';
  return `<span class="stars" role="img" aria-label="${fmtStars(f.rating)} étoiles sur 5" style="--p:${f.rating * 10}%">${STAR.repeat(5)}<span class="on">${STAR.repeat(5)}</span></span>`;
}

export function poster(f, { sizes = '(max-width:640px) 31vw, 170px', eager = false } = {}) {
  const inner = f.posterPath
    ? `<img src="${tmdbImg('w342', f.posterPath)}" srcset="${posterSrcset(f.posterPath)}" sizes="${sizes}" alt="" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">`
    : `<div class="ph grain"><span class="t">${esc(f.title)}</span><span class="y">${esc(f.year || '')}</span></div>`;
  return `<div class="poster" style="--ink:${inkOf(f)}">${inner}</div>`;
}

export const moodTag = f => {
  const m = moodOf(f.mood);
  return m ? `<span class="mood-tag" style="--ink:${m.color}"><span class="dot"></span>${m.label}</span>` : '';
};

export function card(f, { compact = true, sizes } = {}) {
  return `<a class="card${compact ? ' compact' : ''}" href="#/film/${encodeURIComponent(f.id)}" style="--ink:${inkOf(f)}" aria-label="${esc(f.title)}${f.year ? ` (${f.year})` : ''}">
    ${poster(f, { sizes })}
    ${f.mood ? `<div class="over" aria-hidden="true">${moodTag(f)}</div>` : ''}
    <div class="info">${score(f)}</div>
    <div class="ttl">${esc(f.title)}</div>
  </a>`;
}

// ---- dates ----
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const MONTHS_SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
export const monthName = i => MONTHS[i];
export function fmtDate(s, { short = false } = {}) {
  if (!s) return '';
  const [y, m, d] = s.split('-');
  const names = short ? MONTHS_SHORT : MONTHS;
  return d ? `${+d} ${names[m - 1]} ${y}` : `${names[m - 1]} ${y}`;
}
export const fmtStamp = s => { const [y, m, d] = (s || '').split('-'); return d ? `${d}.${m}` : m ? `${m}.${y.slice(2)}` : ''; };
export const todayISO = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
export const fmtHours = min => { const h = Math.floor(min / 60), m = Math.round(min % 60); return h ? `${h} h${m ? ' ' + String(m).padStart(2, '0') : ''}` : `${m} min`; };
export const fmtNum = n => new Intl.NumberFormat('fr-FR').format(n);
const regionNames = (() => { try { return new Intl.DisplayNames(['fr'], { type: 'region' }); } catch { return null; } })();
export const countryName = c => { try { return regionNames?.of(c) || c; } catch { return c; } };

// ---- ticket ----
export function ticket(f, number) {
  const v = f.venue || {};
  return `<div class="ticket" style="--ink:${inkOf(f)}">
    <div class="main">
      <div class="k">${v.kind === 'streaming' ? 'Séance à domicile' : 'Séance'}</div>
      <div class="venue">${esc(v.name || 'Lieu inconnu')}${v.city ? `<br>${esc(v.city)}` : ''}</div>
      <dl>
        <dt>Film</dt><dd>${esc(f.title)}</dd>
        <dt>Date</dt><dd>${esc(fmtDate(f.watchedAt) || '—')}</dd>
        ${f.runtime ? `<dt>Durée</dt><dd>${f.runtime} min</dd>` : ''}
      </dl>
    </div>
    <div class="stub">
      <div class="k">Version</div>
      <div class="ver">${esc(f.version || '—')}</div>
      <div class="num">N° ${String(number).padStart(4, '0')}${moodOf(f.mood) ? ' · ' + moodOf(f.mood).label : ''}</div>
    </div>
    ${f.watchedAt ? `<div class="stamp" aria-hidden="true">${fmtStamp(f.watchedAt)}<small>${f.watchedAt.slice(0, 4)}</small></div>` : ''}
  </div>`;
}

export const initials = n => n.split(/[\s.-]+/).filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase();

// ---- infobulle (survol souris, tap au doigt) ----
const tip = () => document.getElementById('tooltip');
export function bindTooltip(root, selector, html) {
  const show = (el, x, y) => {
    const t = tip(); t.innerHTML = html(el); t.hidden = false;
    const r = t.getBoundingClientRect();
    t.style.left = Math.max(8, Math.min(innerWidth - r.width - 8, x - r.width / 2)) + 'px';
    t.style.top = (y - r.height - 12 < 8 ? y + 18 : y - r.height - 12) + 'px';
  };
  root.addEventListener('pointermove', e => {
    const el = e.target.closest(selector);
    if (!el || !root.contains(el)) { if (e.pointerType === 'mouse') hideTooltip(); return; }
    if (e.pointerType === 'mouse') show(el, e.clientX, e.clientY);
  });
  root.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') hideTooltip(); });
  root.addEventListener('click', e => {
    const el = e.target.closest(selector);
    if (!el) return hideTooltip();
    const r = el.getBoundingClientRect();
    show(el, r.left + r.width / 2, r.top);
  });
  root.addEventListener('focusin', e => {
    const el = e.target.closest(selector);
    if (el) { const r = el.getBoundingClientRect(); show(el, r.left + r.width / 2, r.top); }
  });
  root.addEventListener('focusout', hideTooltip);
}
export function hideTooltip() { const t = tip(); if (t) t.hidden = true; }
addEventListener('scroll', hideTooltip, { passive: true });
