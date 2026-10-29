// Import du carnet Excel vers Firestore.
//
//   node import-excel.js <fichier.xlsx>                 -> data/films.json + rapport
//   node import-excel.js <fichier.xlsx> --preview 5     -> affiche 5 films transformés
//   TMDB_API_KEY=... node import-excel.js <xlsx> --tmdb  -> + affiches, fonds, noms complets
//   node import-excel.js <xlsx> --tmdb --push [--only slug1,slug2]
//        -> écrit dans Firestore (GOOGLE_APPLICATION_CREDENTIALS = clé de compte de service,
//           à garder HORS du dépôt)
//
// Corrections manuelles éventuelles : data/overrides.json
//   { "<slug>": { "tmdbId": 12345, "rating": 7, "watchedAt": "2026-09-24", ... } }

const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

const args = process.argv.slice(2);
const xlsxPath = args.find(a => a.endsWith('.xlsx'));
const flag = name => args.includes(name);
const opt = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
if (!xlsxPath) { console.error('Usage : node import-excel.js <fichier.xlsx> [--preview N] [--tmdb] [--push]'); process.exit(1); }

const DATA_DIR = path.join(__dirname, '..', 'data');
const OVERRIDES_PATH = path.join(DATA_DIR, 'overrides.json');

// Onglets d'humeur -> identifiant (les emojis des onglets sont ignorés)
const MOODS = { prenant: 'Prenant', leger: 'Léger', divertissement: 'Divertissement', humain: 'Humain' };

const report = [];
const note = (slug, msg) => report.push(`${slug} : ${msg}`);

// ---------- utilitaires ----------

const cellText = v => {
  if (v == null) return null;
  if (v.richText) return v.richText.map(t => t.text).join('');
  if (v.hyperlink && v.text !== undefined) return v.text;
  if (v.result !== undefined) return v.result;
  return v;
};
const clean = s => (s == null ? null : String(s).replace(/\r/g, '').trim() || null);
const fold = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const key = s => fold(s).replace(/[^a-z0-9぀-鿿]/g, '');
const slugify = s => fold(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function sheetMood(name) {
  const k = key(name);
  return Object.keys(MOODS).find(m => k.includes(m)) || null;
}

function parseRating(v, slug) {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(',', '.'));
  if (!Number.isFinite(n) || n < 0 || n > 10) { note(slug, `note illisible "${v}" -> à noter`); return null; }
  const r = Math.round(n * 2) / 2;
  if (r !== n) note(slug, `note ${n} arrondie au demi-point (${r})`);
  return r;
}

function parseBudget(v, slug) {
  if (v == null) return null;
  if (typeof v === 'number') return v > 0 ? v : null;
  const s = String(v).trim();
  if (/^[-–—?]*$/.test(s)) return null;
  const digits = s.replace(/[^\d]/g, '');
  const n = Number(digits);
  if (!digits || !n) { note(slug, `budget illisible "${s}" ignoré`); return null; }
  if (/m(illions?)?\b/i.test(s) && n < 10000) return n * 1e6;
  return n;
}

// Renvoie { watchedAt: 'AAAA-MM-JJ' | 'AAAA-MM' | null, precision }
function parseDate(v, slug) {
  if (v == null || v === '') return { watchedAt: null, precision: null };
  if (v instanceof Date) return { watchedAt: v.toISOString().slice(0, 10), precision: 'day' };
  if (typeof v === 'number') { // numéro de série Excel
    const d = new Date(Date.UTC(1899, 11, 30) + v * 864e5);
    return { watchedAt: d.toISOString().slice(0, 10), precision: 'day' };
  }
  const s = String(v).trim();
  let m;
  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) return { watchedAt: `${m[1]}-${m[2]}-${m[3]}`, precision: 'day' };
  if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/))) {
    const y = m[3].length === 2 ? '20' + m[3] : m[3];
    return { watchedAt: `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`, precision: 'day' };
  }
  if ((m = s.match(/^\/?(\d{1,2})\/(\d{4})$/))) {
    note(slug, `date incomplète "${s}" -> mois seul (${m[2]}-${m[1].padStart(2, '0')}), jour à préciser`);
    return { watchedAt: `${m[2]}-${m[1].padStart(2, '0')}`, precision: 'month' };
  }
  note(slug, `date illisible "${s}" ignorée`);
  return { watchedAt: null, precision: null };
}

function parseVenue(v) {
  const s = clean(v);
  if (!s) return null;
  const parts = s.split('\n').map(p => p.trim()).filter(Boolean);
  const name = parts[0];
  let city = parts.slice(1).join(' ') || null;
  const streaming = /netflix|prime|disney|canal|max\b|apple|mubi|home|maison|tv/i.test(s);
  if (city && /^(home|maison)$/i.test(city)) city = null;
  return { name, city, label: [name, city].filter(Boolean).join(' '), kind: streaming ? 'streaming' : 'cinema' };
}

function parseCast(v) {
  const s = clean(v);
  if (!s) return [];
  return s.split(/[,\n]/).map(p => p.trim()).filter(Boolean).map(p => {
    const favorite = /\(!\)/.test(p);
    return { name: p.replace(/\(!\)/g, '').replace(/\s+/g, ' ').trim(), favorite };
  });
}

const COUNTRY_FIX = { UK: 'GB', EN: 'GB', USA: 'US', COR: 'KR' };
const parseCountries = v => (clean(v) || '').split(/[\/,;]/).map(c => c.trim().toUpperCase()).filter(Boolean).map(c => COUNTRY_FIX[c] || c);

const VERSIONS = ['VOSTFR', 'VO', 'VF'];
function parseVersion(v, slug) {
  const s = (clean(v) || '').toUpperCase().replace(/\s/g, '');
  if (!s) return null;
  if (VERSIONS.includes(s)) return s;
  if (s === 'VOST') return 'VOSTFR';
  note(slug, `version inconnue "${v}" ignorée`);
  return null;
}

const fixGenre = g => { const s = clean(g); return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : null; };

// ---------- lecture Excel ----------

async function readWorkbook(file) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const sheets = [];
  wb.eachSheet(ws => {
    const rows = [];
    let header = null;
    ws.eachRow((row, i) => {
      const vals = row.values.slice(1).map(cellText);
      if (!header) { header = vals.map(h => key(h || '')); return; }
      if (!vals[0]) return;
      const rec = {};
      header.forEach((h, j) => { rec[h] = vals[j]; });
      rows.push(rec);
    });
    sheets.push({ name: ws.name, rows });
  });
  return sheets;
}

const COL = {
  title: 'titre', rating: 'note', review: 'avis', year: 'anneedesortie', director: 'realisateur',
  cast: 'acteursprincipaux', genre: 'genre', countries: 'paysdorigine', runtime: 'dureeminutes',
  budget: 'budget', venue: 'ou', date: 'datedevisionnage', version: 'version',
};

function toFilm(r) {
  const title = clean(r[COL.title]);
  const year = Number(r[COL.year]) || null;
  const slug = slugify(title.replace(/\(.*?\)/g, m => ' ' + m)) + (year ? '-' + year : '');
  const { watchedAt, precision } = parseDate(r[COL.date], slug);
  const rating = parseRating(r[COL.rating], slug);
  return {
    id: slug,
    status: 'seen',
    title,
    year,
    rating, // sur 10, par demi-points ; null = "à noter"
    review: clean(r[COL.review]),
    mood: null,
    director: clean(r[COL.director]),
    cast: parseCast(r[COL.cast]),
    genre: fixGenre(r[COL.genre]),
    countries: parseCountries(r[COL.countries]),
    runtime: Number(r[COL.runtime]) || null,
    budget: parseBudget(r[COL.budget], slug),
    budgetCurrency: 'EUR',
    venue: parseVenue(r[COL.venue]),
    watchedAt,
    watchedAtPrecision: precision,
    version: parseVersion(r[COL.version], slug),
    tmdbId: null,
    posterPath: null,
    backdropPath: null,
  };
}

// ---------- TMDB ----------

const TMDB = 'https://api.themoviedb.org/3';
async function tmdb(p, params = {}) {
  const k = process.env.TMDB_API_KEY;
  const u = new URL(TMDB + p);
  const headers = { accept: 'application/json' };
  if (k.length > 40) headers.Authorization = 'Bearer ' + k; // jeton "lecture" v4
  else u.searchParams.set('api_key', k);                       // clé v3
  u.searchParams.set('language', 'fr-FR');
  for (const [a, b] of Object.entries(params)) u.searchParams.set(a, b);
  const res = await fetch(u, { headers });
  if (!res.ok) throw new Error(`TMDB ${res.status} sur ${p}`);
  return res.json();
}

async function findTmdb(film) {
  const inParens = (film.title.match(/\((.*?)\)/) || [])[1];
  const queries = [...new Set([film.title, film.title.replace(/\(.*?\)/g, '').trim(), inParens, film.title.replace(/\s*le film$/i, '')].filter(Boolean))];
  for (const year of [film.year, null]) {
    for (const query of queries) {
      const params = { query, include_adult: 'false' };
      if (year) params.year = year;
      const { results } = await tmdb('/search/movie', params);
      if (results && results.length) {
        // privilégie l'année exacte (±1 : sorties décalées selon les pays)
        const best = results.find(x => film.year && Math.abs(Number((x.release_date || '').slice(0, 4)) - film.year) <= 1) || results[0];
        return best.id;
      }
    }
  }
  return null;
}

const lastName = n => key(n.split(/[.\s]/).filter(Boolean).pop() || n);

function editDistance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

async function enrich(film, override) {
  const id = override?.tmdbId || await findTmdb(film);
  if (!id) { note(film.id, 'introuvable sur TMDB (à corriger dans data/overrides.json)'); return film; }
  const m = await tmdb(`/movie/${id}`, { append_to_response: 'credits' });
  film.tmdbId = m.id;
  const orig = (m.original_title || '').replace(/[‎‏]/g, '').trim();
  film.originalTitle = orig && key(orig) !== key(film.title) ? orig : null;
  film.posterPath = m.poster_path || null;
  film.backdropPath = m.backdrop_path || null;
  const tmdbYear = Number((m.release_date || '').slice(0, 4));
  if (film.year && tmdbYear && Math.abs(tmdbYear - film.year) > 1) note(film.id, `TMDB a trouvé "${m.title}" (${tmdbYear}) : à vérifier`);

  // Les champs déjà saisis dans l'Excel priment ; TMDB complète les manques.
  const directors = (m.credits?.crew || []).filter(c => c.job === 'Director').map(c => c.name);
  if (!film.director && directors.length) film.director = directors.join(', ');
  if (!film.genre && m.genres?.length) film.genre = m.genres[0].name;
  if (!film.countries.length) film.countries = (m.production_countries || []).map(c => c.iso_3166_1);
  if (!film.runtime && m.runtime) film.runtime = m.runtime;
  if (!film.budget && m.budget) { film.budget = m.budget; film.budgetCurrency = 'USD'; }
  if (!film.year && tmdbYear) film.year = tmdbYear;

  // Acteurs : l'Excel abrège ("A.Vartolomei"). On retrouve le nom complet et la photo
  // sur TMDB par le nom de famille, en gardant tes favoris (!).
  const tmdbCast = (m.credits?.cast || []).slice(0, 60);
  if (film.cast.length) {
    film.cast = film.cast.map(a => {
      const ln = lastName(a.name);
      // nom exact, sinon tolérance aux fautes de frappe / translittérations (Kyeong-gu ~ Kyung-gu)
      const hit = tmdbCast.find(c => lastName(c.name) === ln)
        || (ln.length >= 5 && tmdbCast.find(c => editDistance(lastName(c.name), ln) <= 2));
      return hit ? { name: hit.name, favorite: a.favorite, profilePath: hit.profile_path || null, tmdbPersonId: hit.id }
                 : { ...a, profilePath: null, tmdbPersonId: null };
    });
  } else {
    film.cast = tmdbCast.slice(0, 8).map(c => ({ name: c.name, favorite: false, profilePath: c.profile_path || null, tmdbPersonId: c.id }));
  }
  return film;
}

// ---------- assemblage ----------

(async () => {
  const sheets = await readWorkbook(xlsxPath);
  const main = sheets.find(s => key(s.name).includes('tableau')) || sheets[0];
  const overrides = fs.existsSync(OVERRIDES_PATH) ? JSON.parse(fs.readFileSync(OVERRIDES_PATH, 'utf8')) : {};

  const films = main.rows.map(toFilm);
  const byKey = new Map(films.map(f => [key(f.title), f]));

  for (const s of sheets) {
    const mood = sheetMood(s.name);
    if (!mood) continue;
    for (const r of s.rows) {
      const f = byKey.get(key(r[COL.title]));
      if (!f) { note(slugify(String(r[COL.title])), `présent dans "${MOODS[mood]}" mais absent de "Tableau" : ignoré`); continue; }
      if (f.mood && f.mood !== mood) note(f.id, `aussi dans "${MOODS[mood]}" (gardé : ${MOODS[f.mood]})`);
      else f.mood = mood;
      // L'onglet d'humeur est parfois plus à jour que "Tableau" (note ajoutée après coup)
      const rr = parseRating(r[COL.rating], f.id);
      if (rr != null && rr !== f.rating) {
        note(f.id, f.rating == null
          ? `note absente de "Tableau", reprise de "${MOODS[mood]}" : ${rr}`
          : `CONFLIT de note : Tableau ${f.rating} / ${MOODS[mood]} ${rr} -> gardé ${rr}`);
        f.rating = rr;
      }
      if (!f.review && clean(r[COL.review])) f.review = clean(r[COL.review]);
    }
  }
  for (const f of films) {
    if (overrides[f.id]) Object.assign(f, Object.fromEntries(Object.entries(overrides[f.id]).filter(([k]) => k !== 'tmdbId')));
    if (!f.mood) note(f.id, 'dans aucun onglet d\'humeur -> humeur à choisir');
    if (f.rating == null) note(f.id, 'sans note -> "à noter"');
  }

  if (flag('--tmdb')) {
    if (!process.env.TMDB_API_KEY) { console.error('TMDB_API_KEY manquante'); process.exit(1); }
    for (const f of films) {
      try { await enrich(f, overrides[f.id]); } catch (e) { note(f.id, 'erreur TMDB : ' + e.message); }
      process.stdout.write('.');
    }
    process.stdout.write('\n');
  }

  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(path.join(DATA_DIR, 'films.json'), JSON.stringify(films, null, 2));
  fs.writeFileSync(path.join(DATA_DIR, 'import-report.txt'), report.join('\n') + '\n');
  // Même contenu, chargeable par les maquettes ouvertes en local (file://)
  fs.writeFileSync(path.join(DATA_DIR, 'films.js'), 'window.FILMS = ' + JSON.stringify(films) + ';\n');

  const n = Number(opt('--preview'));
  if (n) {
    const pick = (opt('--ids') || '').split(',').filter(Boolean);
    const sample = pick.length ? films.filter(f => pick.includes(f.id)) : films.slice(0, n);
    console.log(JSON.stringify(sample, null, 2));
  }
  console.log(`\n${films.length} films -> data/films.json`);
  console.log(`Rapport (${report.length} remarques) -> data/import-report.txt`);

  if (flag('--push')) {
    const only = (opt('--only') || '').split(',').filter(Boolean);
    const admin = require('firebase-admin');
    admin.initializeApp({ credential: admin.credential.applicationDefault() });
    const db = admin.firestore();
    const now = admin.firestore.FieldValue.serverTimestamp();
    const toPush = only.length ? films.filter(f => only.includes(f.id)) : films;
    for (let i = 0; i < toPush.length; i += 400) {
      const batch = db.batch();
      for (const { id, ...doc } of toPush.slice(i, i + 400)) batch.set(db.collection('films').doc(id), { ...doc, createdAt: now, updatedAt: now });
      await batch.commit();
    }
    console.log(`${toPush.length} films écrits dans Firestore.`);
  }
})().catch(e => { console.error(e); process.exit(1); });
