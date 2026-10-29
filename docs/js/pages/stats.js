// Stats façon SeriesGraph : chiffres clés, calendrier, notes, humeurs, lieux, versions, acteurs, récap annuel.
import { seenFilms } from '../store.js';
import { MOODS, VERSIONS, TIERS, tierOf, fmtScore, esc, fmtHours, fmtDate, monthName, tmdbImg, backdropUrl, initials, poster, bindTooltip } from '../ui.js';

// Rampe séquentielle ambre (0, 1, 2, 3+ séances dans la journée)
const HEAT = ['#221E1A', '#6B4A1F', '#A8742D', '#E8A33D'];
const VERSION_COLORS = { VO: '#E8A33D', VOSTFR: '#A8742D', VF: '#8A8076' };
const MONTH_ABBR = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const DAYS = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];

const avg = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
const count = (arr, key) => arr.reduce((m, x) => { const k = key(x); if (k != null) m.set(k, (m.get(k) || 0) + 1); return m; }, new Map());
const topOf = map => [...map].sort((a, b) => b[1] - a[1])[0] || null;
const minutes = films => films.reduce((s, f) => s + (f.runtime || 0), 0);
const plural = (n, w) => `${n} ${w}${n > 1 ? 's' : ''}`;
const fullDays = films => films.filter(f => f.watchedAt && f.watchedAtPrecision !== 'month' && f.watchedAt.length === 10);

function tableToggle(id, head, rows) {
  return `<button type="button" class="table-toggle" aria-expanded="false" aria-controls="${id}">Voir les données</button>
    <table class="data" id="${id}" hidden><thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

// ---------- calendrier ----------
function heatmap(films, year) {
  const byDay = new Map();
  fullDays(films).filter(f => f.watchedAt.startsWith(year)).forEach(f => {
    if (!byDay.has(f.watchedAt)) byDay.set(f.watchedAt, []);
    byDay.get(f.watchedAt).push(f);
  });
  const C = 12, G = 3, S = C + G, top = 18, left = 30;
  const jan1 = new Date(Date.UTC(+year, 0, 1));
  const offset = (jan1.getUTCDay() + 6) % 7; // lundi = 0
  const days = (Date.UTC(+year + 1, 0, 1) - jan1) / 864e5;
  const weeks = Math.ceil((days + offset) / 7);
  let cells = '', months = '';
  for (let d = 0; d < days; d++) {
    const date = new Date(jan1.getTime() + d * 864e5);
    const iso = date.toISOString().slice(0, 10);
    const idx = d + offset, w = Math.floor(idx / 7), dow = idx % 7;
    const list = byDay.get(iso) || [];
    const fill = HEAT[Math.min(list.length, 3)];
    cells += `<rect class="c" x="${left + w * S}" y="${top + dow * S}" width="${C}" height="${C}" rx="2" fill="${fill}" data-d="${iso}" tabindex="${list.length ? 0 : -1}"><title>${esc(fmtDate(iso))}</title></rect>`;
    if (date.getUTCDate() === 1) months += `<text x="${left + w * S}" y="11">${MONTH_ABBR[date.getUTCMonth()]}</text>`;
  }
  const labels = [0, 2, 4].map(i => `<text x="0" y="${top + i * S + 10}">${DAYS[i]}</text>`).join('');
  const W = left + weeks * S, H = top + 7 * S;
  const monthRows = Array.from({ length: 12 }, (_, m) => {
    const n = [...byDay].filter(([d]) => +d.slice(5, 7) === m + 1).reduce((s, [, l]) => s + l.length, 0);
    return [monthName(m), n];
  }).filter(([, n]) => n);
  return {
    byDay,
    html: `<div class="chart heat-wrap"><svg class="heat" viewBox="0 0 ${W} ${H}" role="img" aria-label="Calendrier des séances ${year}">${months}${labels}${cells}</svg></div>
      <div class="legend"><span>Moins</span>${HEAT.map(c => `<i style="background:${c}"></i>`).join('')}<span>Plus</span></div>
      ${tableToggle('t-heat', ['Mois', 'Séances'], monthRows)}`,
  };
}

// ---------- répartition des notes ----------
function ratingBars(films) {
  // Une barre par demi-point, de 1 à 10, colorée selon le verdict
  const steps = Array.from({ length: 19 }, (_, i) => 1 + i / 2);
  const bins = steps.map(v => films.filter(f => f.rating === v).length);
  const max = Math.max(1, ...bins);
  const W = 600, H = 190, pad = 22, bw = (W - 20) / steps.length, inner = bw - 6;
  const peak = bins.indexOf(max);
  const bars = bins.map((n, i) => {
    const v = steps[i], h = n ? Math.max(4, (n / max) * (H - pad - 20)) : 0;
    const x = 10 + i * bw + 3, y = H - pad - h;
    return `<g class="bin" data-i="${i}" data-n="${n}" tabindex="0">
      <rect x="${10 + i * bw}" y="0" width="${bw}" height="${H}" fill="transparent"/>
      ${n ? `<path d="M${x},${H - pad} V${y + 4} q0,-4 4,-4 h${inner - 8} q4,0 4,4 V${H - pad} Z" fill="var(--t${tierOf(v).k})"/>` : ''}
      ${i === peak && n ? `<text x="${x + inner / 2}" y="${y - 6}" text-anchor="middle" style="fill:var(--text)">${n}</text>` : ''}
      ${Number.isInteger(v) ? `<text x="${x + inner / 2}" y="${H - 6}" text-anchor="middle">${v}</text>` : ''}
    </g>`;
  }).join('');
  const tbd = films.filter(f => f.rating == null).length;
  return `<div class="chart" id="ratings"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Répartition des notes">
      <line class="axis" x1="0" x2="${W}" y1="${H - pad}" y2="${H - pad}"/>${bars}</svg></div>
    <div class="legend">${TIERS.map(t => `<span class="k${t.k}"><i></i>${t.label}</span>`).join('')}</div>
    <p class="sub" style="margin-top:8px">Note sur 10${tbd ? ` · ${plural(tbd, 'film')} à noter` : ''}</p>
    ${tableToggle('t-ratings', ['Note', 'Films'], bins.map((n, i) => [fmtScore(steps[i]), n]))}`;
}

const hbars = (rows, max) => `<div class="hbar">${rows.map(r => `
  <span class="lab">${r.label}</span>
  <span class="track" ${r.ink ? `style="--ink:${r.ink}"` : ''}><span class="fill" style="width:${max ? (r.value / max) * 100 : 0}%"></span></span>
  <span class="val">${r.text}</span>`).join('')}</div>`;

// ---------- personnes ----------
function people(films, { favoritesOnly = false } = {}) {
  const map = new Map();
  films.forEach(f => f.cast.forEach(c => {
    if (favoritesOnly && !c.favorite) return;
    const k = c.name;
    const p = map.get(k) || { name: c.name, films: [], favorite: false, img: null };
    p.films.push(f.title); p.favorite ||= c.favorite; p.img ||= c.profilePath;
    map.set(k, p);
  }));
  return [...map.values()].sort((a, b) => b.films.length - a.films.length || Number(b.favorite) - Number(a.favorite) || a.name.localeCompare(b.name, 'fr'));
}
const peopleList = list => `<ul class="people">${list.map(p => {
  const img = tmdbImg('w185', p.img);
  return `<li class="${p.favorite ? 'fav' : ''}"><span class="face" ${img ? `style="background-image:url('${img}')"` : ''} aria-hidden="true">${img ? '' : esc(initials(p.name))}</span>
    <span class="who">${esc(p.name)}<span class="films">${esc(p.films.join(' · '))}</span></span><span class="cnt">${p.films.length}</span></li>`;
}).join('')}</ul>`;

// ---------- récap annuel ----------
function wrapped(films, year) {
  const yf = films.filter(f => (f.watchedAt || '').startsWith(year));
  if (!yf.length) return `<div class="wrapped"><div class="inner"><p class="big">Aucune séance en ${year}.</p></div></div>`;
  const rated = yf.filter(f => f.rating != null);
  const best = [...rated].sort((a, b) => b.rating - a.rating || (b.watchedAt || '').localeCompare(a.watchedAt || ''))[0];
  const mood = topOf(count(yf, f => f.mood));
  const venue = topOf(count(yf.filter(f => f.venue?.kind === 'cinema'), f => f.venue.label));
  const month = topOf(count(yf.filter(f => f.watchedAt.length >= 7), f => +f.watchedAt.slice(5, 7) - 1));
  const chrono = [...yf].sort((a, b) => a.watchedAt.localeCompare(b.watchedAt));
  const actor = people(yf)[0];
  const vo = yf.filter(f => f.version && f.version !== 'VF').length, withV = yf.filter(f => f.version).length;
  const moodObj = mood && MOODS.find(m => m.id === mood[0]);
  const mins = minutes(yf);
  return `<div class="wrapped">
    ${best?.backdropPath ? `<div class="bgimg" style="background-image:url('${backdropUrl(best.backdropPath, false)}')"></div>` : ''}
    <div class="inner">
      <div class="mood-tag">Mon année ${year}</div>
      <p class="big"><em>${yf.length}</em> ${yf.length > 1 ? 'séances' : 'séance'}, <em>${fmtHours(mins).replace(/ \d+$/, '')}</em> dans le noir.</p>
      <div class="w-grid">
        ${best ? `<a class="w-item w-top" href="#/film/${encodeURIComponent(best.id)}">${poster(best, { sizes: '96px' })}<div><div class="l">Film de l'année</div><div class="v">${esc(best.title)}</div><div class="s">${fmtScore(best.rating)} / 10 · ${tierOf(best.rating).label}</div></div></a>` : ''}
        ${moodObj ? `<div class="w-item"><div class="l">Humeur dominante</div><div class="v"><span class="dot" style="--ink:${moodObj.color}"></span>${moodObj.label}</div><div class="s">${plural(mood[1], 'film')}</div></div>` : ''}
        ${venue ? `<div class="w-item"><div class="l">Ma salle</div><div class="v">${esc(venue[0])}</div><div class="s">${plural(venue[1], 'séance')}</div></div>` : ''}
        ${month ? `<div class="w-item"><div class="l">Mois le plus chargé</div><div class="v">${monthName(month[0])}</div><div class="s">${plural(month[1], 'film')}</div></div>` : ''}
        ${rated.length ? `<div class="w-item"><div class="l">Note moyenne</div><div class="v">${fmtScore(avg(rated.map(f => f.rating)))} / 10</div><div class="s">sur ${plural(rated.length, 'film')} noté${rated.length > 1 ? 's' : ''}</div></div>` : ''}
        ${actor && actor.films.length > 1 ? `<div class="w-item"><div class="l">Acteur le plus vu</div><div class="v">${esc(actor.name)}</div><div class="s">${plural(actor.films.length, 'film')}</div></div>` : ''}
        ${withV ? `<div class="w-item"><div class="l">En version originale</div><div class="v">${Math.round((vo / withV) * 100)} %</div><div class="s">${vo} sur ${withV}</div></div>` : ''}
        <div class="w-item"><div class="l">Première et dernière</div><div class="v" style="font-size:18px">${esc(chrono[0].title)}</div><div class="s">${esc(fmtDate(chrono[0].watchedAt))} → ${esc(chrono.at(-1).title)}, ${esc(fmtDate(chrono.at(-1).watchedAt))}</div></div>
      </div>
    </div>
  </div>`;
}

export function render(app, route, list) {
  const films = seenFilms(list);
  if (!films.length) { app.innerHTML = '<p class="empty">Pas encore de séance à analyser.</p>'; return; }
  const years = [...new Set(films.map(f => (f.watchedAt || '').slice(0, 4)).filter(Boolean))].sort().reverse();
  const year = years.includes(route.query.get('year')) ? route.query.get('year') : years[0];

  const rated = films.filter(f => f.rating != null);
  const mins = minutes(films);
  const knownRuntime = films.filter(f => f.runtime).length;
  const cinemas = [...count(films.filter(f => f.venue), f => f.venue.label)].sort((a, b) => b[1] - a[1]);
  const topCinema = cinemas.find(([label]) => films.find(f => f.venue?.label === label)?.venue.kind === 'cinema');
  const moodRows = MOODS.map(m => {
    const r = rated.filter(f => f.mood === m.id).map(f => f.rating);
    return { m, avg: avg(r), n: films.filter(f => f.mood === m.id).length };
  }).filter(x => x.n);
  const versions = VERSIONS.map(v => [v, films.filter(f => f.version === v).length]).filter(([, n]) => n);
  const vTotal = versions.reduce((s, [, n]) => s + n, 0);
  const actors = people(films).filter(p => p.films.length > 1).slice(0, 8);
  const directors = [...count(films.filter(f => f.director), f => f.director)].filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const favorites = people(films, { favoritesOnly: true }).slice(0, 12);
  const heat = heatmap(films, year);

  app.innerHTML = `<div class="wrap stats">
    <header class="page-head"><h1>Stats</h1></header>
    <div class="tiles">
      <div class="tile"><div class="v">${films.length}</div><div class="l">films vus</div></div>
      <div class="tile"><div class="v">${Math.round(mins / 60)}<small>h</small></div><div class="l">devant l'écran${knownRuntime < films.length ? '*' : ''}</div></div>
      <div class="tile"><div class="v">${rated.length ? fmtScore(avg(rated.map(f => f.rating))) : '—'}<small>/ 10</small></div><div class="l">note moyenne</div></div>
      <div class="tile"><div class="v" style="font-size:clamp(22px,2.6vw,30px);line-height:1.1">${topCinema ? esc(topCinema[0]) : '—'}</div><div class="l">salle la plus fréquentée${topCinema ? ` · ${topCinema[1]}` : ''}</div></div>
    </div>
    ${knownRuntime < films.length ? `<p class="sub" style="margin-top:8px">* durée connue pour ${knownRuntime} films sur ${films.length}</p>` : ''}

    <section>
      <h2>Mon année</h2>
      <div class="year-pick" role="group" aria-label="Année">${years.map(y => `<button type="button" data-year="${y}" aria-pressed="${y === year}">${y}</button>`).join('')}</div>
      ${wrapped(films, year)}
    </section>

    <section>
      <h2>Calendrier des séances</h2>
      <p class="sub">${year} · chaque case est un jour</p>
      ${heat.html}
    </section>

    <div class="two">
      <section>
        <h2>Mes notes</h2>
        <p class="sub">Combien de films pour chaque note</p>
        ${ratingBars(films)}
      </section>
      <section>
        <h2>Note moyenne par humeur</h2>
        <p class="sub">Sur 10</p>
        ${hbars(moodRows.map(x => ({ label: `<span class="dot" style="--ink:${x.m.color}"></span>${x.m.label}`, ink: x.m.color, value: x.avg || 0,
          text: `${x.avg != null ? fmtScore(x.avg) : '—'} · ${plural(x.n, 'film')}` })), 10)}
      </section>
    </div>

    <div class="two">
      <section>
        <h2>Où je les vois</h2>
        <p class="sub">Séances par lieu</p>
        ${hbars(cinemas.slice(0, 8).map(([label, n]) => ({ label: esc(label), value: n, text: n })), cinemas[0]?.[1])}
      </section>
      <section>
        <h2>VO ou VF</h2>
        <p class="sub">${vTotal ? `${Math.round((versions.filter(([v]) => v !== 'VF').reduce((s, [, n]) => s + n, 0) / vTotal) * 100)} % en version originale` : ''}</p>
        <div class="split" role="img" aria-label="${versions.map(([v, n]) => `${v} ${n}`).join(', ')}">${versions.map(([v, n]) => `<span style="flex:${n};background:${VERSION_COLORS[v]}" data-v="${v}" data-n="${n}"></span>`).join('')}</div>
        <div class="legend">${versions.map(([v, n]) => `<i style="background:${VERSION_COLORS[v]}"></i><span style="margin-right:12px">${v} · ${n} (${Math.round((n / vTotal) * 100)} %)</span>`).join('')}</div>
      </section>
    </div>

    <div class="two">
      <section>
        <h2>Acteurs les plus vus</h2>
        <p class="sub">Au moins deux films · cerclés : mes favoris</p>
        ${actors.length ? peopleList(actors) : '<p class="sub">Aucun acteur vu deux fois pour l\'instant.</p>'}
        ${directors.length ? `<h2 style="margin-top:40px">Réalisateurs les plus vus</h2><p class="sub">Au moins deux films</p>
          ${hbars(directors.map(([d, n]) => ({ label: esc(d), value: n, text: n })), directors[0][1])}` : ''}
      </section>
      <section>
        <h2>Mes acteurs favoris</h2>
        <p class="sub">Ceux que je marque d'une étoile au casting</p>
        ${favorites.length ? peopleList(favorites) : '<p class="sub">Aucun favori pour l\'instant.</p>'}
      </section>
    </div>
  </div>`;

  const root = app.querySelector('.stats');
  // Sur téléphone, le calendrier défile : on montre directement les mois les plus récents
  const hw = root.querySelector('.heat-wrap');
  hw.scrollLeft = hw.scrollWidth;
  root.addEventListener('click', e => {
    const y = e.target.closest('[data-year]');
    if (y) { location.hash = `#/stats?year=${y.dataset.year}`; return; }
    const t = e.target.closest('.table-toggle');
    if (t) {
      const table = root.querySelector('#' + t.getAttribute('aria-controls'));
      table.hidden = !table.hidden;
      t.setAttribute('aria-expanded', String(!table.hidden));
      t.textContent = table.hidden ? 'Voir les données' : 'Masquer les données';
    }
  });
  bindTooltip(root.querySelector('.heat'), 'rect.c', el => {
    const l = heat.byDay.get(el.dataset.d) || [];
    return `<b>${esc(fmtDate(el.dataset.d))}</b><br>${l.length ? l.map(f => esc(f.title)).join('<br>') : 'Aucune séance'}`;
  });
  bindTooltip(root.querySelector('#ratings'), '.bin', el => {
    const v = 1 + el.dataset.i / 2;
    return `<b>${fmtScore(v)} / 10</b> · ${tierOf(v).label}<br>${plural(+el.dataset.n, 'film')}`;
  });
  bindTooltip(root.querySelector('.split'), 'span', el => `<b>${el.dataset.v}</b> · ${plural(+el.dataset.n, 'film')}`);
}

