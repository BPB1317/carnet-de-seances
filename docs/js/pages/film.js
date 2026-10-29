// Fiche film : image de fond, affiche, note, avis en grande citation, ticket, casting (favoris en avant).
import { sessionNumber } from '../store.js';
import { stars, bigScore, poster, moodTag, ticket, esc, fmtDate, fmtNum, countryName, tmdbImg, backdropUrl, initials, inkOf } from '../ui.js';

const find = (list, id) => list.find(f => f.id === id);
export const overHero = (route, list) => Boolean(find(list, route.arg));

function castList(f) {
  if (!f.cast.length) return '';
  const sorted = [...f.cast].sort((a, b) => Number(b.favorite) - Number(a.favorite));
  return `<div class="cast"><h3>Casting</h3><ul>${sorted.map(c => {
    const img = tmdbImg('w185', c.profilePath);
    return `<li class="${c.favorite ? 'fav' : ''}">
      <span class="face" ${img ? `style="background-image:url('${img}')"` : ''} aria-hidden="true">${img ? '' : esc(initials(c.name))}</span>
      <span class="nm">${esc(c.name)}</span>${c.favorite ? '<span class="fv">Favori</span>' : ''}
    </li>`;
  }).join('')}</ul></div>`;
}

const money = f => f.budget ? `${fmtNum(Math.round(f.budget / 1e5) / 10)} M${f.budgetCurrency === 'USD' ? '$' : '€'}` : null;

function facts(f) {
  const rows = [
    ['Réalisation', f.director],
    ['Genre', f.genre],
    ['Pays', f.countries.map(countryName).join(', ')],
    ['Sortie', f.year],
    ['Durée', f.runtime && `${f.runtime} min`],
    ['Budget', money(f)],
  ].filter(([, v]) => v);
  return `<dl class="facts">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`;
}

export function render(app, route, list) {
  const f = find(list, route.arg);
  if (!f) { app.innerHTML = '<p class="empty" style="padding-top:120px">Ce film n\'est pas (ou plus) dans le carnet. <a href="#/films">Tous les films</a></p>'; return; }
  document.title = `${f.title} · Carnet de séances`;
  const seen = f.status === 'seen';
  const reviewHtml = f.review ? esc(f.review).split(/\n{2,}/).map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('') : '';

  app.innerHTML = `
    <section class="hero f-back" aria-hidden="true">
      <div class="layer grain on" ${f.backdropPath ? `style="background-image:url('${backdropUrl(f.backdropPath)}')"` : ''}></div>
    </section>
    <article class="wrap" style="--ink:${inkOf(f)}">
      <div class="f-top">
        ${poster(f, { sizes: '(max-width:760px) 116px, 220px', eager: true })}
        <div class="f-title">
          ${moodTag(f)}
          <h1>${esc(f.title)}</h1>
          ${f.originalTitle ? `<p class="orig">${esc(f.originalTitle)}</p>` : ''}
          <div class="meta">${[f.year, f.director, f.runtime && `${f.runtime} min`, f.genre].filter(Boolean).map(x => `<span>${esc(x)}</span>`).join('')}</div>
          ${seen && f.rating != null ? bigScore(f) : `<div class="rating">${stars(f)}</div>`}
          <div class="admin-actions" data-admin>
            <button type="button" class="btn" data-edit="${esc(f.id)}">Modifier</button>
            <button type="button" class="btn danger" data-delete="${esc(f.id)}">Supprimer</button>
          </div>
        </div>
      </div>
      <div class="f-body">
        <div>
          ${seen
            ? (f.review
              ? `<blockquote class="review">${reviewHtml}<footer>Mon avis${f.watchedAt ? ' · ' + esc(fmtDate(f.watchedAt)) : ''}</footer></blockquote>`
              : `<p class="review none">Pas encore d'avis sur ce film.</p>`)
            : `<p class="review none">Dans ma liste « à voir »${f.addedAt ? ' depuis le ' + esc(fmtDate(f.addedAt)) : ''}.</p>`}
          ${castList(f)}
        </div>
        <aside class="side">
          ${seen ? `<h3>Mon billet</h3>${ticket(f, sessionNumber(list, f))}` : ''}
          ${facts(f)}
        </aside>
      </div>
    </article>`;
  return () => { document.title = 'Carnet de séances'; };
}
