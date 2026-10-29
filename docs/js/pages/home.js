// Accueil : fond animé, dernières séances, meilleures notes, une rangée par humeur, à voir.
import { seenFilms, watchlist } from '../store.js';
import { MOODS, card, bigScore, esc, fmtDate, backdropUrl } from '../ui.js';

const ROW = 14;

// Les 3 mieux notés parmi les 12 dernières séances notées qui ont une image de fond
function heroFilms(seen) {
  const recent = seen.filter(f => f.rating != null && f.backdropPath).slice(0, 12);
  return [...recent].sort((a, b) => b.rating - a.rating || (b.watchedAt || '').localeCompare(a.watchedAt || '')).slice(0, 3);
}

export const overHero = (route, list) => heroFilms(seenFilms(list)).length > 0;

const row = (title, films, { href, ink, empty } = {}) => `
  <section class="row" ${ink ? `style="--ink:${ink}"` : ''}>
    <div class="row-head"><h2>${ink ? '<span class="dot"></span>' : ''}${title}</h2>${href ? `<a href="${href}">Tout voir <span class="visually-hidden">: ${title}</span></a>` : ''}</div>
    ${films.length ? `<div class="strip">${films.map(f => card(f)).join('')}</div>` : `<p class="sub" style="color:var(--faint)">${empty || 'Rien pour l\'instant.'}</p>`}
  </section>`;

export function render(app, route, list) {
  const seen = seenFilms(list);
  const toWatch = watchlist(list);
  const hero = heroFilms(seen);
  const best = seen.filter(f => f.rating != null).sort((a, b) => b.rating - a.rating || (b.watchedAt || '').localeCompare(a.watchedAt || ''));

  app.innerHTML = `
    ${hero.length ? `<section class="hero home-hero" aria-label="Mieux notés récemment">
      ${hero.map((f, i) => `<div class="layer grain${i ? '' : ' on'}" style="background-image:url('${backdropUrl(f.backdropPath)}')"></div>`).join('')}
      <div class="hero-copy">
        <div class="k">Mieux noté récemment</div>
        <h1><a id="hero-title" href="#/film/${encodeURIComponent(hero[0].id)}">${esc(hero[0].title)}</a></h1>
        <div class="meta" id="hero-meta"></div>
        <div id="hero-score"></div>
        ${hero.length > 1 ? `<div class="hero-dots">${hero.map((f, i) => `<button type="button" data-i="${i}" aria-label="${esc(f.title)}" aria-current="${!i}"></button>`).join('')}</div>` : ''}
      </div>
    </section>` : ''}
    <div class="wrap" ${hero.length ? '' : 'style="padding-top:24px"'}>
      ${row('Dernières séances', seen.slice(0, ROW), { href: '#/films', empty: 'Aucun film pour l\'instant.' })}
      ${row('Mes meilleures notes', best.slice(0, ROW), { href: '#/films?sort=rating' })}
      ${MOODS.map(m => {
        const films = seen.filter(f => f.mood === m.id);
        return films.length ? row(m.label, films.slice(0, ROW), { href: `#/films?mood=${m.id}`, ink: m.color }) : '';
      }).join('')}
      ${row('À voir', toWatch.slice(0, ROW), { href: toWatch.length ? '#/films?tab=watchlist' : null, empty: 'La liste est vide.' })}
    </div>`;

  if (!hero.length) return;
  const layers = app.querySelectorAll('.hero .layer');
  const dots = app.querySelectorAll('.hero-dots button');
  const title = app.querySelector('#hero-title');
  const meta = app.querySelector('#hero-meta');
  const scoreEl = app.querySelector('#hero-score');
  let i = 0, timer = null;
  const show = n => {
    i = n;
    const f = hero[i];
    layers.forEach((l, k) => l.classList.toggle('on', k === i));
    dots.forEach((d, k) => d.setAttribute('aria-current', String(k === i)));
    title.textContent = f.title;
    title.href = `#/film/${encodeURIComponent(f.id)}`;
    scoreEl.innerHTML = bigScore(f);
    meta.innerHTML = `<span>vu le ${esc(fmtDate(f.watchedAt))}</span>${f.venue ? `<span>${esc(f.venue.label)}</span>` : ''}${f.version ? `<span>${f.version}</span>` : ''}`;
  };
  show(0);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const start = () => { if (!reduce && hero.length > 1) timer = setInterval(() => show((i + 1) % hero.length), 8000); };
  dots.forEach(d => d.addEventListener('click', () => { clearInterval(timer); show(+d.dataset.i); start(); }));
  start();
  return () => clearInterval(timer);
}
