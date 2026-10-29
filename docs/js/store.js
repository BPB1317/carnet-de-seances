// Chargement des films (Firestore, ou dev-films.json en aperçu local) et accès Firebase partagé.
import { firebaseConfig } from './firebase-config.js';

export const FIREBASE_SDK = 'https://www.gstatic.com/firebasejs/12.19.0';
export const hasFirebase = Boolean(firebaseConfig.apiKey);

let appPromise = null;
export function firebaseApp() {
  appPromise ||= import(`${FIREBASE_SDK}/firebase-app.js`).then(({ initializeApp }) => initializeApp(firebaseConfig));
  return appPromise;
}
let dbPromise = null;
export function firestore() {
  dbPromise ||= Promise.all([firebaseApp(), import(`${FIREBASE_SDK}/firebase-firestore.js`)])
    .then(([app, fs]) => ({ db: fs.getFirestore(app), fs }));
  return dbPromise;
}

// Lecture publique via l'API REST de Firestore : un seul appel, sans charger le SDK
// (le SDK ne sert qu'à l'admin, pour écrire). Les règles autorisent la lecture à tous.
function decode(v) {
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(decode);
  if ('mapValue' in v) return decodeFields(v.mapValue.fields);
  return null;
}
const decodeFields = (fields = {}) => Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, decode(v)]));

async function fetchFirestore() {
  const base = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/films`;
  const out = [];
  let token = '';
  do {
    const res = await fetch(`${base}?pageSize=300&key=${firebaseConfig.apiKey}${token ? `&pageToken=${encodeURIComponent(token)}` : ''}`, { cache: 'no-store' });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error?.message || `Erreur ${res.status}`);
    for (const doc of body.documents || []) out.push(normalize(doc.name.split('/').pop(), decodeFields(doc.fields)));
    token = body.nextPageToken;
  } while (token);
  return out;
}

let films = null;
let pending = null;

function normalize(id, d) {
  return {
    id,
    status: d.status === 'watchlist' ? 'watchlist' : 'seen',
    title: d.title || 'Sans titre',
    originalTitle: d.originalTitle || null,
    year: d.year || null,
    rating: typeof d.rating === 'number' ? d.rating : null,
    review: d.review || null,
    mood: d.mood || null,
    director: d.director || null,
    cast: Array.isArray(d.cast) ? d.cast : [],
    genre: d.genre || null,
    countries: d.countries || [],
    runtime: d.runtime || null,
    budget: d.budget || null,
    budgetCurrency: d.budgetCurrency || 'EUR',
    venue: d.venue || null,
    watchedAt: d.watchedAt || null,
    watchedAtPrecision: d.watchedAtPrecision || 'day',
    version: d.version || null,
    tmdbId: d.tmdbId || null,
    posterPath: d.posterPath || null,
    backdropPath: d.backdropPath || null,
    addedAt: d.addedAt || (typeof d.createdAt === 'string' ? d.createdAt.slice(0, 10) : null),
  };
}

export async function getFilms({ force = false } = {}) {
  if (films && !force) return films;
  if (pending && !force) return pending;
  pending = (async () => {
    let raw;
    if (hasFirebase) {
      raw = await fetchFirestore();
    } else {
      const res = await fetch('dev-films.json', { cache: 'no-store' });
      if (!res.ok) throw new Error('dev-films.json introuvable');
      raw = (await res.json()).map(({ id, ...d }) => normalize(id, d));
    }
    films = raw;
    pending = null;
    return films;
  })();
  return pending;
}

export const byDateDesc = (a, b) => (b.watchedAt || '').localeCompare(a.watchedAt || '') || a.title.localeCompare(b.title, 'fr');
export const seenFilms = list => list.filter(f => f.status === 'seen').sort(byDateDesc);
export const watchlist = list => list.filter(f => f.status === 'watchlist')
  .sort((a, b) => (b.addedAt || '').localeCompare(a.addedAt || '') || a.title.localeCompare(b.title, 'fr'));

// Numéro de séance : rang chronologique parmi les films vus
export function sessionNumber(list, film) {
  const chrono = seenFilms(list).reverse();
  return chrono.findIndex(f => f.id === film.id) + 1;
}
