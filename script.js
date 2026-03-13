/* ═══════════════════════════════════════════════════════════════
   BIBLIOTECA DE FILME — script.js  v2.2
   NOU: badge câștigător DOAR în Scenariul C
        ordine după popularitate în A și B
        trailer maxim 3 + scene maxim 3
        descriere film/actor: română vs engleză → cea mai lungă
        renderFilmCard primește flag showWinner
═══════════════════════════════════════════════════════════════ */

/* ─── API KEYS ─────────────────────────────────────────────── */
const TMDB_KEY        = 'eb1741142d9a3b9ecbfacde1aa253a51';
const OMDB_KEY        = '44942cb0';
const FANART_KEY      = '49af45b57f2233277b3bba4ec439056c';
const TRAKT_CLIENT_ID = 'b7fd8e8388b44117c6491e8885de600f30c1051af0dc4fb4727169ee936a6d35';

const TMDB_BASE = 'https://api.themoviedb.org/3';
const IMG_BASE  = 'https://image.tmdb.org/t/p/';

/* ─── CACHE ─────────────────────────────────────────────────── */
const tmdbCache   = new Map();
const omdbCache   = new Map();
const fanartCache = new Map();

async function cachedFetch(url, cacheMap, options = {}) {
    if (cacheMap.has(url)) return cacheMap.get(url);
    try {
        const res  = await fetch(url, options);
        if (!res.ok) return null;
        const data = await res.json();
        cacheMap.set(url, data);
        return data;
    } catch { return null; }
}

/* ─── STATE ─────────────────────────────────────────────────── */
let appState = {
    view: 'idle', year: null, festival: null,
    movieId: null, actorId: null, scrollY: 0,
};

/* ─── CATEGORY PRIORITY ─────────────────────────────────────── */
const CATEGORY_PRIORITY = [
    'cel mai bun film', 'best picture', 'palme d\'or', 'leul de aur',
    'ursul de aur', 'grand prix', 'marele premiu',
    'cel mai bun regizor', 'best director',
    'cel mai bun actor', 'best actor',
    'cea mai buna actrita', 'best actress',
    'cel mai bun film strain', 'best international',
    'cel mai bun film de animatie',
];

function normStr(s) {
    return (s || '').toLowerCase().normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ').trim();
}

function sortCategories(cats) {
    return [...cats].sort((a, b) => {
        const ai = CATEGORY_PRIORITY.findIndex(p => normStr(a.nume).includes(p));
        const bi = CATEGORY_PRIORITY.findIndex(p => normStr(b.nume).includes(p));
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });
}

function getCardSize(catName) {
    const n = normStr(catName);
    if (n.includes('film') && !n.includes('strain') && !n.includes('animat') &&
        !n.includes('international') && !n.includes('foreign')) return 'L';
    if (n.includes('regizor') || n.includes('director') ||
        n.includes('actor') || n.includes('actrita') || n.includes('actress')) return 'M';
    return 'S';
}

/* ─── FESTIVAL META ─────────────────────────────────────────── */
const FEST_META = {
    oscar:       { emoji: '🏆', label: 'OSCAR'         },
    globuldeaur: { emoji: '🌍', label: 'GLOBUL DE AUR' },
    bafta:       { emoji: '🎭', label: 'BAFTA'         },
    cannes:      { emoji: '🌴', label: 'CANNES'        },
    berlin:      { emoji: '🐻', label: 'BERLIN'        },
    venetia:     { emoji: '🦁', label: 'VENEȚIA'       },
    sundance:    { emoji: '🏔️', label: 'SUNDANCE'      },
    gopo:        { emoji: '🎬', label: 'GOPO'          },
    tiff:        { emoji: '🎪', label: 'TIFF'          },
};
function getFestMeta(key) {
    const k = (key || '').toLowerCase().trim();
    return FEST_META[k] || { emoji: '🎖', label: (key || '').toUpperCase() };
}

/* ─── LOAD FESTIVAL DATA cu cache per an+festival ───────────── */
const festDataCache   = new Map();
const injectedScripts = new Set();

function loadFestivalData(year, festKey) {
    const cacheKey = `${year}/${festKey}`;
    if (festDataCache.has(cacheKey)) return Promise.resolve(festDataCache.get(cacheKey));
    if (injectedScripts.has(cacheKey)) return Promise.resolve(null);

    return new Promise((resolve) => {
        const varName = `${festKey}Data`;
        delete window[varName];

        const script = document.createElement('script');
        script.src = `database/${year}/${festKey}.js?year=${year}&t=${Date.now()}`;

        const timer = setTimeout(() => { injectedScripts.add(cacheKey); resolve(null); }, 5000);

        script.onload = () => {
            clearTimeout(timer);
            injectedScripts.add(cacheKey);
            const data = window[varName] || null;
            if (data) festDataCache.set(cacheKey, data);
            delete window[varName];
            resolve(data);
        };
        script.onerror = () => {
            clearTimeout(timer);
            injectedScripts.add(cacheKey);
            resolve(null);
        };
        document.body.appendChild(script);
    });
}

/* ─── ROUTER ────────────────────────────────────────────────── */
function navigateTo(newState) {
    appState.scrollY = window.scrollY;
    appState = { ...appState, ...newState };
    history.pushState({ ...appState }, '');
    renderFromState(appState);
}

window.addEventListener('popstate', (e) => {
    if (!e.state) {
        appState = { view:'idle', year:null, festival:null, movieId:null, actorId:null, scrollY:0 };
        _doIdle();
        return;
    }
    appState = e.state;
    renderFromState(appState);
});

function renderFromState(state) {
    switch (state.view) {
        case 'idle':
            _doIdle();
            break;
        case 'listing':
            _hideAllOverlays();
            syncSelectors(state.year, state.festival);
            renderListingView(state.year, state.festival);
            setTimeout(() => window.scrollTo(0, state.scrollY || 0), 100);
            break;
        case 'film':
            _hideActorOverlay();
            syncSelectors(state.year, state.festival);
            if (!document.getElementById('listing-rendered')) {
                renderListingView(state.year, state.festival, true);
            }
            document.getElementById('film-overlay').style.display = 'block';
            document.body.style.overflow = 'hidden';
            renderFilmOverlay(state.movieId);
            break;
        case 'actor':
            syncSelectors(state.year, state.festival);
            document.getElementById('film-overlay').style.display  = 'block';
            document.getElementById('actor-overlay').style.display = 'block';
            document.body.style.overflow = 'hidden';
            renderActorOverlay(state.actorId);
            break;
    }
}

function _doIdle() {
    _hideAllOverlays();
    document.getElementById('year-select').value = '';
    document.getElementById('fest-select').value = '';
    renderIdleView();
}

function _hideAllOverlays() {
    document.getElementById('film-overlay').style.display  = 'none';
    document.getElementById('actor-overlay').style.display = 'none';
    document.getElementById('film-overlay-content').innerHTML  = '';
    document.getElementById('actor-overlay-content').innerHTML = '';
    document.body.style.overflow = '';
}

function _hideActorOverlay() {
    document.getElementById('actor-overlay').style.display = 'none';
    document.getElementById('actor-overlay-content').innerHTML = '';
}

function syncSelectors(year, festival) {
    document.getElementById('year-select').value = year     || '';
    document.getElementById('fest-select').value = festival || '';
}

function handleYearChange() {
    const year = document.getElementById('year-select').value;
    const fest = document.getElementById('fest-select').value;
    if (!year && !fest) { navigateTo({ view:'idle', year:null, festival:null, movieId:null, actorId:null, scrollY:0 }); return; }
    navigateTo({ view:'listing', year:year||null, festival:fest||null, movieId:null, actorId:null, scrollY:0 });
}

function handleFestChange() {
    const year = document.getElementById('year-select').value;
    const fest = document.getElementById('fest-select').value;
    if (!year && !fest) { navigateTo({ view:'idle', year:null, festival:null, movieId:null, actorId:null, scrollY:0 }); return; }
    navigateTo({ view:'listing', year:year||null, festival:fest||null, movieId:null, actorId:null, scrollY:0 });
}

function goHome() {
    const idle = { view:'idle', year:null, festival:null, movieId:null, actorId:null, scrollY:0 };
    history.pushState(idle, '');
    appState = idle;
    _doIdle();
}

function closeActorOverlay() { history.back(); }
function closeFilmOverlay()  { history.back(); }

document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (appState.view === 'actor') { closeActorOverlay(); return; }
    if (appState.view === 'film')  { closeFilmOverlay();  return; }
});

/* ─── IDLE VIEW ─────────────────────────────────────────────── */
function renderIdleView() {
    document.getElementById('app-viewport').innerHTML = `
        <div class="idle-view">
            <div class="idle-icon">🎬</div>
            <div class="idle-title">BIBLIOTECA DE FILME</div>
            <p class="idle-sub">
                Explorează arhiva de nominalizări și câștigători de la cele mai
                importante festivaluri și ceremonii de premiere din lume.
            </p>
            <div class="idle-hint">
                <span class="idle-hint-pill">🏆 Selectează un an pentru toate festivalurile</span>
                <span class="idle-hint-pill">🌴 Selectează un premiu pentru toate edițiile</span>
                <span class="idle-hint-pill">🎯 Selectează ambele pentru categorii detaliate</span>
            </div>
        </div>`;
}

/* ─── SMART MATCH ───────────────────────────────────────────── */
async function smartMatch(filmTitle, festivalYear, tmdbIdOverride) {
    if (tmdbIdOverride) {
        return cachedFetch(`${TMDB_BASE}/movie/${tmdbIdOverride}?api_key=${TMDB_KEY}&language=ro-RO`, tmdbCache);
    }

    const titleNorm = normStr(filmTitle);

    const searchAll = async (yearParam) => {
        const params = new URLSearchParams({
            api_key: TMDB_KEY, query: filmTitle,
            language: 'ro-RO', include_adult: 'false',
        });
        if (yearParam) params.set('primary_release_year', yearParam);
        const d = await cachedFetch(`${TMDB_BASE}/search/movie?${params}`, tmdbCache);
        return d?.results || [];
    };

    const pickBest = (results) => {
        if (!results.length) return null;
        const byExact = results.filter(r =>
            normStr(r.title) === titleNorm || normStr(r.original_title) === titleNorm
        );
        if (byExact.length > 0) return byExact.sort((a,b)=>(b.popularity||0)-(a.popularity||0))[0];
        return results.sort((a,b)=>(b.popularity||0)-(a.popularity||0))[0];
    };

    let results = await searchAll(festivalYear - 1);
    let best = pickBest(results);
    if (best && best.popularity > 1) return best;

    results = await searchAll(festivalYear - 2);
    best = pickBest(results);
    if (best && best.popularity > 1) return best;

    results = await searchAll(festivalYear);
    best = pickBest(results);
    if (best && best.popularity > 1) return best;

    results = await searchAll(null);
    return pickBest(results);
}

/* ─── DEDUPLICARE ───────────────────────────────────────────── */
function deduplicateFilms(nominations) {
    const map = new Map();
    for (const nom of nominations) {
        if (!nom.film) continue;
        const key = normStr(nom.film);
        if (!map.has(key)) {
            map.set(key, { ...nom });
        } else if (nom.castigator) {
            map.get(key).castigator = true;
        }
    }
    return [...map.values()];
}

/* ═══════════════════════════════════════════════════════════════
   RENDER LISTING VIEW
═══════════════════════════════════════════════════════════════ */
async function renderListingView(year, festival, silent = false) {
    const vp = document.getElementById('app-viewport');

    if (!silent) {
        let msg = '';
        if (year && festival)   msg = `Se pregătesc categoriile pentru ${getFestMeta(festival).label} ${year}...`;
        else if (year)          msg = `Se caută filmele din arhiva anului ${year}...`;
        else if (festival)      msg = `Se caută toate edițiile ${getFestMeta(festival).label} din arhivă...`;

        vp.innerHTML = `
            <div id="listing-rendered">
                ${msg ? `<div class="context-msg"><div class="context-dot"></div><span>${msg}</span></div>` : ''}
            </div>`;
    } else {
        if (!document.getElementById('listing-rendered')) {
            vp.innerHTML = '<div id="listing-rendered"></div>';
        }
    }

    const container = document.getElementById('listing-rendered') || vp;

    if (year && festival)       await renderScenarioC(container, year, festival);
    else if (year && !festival) await renderScenarioA(container, year);
    else if (!year && festival) await renderScenarioB(container, festival);
}

/* ═══════════════════════════════════════════════════════════════
   SCENARIU A — Doar An
   NOU: fără badge câștigător, ordine după popularitate TMDB
═══════════════════════════════════════════════════════════════ */
async function renderScenarioA(container, year) {
    const festKeys = window.dbMap?.[year] || [];
    for (const festKey of festKeys) {
        const data = await loadFestivalData(year, festKey);
        if (!data) continue;

        const meta  = getFestMeta(festKey);
        const rowId = `row-a-${festKey}-${year}`;

        const allNoms = data.categorii.flatMap(c => c.nominalizari);
        const unique  = deduplicateFilms(allNoms);

        const rowEl = createRowShell(
            `${meta.emoji} ${meta.label} ${year}`,
            unique.length, rowId,
            () => navigateTo({ view:'listing', year, festival:festKey, movieId:null, actorId:null, scrollY:0 })
        );
        container.appendChild(rowEl);
        renderSkeletons(rowId, unique.length, 'M');
        // showWinner = false → fără badge, ordine după popularitate
        await loadAndRenderFilms(rowId, unique, data.an, 'M', false, false);
    }
}

/* ═══════════════════════════════════════════════════════════════
   SCENARIU B — Doar Festival
   NOU: fără badge câștigător, ordine după popularitate TMDB
═══════════════════════════════════════════════════════════════ */
async function renderScenarioB(container, festKey) {
    const years = Object.keys(window.dbMap || {}).sort((a, b) => b - a);
    const meta  = getFestMeta(festKey);
    for (const year of years) {
        const data = await loadFestivalData(year, festKey);
        if (!data) continue;

        const rowId   = `row-b-${festKey}-${year}`;
        const allNoms = data.categorii.flatMap(c => c.nominalizari);
        const unique  = deduplicateFilms(allNoms);

        const rowEl = createRowShell(
            `${meta.emoji} ${meta.label} ${data.an}`,
            unique.length, rowId,
            () => navigateTo({ view:'listing', year, festival:festKey, movieId:null, actorId:null, scrollY:0 })
        );
        container.appendChild(rowEl);
        renderSkeletons(rowId, unique.length, 'M');
        // showWinner = false → fără badge, ordine după popularitate
        await loadAndRenderFilms(rowId, unique, data.an, 'M', false, false);
    }
}

/* ═══════════════════════════════════════════════════════════════
   SCENARIU C — An + Festival
   NOU: showWinner = true → badge câștigător vizibil, câștigătorul primul
═══════════════════════════════════════════════════════════════ */
async function renderScenarioC(container, year, festKey) {
    const data = await loadFestivalData(year, festKey);
    if (!data) {
        container.innerHTML += `
            <p style="color:var(--text-muted);padding:60px 0;text-align:center;font-size:1.1rem">
                Nu există date pentru ${getFestMeta(festKey).label} ${year}.<br>
                <span style="font-size:.85rem;color:var(--text-dim)">Adaugă fișierul database/${year}/${festKey}.js</span>
            </p>`;
        return;
    }

    const meta = getFestMeta(festKey);
    const hdr  = document.createElement('div');
    hdr.className = 'fest-sticky-header';
    hdr.innerHTML = `<span class="fest-sticky-emoji">${meta.emoji}</span>
                     <span class="fest-sticky-name">${meta.label} ${data.an}</span>`;
    container.appendChild(hdr);
    container.querySelector('.context-msg')?.remove();

    // Categoriile în ordinea originală din fișierul JS (fără sortare)
    const cats = data.categorii;

    for (const cat of cats) {
        const size  = getCardSize(cat.nume);
        const rowId = `row-c-${year}-${normStr(cat.nume).replace(/\s+/g,'-').slice(0,35)}`;

        const section = document.createElement('div');
        section.className = 'category-section';
        section.innerHTML = `<div class="category-title">${cat.nume}</div>`;

        const rowShell = createRowShellSimple(rowId);
        section.appendChild(rowShell);
        container.appendChild(section);

        // Câștigătorul primul în rând
        const sorted = [...cat.nominalizari].sort((a, b) =>
            (a.castigator === b.castigator) ? 0 : a.castigator ? -1 : 1
        );

        renderSkeletons(rowId, sorted.length, size);
        // showWinner = true → badge câștigător vizibil
        await loadAndRenderFilms(rowId, sorted, data.an, size, true, true);
    }
}

/* ─── Row shells ────────────────────────────────────────────── */
function createRowShell(title, count, rowId, onClickHeader) {
    const div = document.createElement('div');
    div.className = 'festival-row';
    div.innerHTML = `
        <div class="row-header">
            <span class="row-title">${title}</span>
            <span class="row-count">${count} filme</span>
            <span class="row-arrow">→</span>
        </div>
        <div class="row-scroll-wrap">
            <button class="scroll-btn scroll-btn-left" aria-label="Înapoi">&#8249;</button>
            <div class="row-films" id="${rowId}"></div>
            <button class="scroll-btn scroll-btn-right" aria-label="Înainte">&#8250;</button>
        </div>`;
    div.querySelector('.row-header').addEventListener('click', onClickHeader);
    _bindScrollBtns(div, rowId);
    return div;
}

function createRowShellSimple(rowId) {
    const div = document.createElement('div');
    div.className = 'row-scroll-wrap';
    div.innerHTML = `
        <button class="scroll-btn scroll-btn-left" aria-label="Înapoi">&#8249;</button>
        <div class="row-films" id="${rowId}"></div>
        <button class="scroll-btn scroll-btn-right" aria-label="Înainte">&#8250;</button>`;
    _bindScrollBtns(div, rowId);
    return div;
}

function _bindScrollBtns(container, rowId) {
    const getRow = () => document.getElementById(rowId);
    container.querySelector('.scroll-btn-left').addEventListener('click', (e) => {
        e.stopPropagation();
        getRow()?.scrollBy({ left: -520, behavior: 'smooth' });
    });
    container.querySelector('.scroll-btn-right').addEventListener('click', (e) => {
        e.stopPropagation();
        getRow()?.scrollBy({ left: 520, behavior: 'smooth' });
    });
}

/* ─── Skeleton ──────────────────────────────────────────────── */
function renderSkeletons(rowId, count, size = 'M') {
    const row = document.getElementById(rowId);
    if (!row) return;
    row.innerHTML = '';
    for (let i = 0; i < Math.min(count, 10); i++) {
        const sk = document.createElement('div');
        sk.className = `movie-card skeleton size-${size}`;
        sk.innerHTML = `
            <div class="card-poster skeleton-base sk-poster"></div>
            <div class="card-info">
                <div class="skeleton-base sk-line" style="margin-bottom:5px"></div>
                <div class="skeleton-base sk-line short"></div>
            </div>`;
        row.appendChild(sk);
    }
}

/* ─── Load & render films ───────────────────────────────────── */
let _renderToken = 0;

// showWinner = true → badge + câștigătorul primul (Scenariu C)
// showWinner = false → fără badge, ordine după popularitate (Scenariu A/B)
async function loadAndRenderFilms(rowId, nominations, festYear, size, showPerson, showWinner) {
    const myToken = ++_renderToken;
    const row = document.getElementById(rowId);
    if (row) row.innerHTML = '';

    // Dacă nu arătăm câștigătorii (A/B), colectăm toate rezultatele
    // și le sortăm după popularitate înainte de a le randa
    if (!showWinner) {
        // Fetch toate în paralel
        const BATCH = 6;
        const allResults = [];
        for (let i = 0; i < nominations.length; i += BATCH) {
            if (myToken !== _renderToken) return;
            if (!document.getElementById(rowId)) return;
            const batch = nominations.slice(i, i + BATCH);
            const batchResults = await Promise.all(batch.map(nom =>
                smartMatch(nom.film, festYear, nom.tmdbId)
                    .then(tmdbMovie => ({ nom, tmdbMovie }))
            ));
            allResults.push(...batchResults);
        }
        if (myToken !== _renderToken) return;

        // Shuffle Fisher-Yates — ordine aleatorie la fiecare reload
        for (let i = allResults.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [allResults[i], allResults[j]] = [allResults[j], allResults[i]];
        }

        for (const { nom, tmdbMovie } of allResults) {
            if (myToken !== _renderToken) return;
            renderFilmCard(rowId, nom, tmdbMovie, size, showPerson, false);
        }
    } else {
        // Scenariu C: câștigătorul deja primul în array (sortat înainte de apel)
        // randăm în batch-uri, cu badge
        const BATCH = 5;
        for (let i = 0; i < nominations.length; i += BATCH) {
            if (myToken !== _renderToken) return;
            if (!document.getElementById(rowId)) return;
            const batch = nominations.slice(i, i + BATCH);
            await Promise.all(batch.map(nom =>
                smartMatch(nom.film, festYear, nom.tmdbId)
                    .then(tmdbMovie => {
                        if (myToken !== _renderToken) return;
                        renderFilmCard(rowId, nom, tmdbMovie, size, showPerson, true);
                    })
            ));
        }
    }
}

/* ═══════════════════════════════════════════════════════════════
   RENDER FILM CARD
   NOU: parametru showWinner controlează dacă se afișează badge-ul
        și dacă câștigătorul e pus primul în rând
═══════════════════════════════════════════════════════════════ */
function renderFilmCard(rowId, nom, tmdbMovie, size, showPerson, showWinner) {
    const row = document.getElementById(rowId);
    if (!row) return;

    const card = document.createElement('div');
    card.className = `movie-card size-${size}`;

    const posterUrl = tmdbMovie?.poster_path
        ? `${IMG_BASE}w${size === 'L' ? '342' : '185'}${tmdbMovie.poster_path}` : null;
    const yr      = tmdbMovie?.release_date ? tmdbMovie.release_date.slice(0,4) : '';
    const rating  = tmdbMovie?.vote_average ? tmdbMovie.vote_average.toFixed(1) : null;
    const movieId = tmdbMovie?.id || null;

    // Badge câștigător DOAR dacă showWinner = true ȘI nom.castigator = true
    const winnerBadge = (showWinner && nom.castigator)
        ? '<span class="winner-badge">🏆 CÂȘTIGĂTOR</span>' : '';

    card.innerHTML = `
        <div class="card-poster">
            ${posterUrl
                ? `<img src="${posterUrl}" alt="${esc(nom.film)}" loading="lazy">`
                : `<div class="card-no-poster"><i class="fas fa-film"></i><span>${esc(nom.film)}</span></div>`}
            ${winnerBadge}
            <div class="card-hover-overlay">
                <div class="hover-ratings">
                    ${rating ? `<span class="hover-rat-item">⭐ ${rating}</span>` : ''}
                </div>
            </div>
        </div>
        <div class="card-info">
            <div class="card-title">${esc(nom.film)}</div>
            ${showPerson && nom.persoana ? `<div class="card-person">${esc(nom.persoana)}</div>` : ''}
            <div class="card-meta">
                <span>${yr}</span>
                ${rating ? `<span class="card-rating-star">★ ${rating}</span>` : ''}
            </div>
        </div>`;

    if (movieId) {
        card.style.cursor = 'pointer';
        card.addEventListener('click', () => navigateTo({ view:'film', movieId, actorId:null }));
    }

    // În Scenariu C câștigătorul e inserat primul
    // În A/B cardurile vin deja sortate după popularitate → appendChild direct
    if (showWinner && nom.castigator) {
        const firstNonWinner = [...row.children].find(c => !c.querySelector('.winner-badge'));
        row.insertBefore(card, firstNonWinner || null);
    } else {
        row.appendChild(card);
    }
}

/* ═══════════════════════════════════════════════════════════════
   FILM OVERLAY
═══════════════════════════════════════════════════════════════ */
async function renderFilmOverlay(movieId) {
    const overlay = document.getElementById('film-overlay');
    const content = document.getElementById('film-overlay-content');
    overlay.scrollTop = 0;

    content.innerHTML = `
        <div style="position:relative">
            <div class="overlay-close-bar">
                <button class="btn-home-overlay" onclick="goHome()"><i class="fas fa-home"></i> HOME</button>
                <button class="btn-close-overlay" onclick="closeFilmOverlay()">✕</button>
            </div>
            <div class="overlay-backdrop" style="background:var(--bg-lighter)"></div>
            <div class="film-header-block">
                <div class="film-poster-wrap">
                    <div style="width:200px;height:300px;border-radius:10px;border:2px solid var(--accent);
                         background:linear-gradient(90deg,#1e1e1e 25%,#2a2a2a 50%,#1e1e1e 75%);
                         background-size:600px 100%;animation:shimmer 1.4s infinite"></div>
                </div>
                <div class="film-meta-wrap" style="padding-top:80px">
                    <div style="height:34px;width:280px;border-radius:4px;margin-bottom:14px;
                         background:linear-gradient(90deg,#1e1e1e 25%,#2a2a2a 50%,#1e1e1e 75%);
                         background-size:600px 100%;animation:shimmer 1.4s infinite"></div>
                    <div class="loading-inline">
                        <i class="fas fa-circle-notch fa-spin" style="color:var(--accent)"></i>
                        Se încarcă datele filmului...
                    </div>
                </div>
            </div>
        </div>`;

    // Fetch RO și EN în paralel
    const [movieRo, movieEn] = await Promise.all([
        cachedFetch(
            `${TMDB_BASE}/movie/${movieId}?api_key=${TMDB_KEY}&language=ro-RO&append_to_response=videos,credits,images,similar,external_ids`,
            tmdbCache
        ),
        cachedFetch(
            `${TMDB_BASE}/movie/${movieId}?api_key=${TMDB_KEY}&language=en-US&append_to_response=videos,credits,images,similar,external_ids`,
            tmdbCache
        )
    ]);

    const movie = movieRo || movieEn;
    if (!movie) {
        content.innerHTML = `
            <div style="padding:80px 40px;text-align:center;color:var(--text-muted)">
                <i class="fas fa-exclamation-circle" style="color:var(--accent);font-size:2.5rem;display:block;margin-bottom:16px"></i>
                Nu s-au putut încărca datele filmului.
                <br><br><button class="btn-home-overlay" onclick="closeFilmOverlay()">← Înapoi</button>
            </div>`;
        return;
    }

    // ── NOU: Descriere cea mai lungă dintre RO și EN ──────────────
    const overviewRo  = movieRo?.overview  || '';
    const overviewEn  = movieEn?.overview  || '';
    const overview    = overviewRo.length >= overviewEn.length ? overviewRo : overviewEn;
    const overviewLang = overviewRo.length >= overviewEn.length ? '' : ' (EN)';

    // ── Trailer: primul Trailer/Teaser de pe TMDB ────────────────
    const allVideos = movie.videos?.results || [];
    const trailer = allVideos.find(v => v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser'));

    const cast        = (movie.credits?.cast    || []).slice(0, 16);
    const backdrops   = (movie.images?.backdrops || []).slice(0, 8);
    const similar     = (movie.similar?.results  || []).filter(m => m.poster_path).slice(0, 12);
    const imdbId      = movie.external_ids?.imdb_id;
    const releaseYear = movie.release_date ? parseInt(movie.release_date.slice(0,4)) : null;

    const posterUrl   = movie.poster_path   ? `${IMG_BASE}w342${movie.poster_path}`    : null;
    const backdropUrl = movie.backdrop_path ? `${IMG_BASE}w1280${movie.backdrop_path}` : null;
    const thumbUrl    = movie.backdrop_path ? `${IMG_BASE}w500${movie.backdrop_path}`  :
                        movie.poster_path   ? `${IMG_BASE}w342${movie.poster_path}`    : null;

    const genres  = (movie.genres||[]).map(g=>`<span class="film-tag">${g.name}</span>`).join('');
    const runtime = movie.runtime ? `<span class="film-tag">⏱ ${Math.floor(movie.runtime/60)}h ${movie.runtime%60}m</span>` : '';
    const yearTag = releaseYear   ? `<span class="film-tag">${releaseYear}</span>` : '';

    const ownNoms = await getOwnNominations(movie.title, releaseYear);
    const ownNomsHtml = ownNoms.length ? `
        <div class="own-noms-block">
            <div class="section-title">Nominalizări în colecția mea</div>
            ${ownNoms.map(n => {
                const fKey  = normStr(n.festival).replace(/\s+/g,'');
                const fMeta = getFestMeta(fKey);
                return `<div class="nom-row ${n.castigator?'nom-winner':''}">
                    <span class="nom-fest">${fMeta.emoji} ${n.festival} ${n.an}</span>
                    <span class="nom-cat">${n.categorie}${n.persoana?` · <em>${n.persoana}</em>`:''}</span>
                    ${n.castigator ? '<span class="nom-win-badge">🏆 CÂȘTIGAT</span>' : ''}
                </div>`;
            }).join('')}
        </div>` : '';

    const shortOv = overview.length > 320 ? overview.slice(0,320)+'…' : overview;
    const overviewHtml = overview.length > 320
        ? `<p class="film-overview" id="ov-text">${esc(shortOv)}</p>
           <button class="read-more-btn" onclick="toggleOverview()">Citește mai mult ↓</button>`
        : `<p class="film-overview">${esc(overview)}</p>`;

    // ── HTML trailer ──────────────────────────────────────────────
    const trailerHtml = trailer ? `
        <div class="trailer-wrap">
            <div class="section-title">Trailer Oficial</div>
            <div class="trailer-box" onclick="window.open('https://www.youtube.com/watch?v=${trailer.key}','_blank')">
                <div class="trailer-thumb-wrap">
                    <img src="https://img.youtube.com/vi/${trailer.key}/mqdefault.jpg" alt="" loading="lazy">
                    <div class="trailer-play-icon"><i class="fab fa-youtube"></i></div>
                </div>
                <div class="trailer-label">
                    <p>${esc(trailer.name) || 'Trailer Oficial'}</p>
                    <span>Deschide pe YouTube →</span>
                </div>
            </div>
        </div>` : '';

    content.innerHTML = `
        <div style="position:relative">
            <div class="overlay-close-bar">
                <button class="btn-home-overlay" onclick="goHome()"><i class="fas fa-home"></i> HOME</button>
                <button class="btn-close-overlay" onclick="closeFilmOverlay()">✕</button>
            </div>
            <div class="overlay-backdrop">
                ${backdropUrl ? `<img src="${backdropUrl}" alt="">` : ''}
                <div class="backdrop-gradient"></div>
            </div>
            <div class="film-header-block">
                <div class="film-poster-wrap">
                    ${posterUrl
                        ? `<img src="${posterUrl}" alt="${esc(movie.title)}">`
                        : `<div style="width:200px;height:300px;background:var(--bg-lighter);border-radius:10px;
                              border:2px solid var(--accent);display:flex;align-items:center;
                              justify-content:center;font-size:3rem;color:var(--text-dim)">🎬</div>`}
                </div>
                <div class="film-meta-wrap">
                    <div id="film-logo-area">
                        <h1 class="film-title-text">${esc(movie.title)}</h1>
                    </div>
                    ${movie.original_title && movie.original_title !== movie.title
                        ? `<div class="film-original-title">${esc(movie.original_title)}</div>` : ''}
                    <div class="film-tags">${yearTag}${runtime}${genres}</div>
                    <div class="ratings-row" id="ratings-row">
                        ${movie.vote_average
                            ? `<div class="rating-badge tmdb">
                                <span class="rb-source">TMDB</span>
                                <span class="rb-value">${movie.vote_average.toFixed(1)}</span>
                                <span class="rb-sub">${(movie.vote_count||0).toLocaleString()} voturi</span>
                               </div>` : ''}
                        <span id="omdb-ratings-placeholder" style="display:contents"></span>
                    </div>
                </div>
            </div>
            <div class="film-body">
                ${overviewLang ? `<div class="lang-note" style="font-size:.75rem;color:var(--text-dim);margin-bottom:4px">📖 Descriere în engleză</div>` : ''}
                ${overviewHtml}
                ${ownNomsHtml}
                ${trailerHtml}
                ${backdrops.length ? `
                <div>
                    <div class="section-title">Imagini din Film</div>
                    <div class="gallery-scroll">
                        ${backdrops.map(b=>`
                            <img class="gallery-img" src="${IMG_BASE}w500${b.file_path}" loading="lazy"
                                 onclick="window.open('${IMG_BASE}original${b.file_path}','_blank')" alt="">`).join('')}
                    </div>
                </div>` : ''}
                ${cast.length ? `
                <div>
                    <div class="section-title">Distribuție</div>
                    <div class="cast-scroll">
                        ${cast.map(a=>`
                            <div class="actor-card" onclick="openActor(${a.id})">
                                ${a.profile_path
                                    ? `<img src="${IMG_BASE}w185${a.profile_path}" alt="${esc(a.name)}" loading="lazy">`
                                    : `<div class="actor-no-photo"><i class="fas fa-user"></i></div>`}
                                <div class="actor-name">${esc(a.name)}</div>
                                <div class="actor-char">${esc(a.character||'')}</div>
                            </div>`).join('')}
                    </div>
                </div>` : ''}
                ${similar.length ? `
                <div>
                    <div class="section-title">Filme Similare</div>
                    <div class="similar-scroll">
                        ${similar.map(m=>`
                            <div class="similar-card" onclick="navigateTo({view:'film',movieId:${m.id},actorId:null})">
                                <img src="${IMG_BASE}w185${m.poster_path}" alt="${esc(m.title)}" loading="lazy">
                                <p>${esc(m.title)}</p>
                            </div>`).join('')}
                    </div>
                </div>` : ''}
                <div style="height:50px"></div>
            </div>
        </div>`;

    window._fullOverview = overview;
    if (imdbId)         loadOmdbData(imdbId);
    loadFanartLogo(movieId);
    if (backdropUrl)    applyVibrantBackground(backdropUrl);
    else if (posterUrl) applyVibrantBackground(posterUrl);
}

function toggleOverview() {
    const el  = document.getElementById('ov-text');
    const btn = el?.nextElementSibling;
    if (!el || !btn) return;
    if (el.dataset.expanded) {
        el.textContent = (window._fullOverview||'').slice(0,320)+'…';
        btn.textContent = 'Citește mai mult ↓';
        delete el.dataset.expanded;
    } else {
        el.textContent = window._fullOverview||'';
        btn.textContent = 'Restrânge ↑';
        el.dataset.expanded = '1';
    }
}

async function loadOmdbData(imdbId) {
    const data = await cachedFetch(`https://www.omdbapi.com/?i=${imdbId}&apikey=${OMDB_KEY}`, omdbCache);
    if (!data || data.Response === 'False') return;
    const placeholder = document.getElementById('omdb-ratings-placeholder');
    if (!placeholder) return;
    let html = '';
    if (data.imdbRating && data.imdbRating !== 'N/A') {
        html += `<div class="rating-badge imdb">
            <span class="rb-source">IMDb</span>
            <span class="rb-value">${data.imdbRating}</span>
            <span class="rb-sub">${parseInt((data.imdbVotes||'0').replace(/,/g,'')).toLocaleString()} voturi</span>
        </div>`;
    }
    const rt = data.Ratings?.find(r => r.Source === 'Rotten Tomatoes');
    if (rt) html += `<div class="rating-badge rt">
        <span class="rb-source">🍅 Tomatometer</span>
        <span class="rb-value">${rt.Value}</span>
    </div>`;
    const meta = data.Ratings?.find(r => r.Source === 'Metacritic');
    if (meta) html += `<div class="rating-badge meta">
        <span class="rb-source">Metacritic</span>
        <span class="rb-value">${meta.Value.split('/')[0]}</span>
        <span class="rb-sub">/ 100</span>
    </div>`;
    placeholder.outerHTML = html || '';
    if (data.Awards && data.Awards !== 'N/A') {
        const body = document.querySelector('.film-body');
        if (body && !body.querySelector('.awards-text')) {
            const awd = document.createElement('div');
            awd.className = 'awards-text';
            awd.textContent = `🏆 ${data.Awards}`;
            body.insertBefore(awd, body.firstChild);
        }
    }
}

async function loadFanartLogo(tmdbId) {
    if (!FANART_KEY) return;
    const data = await cachedFetch(
        `https://webservice.fanart.tv/v3/movies/${tmdbId}?api_key=${FANART_KEY}`, fanartCache);
    if (!data) return;
    const logos  = data.movielogo || [];
    const enLogo = logos.find(l => l.lang === 'en') || logos[0];
    if (!enLogo?.url) return;
    const area = document.getElementById('film-logo-area');
    if (area) area.innerHTML = `<img class="film-logo-fanart" src="${enLogo.url}" alt="">`;
}

async function applyVibrantBackground(imageUrl) {
    if (typeof Vibrant === 'undefined') return;
    try {
        const palette = await new Vibrant(imageUrl, { colorCount:64 }).getPalette();
        const swatch  = palette.DarkMuted || palette.Muted || palette.DarkVibrant;
        if (!swatch) return;
        const overlay = document.getElementById('film-overlay');
        if (overlay) overlay.style.background =
            `linear-gradient(160deg, ${swatch.getHex()}cc 0%, #080808 35%)`;
    } catch {}
}

function openActor(actorId) {
    navigateTo({ view:'actor', actorId });
}

/* ═══════════════════════════════════════════════════════════════
   ACTOR OVERLAY
   NOU: biografie română vs engleză → cea mai lungă
═══════════════════════════════════════════════════════════════ */
async function renderActorOverlay(actorId) {
    const overlay = document.getElementById('actor-overlay');
    const content = document.getElementById('actor-overlay-content');
    overlay.scrollTop = 0;

    content.innerHTML = `
        <div style="position:relative;padding-top:70px;padding-left:28px">
            <div class="overlay-close-bar">
                <button class="btn-home-overlay" onclick="goHome()"><i class="fas fa-home"></i> HOME</button>
                <button class="btn-close-overlay" onclick="closeActorOverlay()">✕</button>
            </div>
            <div class="loading-inline" style="padding:60px 0">
                <i class="fas fa-circle-notch fa-spin" style="color:var(--accent)"></i>
                Se încarcă datele actorului...
            </div>
        </div>`;

    // Fetch RO și EN în paralel
    const [personRo, personEn] = await Promise.all([
        cachedFetch(
            `${TMDB_BASE}/person/${actorId}?api_key=${TMDB_KEY}&language=ro-RO&append_to_response=movie_credits,tv_credits,images`,
            tmdbCache
        ),
        cachedFetch(
            `${TMDB_BASE}/person/${actorId}?api_key=${TMDB_KEY}&language=en-US&append_to_response=movie_credits,tv_credits,images`,
            tmdbCache
        )
    ]);

    const person = personRo || personEn;
    if (!person) {
        content.innerHTML = `<div style="padding:80px 40px;text-align:center;color:var(--text-muted)">
            Nu s-au putut încărca datele actorului.
            <br><br><button class="btn-home-overlay" onclick="closeActorOverlay()">← Înapoi</button>
        </div>`;
        return;
    }

    // Biografie cea mai lungă dintre RO și EN
    const bioRo    = personRo?.biography || '';
    const bioEn    = personEn?.biography || '';
    const bio      = bioRo.length >= bioEn.length ? bioRo : bioEn;
    const bioLang  = bioRo.length >= bioEn.length ? '' : ' (EN)';

    const shortBio = bio.length > 500 ? bio.slice(0,500)+'…' : bio;

    const photos   = (person.images?.profiles||[]).slice(0,8);
    const photoUrl = person.profile_path ? `${IMG_BASE}w342${person.profile_path}` : null;

    const seen = new Set();
    const movies = (person.movie_credits?.cast||[])
        .filter(m=>{ if(seen.has(m.id)) return false; seen.add(m.id); return m.poster_path; })
        .sort((a,b)=>(b.popularity||0)-(a.popularity||0)).slice(0,30);
    const seenTv = new Set();
    const tvShows = (person.tv_credits?.cast||[])
        .filter(t=>{ if(seenTv.has(t.id)) return false; seenTv.add(t.id); return t.poster_path; })
        .sort((a,b)=>(b.popularity||0)-(a.popularity||0)).slice(0,20);

    const bday     = person.birthday
        ? new Date(person.birthday).toLocaleDateString('ro-RO',{day:'numeric',month:'long',year:'numeric'}) : null;
    const deathday = person.deathday
        ? new Date(person.deathday).toLocaleDateString('ro-RO',{day:'numeric',month:'long',year:'numeric'}) : null;

    content.innerHTML = `
        <div style="position:relative">
            <div class="overlay-close-bar">
                <button class="btn-home-overlay" onclick="goHome()"><i class="fas fa-home"></i> HOME</button>
                <button class="btn-close-overlay" onclick="closeActorOverlay()">✕</button>
            </div>
            <div class="actor-header-block">
                <div class="actor-photo-wrap">
                    ${photoUrl
                        ? `<img src="${photoUrl}" alt="${esc(person.name)}">`
                        : `<div class="actor-photo-placeholder"><i class="fas fa-user"></i></div>`}
                </div>
                <div class="actor-info-block">
                    <h1 class="actor-name-title">${esc(person.name)}</h1>
                    <div class="actor-facts">
                        ${bday ? `<div class="actor-fact"><i class="fas fa-birthday-cake"></i> ${bday}${deathday?' — '+deathday:''}</div>` : ''}
                        ${person.place_of_birth ? `<div class="actor-fact"><i class="fas fa-map-marker-alt"></i> ${esc(person.place_of_birth)}</div>` : ''}
                        ${person.known_for_department ? `<div class="actor-fact"><i class="fas fa-film"></i> ${esc(person.known_for_department)}</div>` : ''}
                    </div>
                    ${bioLang ? `<div class="lang-note" style="font-size:.72rem;color:var(--text-dim);margin-bottom:4px">📖 Biografie în engleză</div>` : ''}
                    <p class="actor-bio-text" id="actor-bio-text">${esc(shortBio)}</p>
                    ${bio.length>500 ? `<button class="read-more-btn" onclick="toggleActorBio()">Citește mai mult ↓</button>` : ''}
                </div>
            </div>
            ${photos.length>1 ? `
            <div class="filmography-section">
                <div class="section-title">Galerie Foto</div>
                <div class="gallery-scroll">
                    ${photos.map(p=>`<img class="gallery-img" src="${IMG_BASE}w342${p.file_path}" loading="lazy"
                        onclick="window.open('${IMG_BASE}original${p.file_path}','_blank')" alt="">`).join('')}
                </div>
            </div>` : ''}
            ${movies.length ? `
            <div class="filmography-section">
                <div class="section-title">Filmografie</div>
                <div class="filmography-scroll">
                    ${movies.map(m=>`
                        <div class="filmo-card" onclick="openFilmFromActor(${m.id})">
                            <img src="${IMG_BASE}w185${m.poster_path}" alt="${esc(m.title||'')}" loading="lazy">
                            <p>${esc(m.title||'')}</p>
                            <span>${m.release_date?m.release_date.slice(0,4):''}</span>
                        </div>`).join('')}
                </div>
            </div>` : ''}
            ${tvShows.length ? `
            <div class="filmography-section">
                <div class="section-title">Seriale</div>
                <div class="filmography-scroll">
                    ${tvShows.map(t=>`
                        <div class="filmo-card">
                            <img src="${IMG_BASE}w185${t.poster_path}" alt="${esc(t.name||'')}" loading="lazy">
                            <p>${esc(t.name||'')}</p>
                            <span>${t.first_air_date?t.first_air_date.slice(0,4):''}</span>
                        </div>`).join('')}
                </div>
            </div>` : ''}
            <div style="height:60px"></div>
        </div>`;

    window._fullActorBio = bio;
}

function toggleActorBio() {
    const el  = document.getElementById('actor-bio-text');
    const btn = el?.nextElementSibling;
    if (!el||!btn) return;
    if (el.dataset.expanded) {
        el.textContent = (window._fullActorBio||'').slice(0,500)+'…';
        btn.textContent = 'Citește mai mult ↓';
        delete el.dataset.expanded;
    } else {
        el.textContent = window._fullActorBio||'';
        btn.textContent = 'Restrânge ↑';
        el.dataset.expanded = '1';
    }
}

function openFilmFromActor(movieId) {
    navigateTo({ view:'film', movieId, actorId:null });
}

/* ─── NOMINALIZĂRI PROPRII ─────────────────────────────────── */
async function getOwnNominations(filmTitle, releaseYear) {
    const normalTitle = normStr(filmTitle);
    const results     = [];
    const allYears    = Object.keys(window.dbMap||{}).sort((a,b)=>b-a);
    const yearsToScan = allYears.filter(y => !releaseYear || Math.abs(Number(y)-releaseYear)<=3);
    for (const year of yearsToScan) {
        for (const fest of (window.dbMap[year]||[])) {
            const data = await loadFestivalData(year, fest);
            if (!data) continue;
            for (const cat of data.categorii) {
                for (const nom of cat.nominalizari) {
                    if (normStr(nom.film) === normalTitle) {
                        results.push({
                            festival: data.festival, an: data.an,
                            categorie: cat.nume, castigator: nom.castigator,
                            persoana: nom.persoana||null,
                        });
                    }
                }
            }
        }
    }
    return results;
}

/* ─── SCROLL CU MOUSE-WHEEL ─────────────────────────────────── */
document.addEventListener('wheel', (e) => {
    const row = e.target.closest('.row-films,.gallery-scroll,.cast-scroll,.similar-scroll,.filmography-scroll,.videos-list');
    if (!row) return;
    e.preventDefault();
    row.scrollLeft += e.deltaY * 1.5;
}, { passive: false });

/* ─── UTILITAR ─────────────────────────────────────────────── */
function esc(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
        .replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}

/* ─── INIT ──────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
    const sel = document.getElementById('year-select');
    if (window.dbMap) {
        Object.keys(window.dbMap).sort((a,b)=>b-a).forEach(year => {
            const opt = document.createElement('option');
            opt.value = year;
            opt.textContent = year;
            sel.appendChild(opt);
        });
    }
    history.replaceState({ view:'idle', year:null, festival:null, movieId:null, actorId:null, scrollY:0 }, '');
    renderIdleView();
    initCustomScrollbar();
});

/* ═══════════════════════════════════════════════════════════════
   SCROLLBAR CUSTOM — fix dreapta, bulină drag
   Înlocuiește scrollbar-ul nativ cu un track subțire + mâner
   pe care utilizatorul îl poate trage controlat sus/jos.
═══════════════════════════════════════════════════════════════ */
function initCustomScrollbar() {
    // Ascunde scrollbar-ul nativ
    const hideStyle = document.createElement('style');
    hideStyle.textContent = `
        html { scrollbar-width: none; }
        html::-webkit-scrollbar { display: none; }
    `;
    document.head.appendChild(hideStyle);

    const track = document.createElement('div');
    track.id = 'custom-scrollbar-track';
    const thumb = document.createElement('div');
    thumb.id = 'custom-scrollbar-thumb';
    track.appendChild(thumb);
    document.body.appendChild(track);

    // Calculează și setează poziția mânerului
    function updateThumb() {
        const docH    = document.documentElement.scrollHeight;
        const winH    = window.innerHeight;
        const scrollY = window.scrollY;
        const trackH  = track.offsetHeight;

        if (docH <= winH) { track.style.opacity = '0'; return; }
        track.style.opacity = '1';

        // Înălțimea mânerului proporțională cu pagina vizibilă
        const thumbH   = Math.max(40, (winH / docH) * trackH);
        // Poziția top în funcție de cât am scrollat
        const thumbTop = (scrollY / (docH - winH)) * (trackH - thumbH);

        thumb.style.height = thumbH + 'px';
        thumb.style.top    = thumbTop + 'px';  // top, nu transform
    }

    window.addEventListener('scroll', updateThumb, { passive: true });
    window.addEventListener('resize', updateThumb);
    // Apelăm și când conținutul se schimbă (render nou)
    const observer = new MutationObserver(updateThumb);
    observer.observe(document.getElementById('app-viewport'), { childList: true, subtree: true });
    updateThumb();

    // ── Drag pe mâner ────────────────────────────────────────────
    let isDragging   = false;
    let dragStartY   = 0;
    let dragStartScroll = 0;

    thumb.addEventListener('mousedown', (e) => {
        isDragging      = true;
        dragStartY      = e.clientY;
        dragStartScroll = window.scrollY;
        document.body.style.userSelect = 'none';
        thumb.style.transition = 'none'; // fără animație în timp ce tragi
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const docH   = document.documentElement.scrollHeight;
        const winH   = window.innerHeight;
        const trackH = track.offsetHeight;
        const thumbH = thumb.offsetHeight;
        const ratio  = (docH - winH) / (trackH - thumbH);
        window.scrollTo({ top: dragStartScroll + (e.clientY - dragStartY) * ratio });
    });

    document.addEventListener('mouseup', () => {
        if (!isDragging) return;
        isDragging = false;
        document.body.style.userSelect = '';
        thumb.style.transition = '';
    });

    // ── Click pe track → sare la poziție ────────────────────────
    track.addEventListener('click', (e) => {
        if (e.target === thumb) return;
        const rect   = track.getBoundingClientRect();
        const ratio  = (e.clientY - rect.top) / track.offsetHeight;
        const docH   = document.documentElement.scrollHeight;
        const winH   = window.innerHeight;
        window.scrollTo({ top: ratio * (docH - winH), behavior: 'smooth' });
    });

    // ── Touch drag ───────────────────────────────────────────────
    let touchStartY      = 0;
    let touchStartScroll = 0;
    thumb.addEventListener('touchstart', (e) => {
        touchStartY      = e.touches[0].clientY;
        touchStartScroll = window.scrollY;
        e.preventDefault();
    }, { passive: false });
    thumb.addEventListener('touchmove', (e) => {
        const docH   = document.documentElement.scrollHeight;
        const winH   = window.innerHeight;
        const trackH = track.offsetHeight;
        const thumbH = thumb.offsetHeight;
        const ratio  = (docH - winH) / (trackH - thumbH);
        window.scrollTo({ top: touchStartScroll + (e.touches[0].clientY - touchStartY) * ratio });
        e.preventDefault();
    }, { passive: false });
}
