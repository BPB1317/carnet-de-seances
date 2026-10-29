// Routeur (#/..., compatible GitHub Pages) et amorçage.
import { getFilms } from './store.js';
import { esc, hideTooltip } from './ui.js';
import * as home from './pages/home.js';
import * as films from './pages/films.js';
import * as film from './pages/film.js';
import * as stats from './pages/stats.js';

const PAGES = { '': home, films, film, stats };
const app = document.getElementById('app');
let cleanup = null;
let lastPath = null;

export function parseRoute() {
  const h = location.hash.replace(/^#\/?/, '');
  const [path, q] = h.split('?');
  const [name, ...rest] = path.split('/');
  return { path, name: name || '', arg: rest.length ? decodeURIComponent(rest.join('/')) : null, query: new URLSearchParams(q || '') };
}

export async function render({ force = false } = {}) {
  const route = parseRoute();
  const page = PAGES[route.name];
  // Un simple changement de filtres (même chemin) est géré par la page elle-même
  const samePath = route.path === lastPath;
  if (samePath && !force && page?.onQueryChange) { page.onQueryChange(route); return; }
  lastPath = route.path;

  if (cleanup) { cleanup(); cleanup = null; }
  hideTooltip();
  document.querySelectorAll('[data-nav]').forEach(a => {
    const active = a.dataset.nav === (route.name === '' ? 'home' : route.name) || (route.name === 'film' && a.dataset.nav === 'films');
    if (active) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });

  if (!page) { document.body.classList.remove('over-hero'); app.innerHTML = '<p class="empty">Page introuvable. <a href="#/">Retour à l\'accueil</a></p>'; return; }
  try {
    const list = await getFilms({ force });
    document.body.classList.toggle('over-hero', Boolean(page.overHero?.(route, list)));
    cleanup = page.render(app, route, list) || null;
    if (!force && !samePath) { scrollTo(0, 0); }
  } catch (e) {
    console.error(e);
    app.innerHTML = `<p class="empty">Impossible de charger le carnet.<br>${esc(e.message)}</p>`;
  }
}

// Permet aux autres modules (admin) de rafraîchir la page après une modification
window.addEventListener('films:changed', () => render({ force: true }));
window.addEventListener('hashchange', () => render());
render();

// Connexion : le module admin (Firebase Auth) n'est chargé que si on clique, ou si on s'est déjà connecté sur cet appareil
const loginBtn = document.getElementById('login-btn');
let adminLoaded = null;
const loadAdmin = () => (adminLoaded ||= import('./admin.js').then(m => m.init(loginBtn)));
loginBtn.addEventListener('click', () => loadAdmin().then(api => api?.toggle()));
try { if (localStorage.getItem('carnet:admin') === '1') loadAdmin(); } catch {}
