/* ============================================================
   MOJIN TIME · LA CARPA
   Player, interactions & visual system
   ============================================================ */
(() => {
  'use strict';

  const D = window.MOJIN_DATA;
  if (!D || !Array.isArray(D.sessions)) return;

  const $  = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(pointer: fine)').matches;
  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
  const pad = n => String(n).padStart(2, '0');

  const MONTHS_SHORT = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];
  const MONTHS_LONG = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const WEEKDAYS = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];

  const parseDate = iso => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d, 12, 0, 0);
  };
  const fmtDate = iso => {
    const d = parseDate(iso);
    return `${pad(d.getDate())} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
  };
  const fmtDateLong = iso => {
    const d = parseDate(iso);
    const wd = WEEKDAYS[d.getDay()];
    return `${wd.charAt(0).toUpperCase() + wd.slice(1)}, ${d.getDate()} de ${MONTHS_LONG[d.getMonth()]} de ${d.getFullYear()}`;
  };
  const fmtWeekday = iso => {
    const wd = WEEKDAYS[parseDate(iso).getDay()];
    return wd.charAt(0).toUpperCase() + wd.slice(1);
  };
  const fmtTime = sec => {
    if (!Number.isFinite(sec) || sec < 0) sec = 0;
    sec = Math.floor(sec);
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
  };
  const shortDur = sec => {
    if (!Number.isFinite(sec)) sec = 0;
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return h > 0 ? `${h}h ${pad(m)}m` : `${m}m`;
  };
  const longDur = sec => {
    if (!Number.isFinite(sec)) sec = 0;
    const h = Math.floor(sec / 3600);
    const m = Math.round((sec % 3600) / 60);
    return h > 0 ? `${h} h ${pad(m)} min` : `${m} min`;
  };
  const fmtSize = bytes => {
    if (!Number.isFinite(bytes)) return '';
    if (bytes >= 1000000000) {
      return (bytes / 1000000000).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' GB';
    }
    return Math.round(bytes / 1000000).toLocaleString('es-ES') + ' MB';
  };
  const fmtViews = n => Number(n || 0).toLocaleString('es-ES');
  const esc = str => String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = str => String(str ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  const store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
      } catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
    }
  };

  /* ---------------- data ---------------- */
  const byId = new Map(D.sessions.map(s => [s.id, s]));
  const latest = D.sessions[0];
  const featuredLocal = new Map();
  D.featured.forEach(f => { if (f.local) featuredLocal.set(f.id, f.local); });

  /* ---------------- saved state ---------------- */
  const saved = store.get('mojin:player', null) || {};
  const savedSession = saved.id && byId.get(saved.id) ? byId.get(saved.id) : latest;
  const state = {
    query: '',
    year: 'all',
    sort: 'recent',
    shown: 30,
    current: savedSession,
    playing: false,
    loading: false,
    repeat: Number.isFinite(saved.repeat) ? saved.repeat : 0,
    shuffle: !!saved.shuffle,
    favorites: new Set(Array.isArray(store.get('mojin:favs', [])) ? store.get('mojin:favs', []) : []),
    miniClosed: !!saved.miniClosed,
    hasInteracted: false,
    pendingSeek: saved.id === savedSession.id ? Math.max(0, Number(saved.time) || 0) : 0,
    restoreNotified: false,
    initialized: false
  };
  let savedVolume = Number.isFinite(saved.volume) ? clamp(saved.volume, 0, 1) : 0.85;
  let savedSpeed = Number.isFinite(saved.speed) && saved.speed > 0 ? saved.speed : 1;

  /* ---------------- DOM ---------------- */
  const audio = new Audio();
  audio.preload = 'metadata';
  audio.crossOrigin = 'anonymous';

  const el = {
    loader: $('#loader'), loaderBar: $('#loaderBar'), loaderPct: $('#loaderPct'),
    head: $('#siteHead'), menuToggle: $('#menuToggle'), mobileMenu: $('#mobileMenu'), menuClose: $('#menuClose'),
    progress: $('#scrollProgress'),
    playerDeck: $('#playerDeck'), playerStatus: $('#playerStatus'),
    deckArtImg: $('#deckArtImg'), deckYear: $('#deckYear'), deckDate: $('#deckDate'),
    deckTitle: $('#deckTitle'), deckSub: $('#deckSub'), deckTag: $('#deckTag'), deckSpecial: $('#deckSpecial'), deckCode: $('#deckCode'),
    seek: $('#seek'), timeNow: $('#timeNow'), timeLeft: $('#timeLeft'), timeTotal: $('#timeTotal'),
    btnPlay: $('#btnPlay'), btnPrev: $('#btnPrev'), btnNext: $('#btnNext'), btnShuffle: $('#btnShuffle'),
    btnRepeat: $('#btnRepeat'), btnFav: $('#btnFav'), btnDownload: $('#btnDownload'), btnArchive: $('#btnArchive'),
    volume: $('#volume'), btnMute: $('#btnMute'), btnSpeed: $('#btnSpeed'), viz: $('#viz'),
    playlist: $('#playlist'), plCount: $('#plCount'), plEmpty: $('#plEmpty'), plEmptyText: $('#plEmpty p'),
    search: $('#searchInput'), searchClear: $('#searchClear'), yearChips: $('#yearChips'), sort: $('#sortSelect'),
    btnMore: $('#btnMore'), moreCount: $('#moreCount'), resetFilters: $('#resetFilters'), btnRandom: $('#btnRandom'),
    specialsRail: $('#specialsRail'), specialsPrev: $('#specialsPrev'), specialsNext: $('#specialsNext'),
    ytGrid: $('#ytGrid'),
    videoModal: $('#videoModal'), videoEmbed: $('#videoEmbed'), videoModalTitle: $('#videoModalTitle'),
    videoMeta: $('#videoMeta'), videoLink: $('#videoLink'), videoClose: $('#videoClose'),
    liveModal: $('#liveModal'), twitchEmbed: $('#twitchEmbed'), liveClose: $('#liveClose'),
    liveLastTitle: $('#liveLastTitle'), liveLastDate: $('#liveLastDate'),
    mini: $('#miniPlayer'), miniArt: $('#miniArt'), miniKicker: $('#miniKicker'), miniTitle: $('#miniTitle'),
    miniSub: $('#miniSub'), miniProgress: $('#miniProgress'), miniPlay: $('#miniPlay'), miniOpen: $('#miniOpen'),
    miniExpand: $('#miniExpand'), miniClose: $('#miniClose'),
    posterArt: $('#heroPosterArt'), posterDate: $('#posterDate'), posterDuration: $('#posterDuration'),
    year: $('#year'), toast: $('#toast'), easter: $('#easterEgg'),
    heroCanvas: $('#heroCanvas'), hero: $('.hero'),
    cursor: $('#cursor'), backTop: $('#backTop')
  };

  /* ---------------- small helpers ---------------- */
  let toastTimer = 0;
  function toast(message, duration = 2800) {
    if (!el.toast) return;
    el.toast.textContent = message;
    el.toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove('is-visible'), duration);
  }

  function ensureAudioContext() {
    if (state.audioCtx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    try {
      state.audioCtx = new Ctx();
      state.analyser = state.audioCtx.createAnalyser();
      state.analyser.fftSize = 128;
      state.analyser.smoothingTimeConstant = .82;
      state.analyserData = new Uint8Array(state.analyser.frequencyBinCount);
      state.source = state.audioCtx.createMediaElementSource(audio);
      state.source.connect(state.analyser);
      state.analyser.connect(state.audioCtx.destination);
    } catch {
      state.audioCtx = null;
      state.analyser = null;
    }
  }
  function resumeAudioContext() {
    if (state.audioCtx && state.audioCtx.state === 'suspended') {
      state.audioCtx.resume().catch(() => {});
    }
  }

  function setStatus(status) {
    if (el.playerStatus) el.playerStatus.textContent = status;
    if (el.miniKicker) {
      if (status === 'SONANDO') el.miniKicker.textContent = 'SUENA AHORA';
      else if (status === 'CARGANDO') el.miniKicker.textContent = 'CARGANDO';
      else if (status === 'ERROR') el.miniKicker.textContent = 'ERROR';
      else el.miniKicker.textContent = 'EN PAUSA';
    }
  }

  function setPlaying(value) {
    state.playing = !!value;
    if (el.playerDeck) {
      el.playerDeck.classList.toggle('is-playing', state.playing);
      el.playerDeck.classList.toggle('is-paused', !state.playing);
    }
    if (el.mini) el.mini.classList.toggle('is-playing', state.playing);
    if (el.btnPlay) el.btnPlay.setAttribute('aria-label', state.playing ? 'Pausar' : 'Reproducir');
    if (el.miniPlay) el.miniPlay.setAttribute('aria-label', state.playing ? 'Pausar' : 'Reproducir');
    if (state.playing) {
      setStatus('SONANDO');
      document.title = state.current ? `▶ ${state.current.title} · Mojin Time` : 'Mojin Time — La carpa nunca cierra';
    } else {
      setStatus(state.loading ? 'CARGANDO' : 'EN PAUSA');
      document.title = 'Mojin Time — La carpa nunca cierra · DJ, directos y archivo';
    }
    updateMediaSession();
    updateMiniVisibility();
  }
  function setLoading(value) {
    state.loading = !!value;
    if (el.playerDeck) el.playerDeck.classList.toggle('is-loading', state.loading);
    if (state.loading) setStatus('CARGANDO');
    else if (state.playing) setStatus('SONANDO');
    else if (state.current) setStatus('EN PAUSA');
  }

  function setRangeFill(input, percent) {
    if (!input) return;
    input.style.setProperty('--val', `${clamp(percent, 0, 100)}%`);
  }

  function setSessionUI(session) {
    if (!session) return;
    const local = featuredLocal.get(session.id);
    const cover = local || session.cover || session.spectrogram;
    if (el.deckArtImg) {
      if (cover) {
        el.deckArtImg.style.backgroundImage = `linear-gradient(145deg, rgba(0,42,145,.92), rgba(0,210,255,.34)), url("${cover}")`;
        el.deckArtImg.style.backgroundBlendMode = 'multiply';
      } else {
        el.deckArtImg.style.backgroundImage = 'radial-gradient(circle at 40% 30%, rgba(18,104,255,.7), rgba(2,5,12,.9))';
        el.deckArtImg.style.backgroundBlendMode = 'normal';
      }
    }
    if (el.deckTitle) el.deckTitle.textContent = session.title;
    if (el.deckYear) el.deckYear.textContent = session.year || '';
    if (el.deckDate) el.deckDate.textContent = fmtDate(session.date);
    if (el.deckTag) el.deckTag.textContent = session.label.toUpperCase();
    if (el.deckSpecial) el.deckSpecial.hidden = !session.special;
    if (el.deckSub) el.deckSub.textContent = `${fmtDateLong(session.date)} · ${fmtSize(session.size)}`;
    if (el.btnDownload) el.btnDownload.href = session.download;
    if (el.btnArchive) el.btnArchive.href = D.site.archiveUrl;
    if (el.btnFav) {
      const fav = state.favorites.has(session.id);
      el.btnFav.classList.toggle('is-active', fav);
      el.btnFav.setAttribute('aria-pressed', String(fav));
    }
    updateMediaSession();
    updateMini();
    markActiveRows();
  }

  function updateMini() {
    const s = state.current;
    if (!s) return;
    const local = featuredLocal.get(s.id);
    const cover = local || s.cover || s.spectrogram;
    if (el.miniArt) {
      el.miniArt.style.backgroundImage = cover
        ? `linear-gradient(145deg, rgba(0,42,145,.9), rgba(0,210,255,.3)), url("${cover}")`
        : 'radial-gradient(circle at 40% 30%, rgba(18,104,255,.7), rgba(2,5,12,.9))';
      el.miniArt.style.backgroundBlendMode = cover ? 'multiply' : 'normal';
    }
    if (el.miniTitle) el.miniTitle.textContent = s.title;
    if (el.miniSub) el.miniSub.textContent = `${fmtDate(s.date)} · ${s.durationLabel}`;
    if (state.loading) el.miniKicker.textContent = 'CARGANDO';
    else if (state.playing) el.miniKicker.textContent = 'SUENA AHORA';
    else el.miniKicker.textContent = 'EN PAUSA';
  }

  function updateMiniVisibility() {
    if (!el.mini) return;
    const y = window.scrollY || 0;
    const deck = el.playerDeck;
    let deckVisible = false;
    if (deck) {
      const r = deck.getBoundingClientRect();
      deckVisible = r.top < window.innerHeight - 100 && r.bottom > 120;
    }
    const footer = document.querySelector('.site-foot');
    const footerVisible = !!footer && footer.getBoundingClientRect().top < window.innerHeight - 60;
    const should = !!state.current && !state.miniClosed && (state.hasInteracted || y > 700) && !deckVisible && !footerVisible;
    el.mini.classList.toggle('is-visible', should);
  }

  function markActiveRows() {
    const id = state.current?.id;
    $$('.track-row', el.playlist).forEach(row => row.classList.toggle('is-active', row.dataset.id === id));
  }

  /* ---------------- media session ---------------- */
  function updateMediaSession() {
    if (!('mediaSession' in navigator) || !state.current) return;
    const s = state.current;
    const art = featuredLocal.get(s.id) || s.cover || s.spectrogram;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: s.title,
        artist: 'Mojin Time',
        album: 'La Carpa',
        artwork: [
          { src: art || 'assets/img/avatar.webp', sizes: '512x512', type: art?.endsWith('.png') ? 'image/png' : 'image/webp' },
          { src: 'assets/img/avatar.webp', sizes: '900x900', type: 'image/webp' }
        ]
      });
      navigator.mediaSession.playbackState = state.playing ? 'playing' : 'paused';
    } catch {}
  }
  function setMediaHandlers() {
    if (!('mediaSession' in navigator)) return;
    const handlers = {
      play: () => playAudio(),
      pause: () => audio.pause(),
      previoustrack: () => prevTrack(),
      nexttrack: () => nextTrack(),
      seekbackward: () => { audio.currentTime = Math.max(0, audio.currentTime - 15); },
      seekforward: () => { audio.currentTime = Math.min(audio.duration || Infinity, audio.currentTime + 15); },
      stop: () => { audio.pause(); audio.currentTime = 0; }
    };
    Object.entries(handlers).forEach(([name, fn]) => {
      try { navigator.mediaSession.setActionHandler(name, fn); } catch {}
    });
  }

  /* ---------------- audio ---------------- */
  function loadSession(session, { autoplay = false, seek = 0 } = {}) {
    if (!session) return;
    const changed = state.current?.id !== session.id;
    state.current = session;
    state.pendingSeek = Math.max(0, seek || 0);
    if (changed) {
      audio.src = session.audio;
      audio.load();
      state.restoreNotified = false;
    }
    setSessionUI(session);
    saveState(true);
    if (autoplay) playAudio();
    else {
      setLoading(false);
      setStatus(state.pendingSeek > 5 ? 'LISTO · CONTINÚA' : 'LISTO PARA SONAR');
      updateMiniVisibility();
    }
  }

  function playAudio() {
    if (!state.current) loadSession(latest, { autoplay: false });
    state.hasInteracted = true;
    state.miniClosed = false;
    ensureAudioContext();
    resumeAudioContext();
    setLoading(true);
    updateMiniVisibility();
    const promise = audio.play();
    if (promise && typeof promise.then === 'function') {
      promise.then(() => {
        setLoading(false);
        state.hasInteracted = true;
        updateMiniVisibility();
      }).catch(() => {
        setLoading(false);
        setPlaying(false);
        setStatus('LISTO PARA SONAR');
        toast('Pulsa play otra vez para iniciar el audio');
      });
    }
  }

  function togglePlay() {
    if (!state.current) {
      loadSession(latest, { autoplay: true });
      return;
    }
    if (audio.paused) playAudio();
    else audio.pause();
  }

  function nextTrack(auto = false) {
    if (!state.current) { loadSession(latest, { autoplay: true }); return; }
    let next;
    if (state.shuffle) {
      const pool = D.sessions.filter(s => s.id !== state.current.id);
      next = pool[Math.floor(Math.random() * pool.length)];
    } else {
      const idx = D.sessions.findIndex(s => s.id === state.current.id);
      if (idx === D.sessions.length - 1) {
        if (auto && state.repeat !== 1) {
          audio.pause();
          setStatus('FIN DE LA CARPA');
          toast('Has llegado al final. La carpa sigue abierta cuando quieras.');
          return;
        }
        next = D.sessions[0];
      } else {
        next = D.sessions[idx + 1];
      }
    }
    loadSession(next, { autoplay: true });
  }

  function prevTrack() {
    if (!state.current) return;
    if (audio.currentTime > 8) { audio.currentTime = 0; return; }
    const idx = D.sessions.findIndex(s => s.id === state.current.id);
    const prev = idx <= 0 ? D.sessions[D.sessions.length - 1] : D.sessions[idx - 1];
    loadSession(prev, { autoplay: true });
  }

  function playRandom() {
    const pool = getFiltered().length > 1 ? getFiltered() : D.sessions;
    let pick = pool[Math.floor(Math.random() * pool.length)];
    if (pool.length > 1 && pick.id === state.current?.id) {
      pick = pool[(pool.indexOf(pick) + 1) % pool.length];
    }
    loadSession(pick, { autoplay: true });
    toast(`Sesión aleatoria: ${fmtDate(pick.date)} · ${pick.title}`);
  }

  function playLatest() {
    if (state.current?.id === latest.id && !audio.paused) {
      audio.pause();
      return;
    }
    if (state.current?.id === latest.id) {
      playAudio();
    } else {
      loadSession(latest, { autoplay: true });
    }
    toast(`Sonando la última sesión · ${fmtDate(latest.date)}`);
  }

  function handleEnded() {
    if (state.repeat === 2) {
      audio.currentTime = 0;
      playAudio();
      return;
    }
    if (state.shuffle) {
      nextTrack(true);
      return;
    }
    const idx = D.sessions.findIndex(s => s.id === state.current?.id);
    if (idx < D.sessions.length - 1) {
      loadSession(D.sessions[idx + 1], { autoplay: true });
    } else if (state.repeat === 1) {
      loadSession(D.sessions[0], { autoplay: true });
    } else {
      setPlaying(false);
      setLoading(false);
      setStatus('FIN DE LA CARPA');
      updateProgress();
    }
  }

  function updateProgress() {
    const s = state.current;
    if (!s) return;
    const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : (s.duration || 0);
    const current = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
    const ratio = duration > 0 ? clamp(current / duration, 0, 1) : 0;
    if (el.seek) {
      el.seek.value = String(Math.round(ratio * 1000));
      setRangeFill(el.seek, ratio * 100);
    }
    if (el.timeNow) el.timeNow.textContent = fmtTime(current);
    if (el.timeTotal) el.timeTotal.textContent = fmtTime(duration);
    if (el.timeLeft) el.timeLeft.textContent = '-' + fmtTime(Math.max(0, duration - current));
    if (el.miniProgress) el.miniProgress.style.width = `${ratio * 100}%`;
    if ('mediaSession' in navigator && duration > 0 && Number.isFinite(current)) {
      try {
        navigator.mediaSession.setPositionState({ duration, playbackRate: audio.playbackRate || 1, position: clamp(current, 0, duration) });
      } catch {}
    }
    if (state.playing && Date.now() - state.savedAt > 5000) saveState();
  }

  function saveState(force = false) {
    const now = Date.now();
    if (!force && now - state.savedAt < 4000) return;
    state.savedAt = now;
    store.set('mojin:player', {
      id: state.current?.id || latest.id,
      time: Number.isFinite(audio.currentTime) ? Math.round(audio.currentTime) : 0,
      volume: savedVolume,
      speed: savedSpeed,
      shuffle: state.shuffle,
      repeat: state.repeat,
      miniClosed: state.miniClosed
    });
  }

  function updateRepeatUI(announce = false) {
    if (!el.btnRepeat) return;
    const active = state.repeat > 0;
    el.btnRepeat.classList.toggle('is-active', active);
    el.btnRepeat.setAttribute('aria-pressed', String(active));
    const use = el.btnRepeat.querySelector('use');
    if (use) use.setAttribute('href', state.repeat === 2 ? '#i-repeat-one' : '#i-repeat');
    el.btnRepeat.setAttribute('aria-label', state.repeat === 0 ? 'Repetir: desactivado' : state.repeat === 1 ? 'Repetir: todo' : 'Repetir: una sesión');
    if (announce) toast(state.repeat === 0 ? 'Repetición desactivada' : state.repeat === 1 ? 'Repetir todo el archivo' : 'Repetir esta sesión');
  }

  function updateFavChip() {
    let chip = el.yearChips.querySelector('[data-year="fav"]');
    if (!chip) {
      chip = document.createElement('button');
      chip.className = 'chip';
      chip.dataset.year = 'fav';
      chip.innerHTML = 'Favoritas <span>0</span>';
      el.yearChips.appendChild(chip);
    }
    const count = el.yearChips.querySelector('[data-year="fav"] span');
    if (count) count.textContent = state.favorites.size;
  }

  function toggleFavorite() {
    if (!state.current) return;
    const id = state.current.id;
    if (state.favorites.has(id)) {
      state.favorites.delete(id);
      toast('Sesión quitada de favoritas');
    } else {
      state.favorites.add(id);
      toast('Sesión guardada en favoritas ♥');
    }
    store.set('mojin:favs', [...state.favorites]);
    if (el.btnFav) {
      const fav = state.favorites.has(id);
      el.btnFav.classList.toggle('is-active', fav);
      el.btnFav.setAttribute('aria-pressed', String(fav));
    }
    updateFavChip();
    if (state.year === 'fav') renderPlaylist(true);
  }

  function applyVolume(value, save = true) {
    savedVolume = clamp(value, 0, 1);
    audio.volume = savedVolume;
    audio.muted = false;
    if (el.volume) {
      el.volume.value = String(Math.round(savedVolume * 100));
      setRangeFill(el.volume, savedVolume * 100);
    }
    if (el.btnMute) {
      const use = el.btnMute.querySelector('use');
      if (use) use.setAttribute('href', savedVolume === 0 ? '#i-mute' : '#i-volume');
      el.btnMute.setAttribute('aria-label', savedVolume === 0 ? 'Activar sonido' : 'Silenciar');
    }
    if (save) saveState(true);
  }

  function toggleMute() {
    if (audio.muted || savedVolume === 0) {
      audio.muted = false;
      if (savedVolume === 0) applyVolume(.6);
      else {
        audio.volume = savedVolume;
        if (el.volume) setRangeFill(el.volume, savedVolume * 100);
        const use = el.btnMute.querySelector('use');
        if (use) use.setAttribute('href', '#i-volume');
        el.btnMute.setAttribute('aria-label', 'Silenciar');
      }
      toast('Sonido activado');
    } else {
      audio.muted = true;
      const use = el.btnMute.querySelector('use');
      if (use) use.setAttribute('href', '#i-mute');
      el.btnMute.setAttribute('aria-label', 'Activar sonido');
      toast('Silenciado');
    }
  }

  /* ---------------- playlist ---------------- */
  function getFiltered() {
    let list = D.sessions;
    if (state.year === 'fav') list = list.filter(s => state.favorites.has(s.id));
    else if (state.year !== 'all') list = list.filter(s => String(s.year) === String(state.year));
    if (state.query) {
      const q = norm(state.query);
      list = list.filter(s => norm(`${s.title} ${s.label} ${s.dateRaw} ${s.date} ${s.part ? 'parte ' + s.part : ''}`).includes(q));
    }
    if (state.sort === 'oldest') list = [...list].reverse();
    else if (state.sort === 'longest') list = [...list].sort((a, b) => b.duration - a.duration);
    return list;
  }

  function renderPlaylist(reset = false) {
    if (!el.playlist) return;
    if (reset) {
      state.shown = 30;
      el.playlist.scrollTop = 0;
    }
    const list = getFiltered();
    const visible = list.slice(0, state.shown);
    el.playlist.innerHTML = visible.map((s, i) => {
      const d = parseDate(s.date);
      const day = pad(d.getDate());
      const month = MONTHS_SHORT[d.getMonth()];
      const label = s.special ? 'ESPECIAL' : s.part ? `PARTE ${s.part}` : 'SESIÓN';
      return `<div class="track-row" data-id="${s.id}">
        <button class="track" data-play-id="${s.id}" aria-label="Reproducir ${esc(s.title)}, ${fmtDate(s.date)}">
          <span class="tr-num"><span class="tr-num-text">${String(i + 1).padStart(3, '0')}</span><span class="tr-eq"><i></i><i></i><i></i></span></span>
          <span class="tr-date"><b>${day}</b><small>${month}</small></span>
          <span class="tr-main"><strong>${esc(s.title)}</strong><em><span class="tr-tag">${label}</span><span>${fmtWeekday(s.date)}</span><span>${s.durationLabel}</span><span>${fmtSize(s.size)}</span></em></span>
          <span class="tr-dur">${shortDur(s.duration)}</span>
        </button>
        <a class="tr-dl" href="${s.download}" target="_blank" rel="noopener" aria-label="Descargar ${esc(s.title)}"><svg><use href="#i-download"></use></svg></a>
      </div>`;
    }).join('');

    if (el.plCount) el.plCount.textContent = list.length;
    if (el.plEmpty) el.plEmpty.hidden = list.length !== 0;
    if (el.plEmptyText) el.plEmptyText.textContent = state.year === 'fav' ? 'Todavía no has guardado ninguna sesión. Pulsa el corazón del reproductor.' : 'No hay sesiones con ese filtro.';
    const remaining = Math.max(0, list.length - state.shown);
    if (el.btnMore) el.btnMore.hidden = remaining === 0;
    if (el.moreCount) el.moreCount.textContent = remaining > 0 ? `(${remaining})` : '';
    if (el.searchClear) el.searchClear.hidden = !state.query;
    markActiveRows();
    updateFavChip();
  }

  function setYear(year) {
    state.year = year;
    $$('.chip', el.yearChips).forEach(b => b.classList.toggle('is-active', b.dataset.year === year));
    renderPlaylist(true);
  }

  /* ---------------- specials ---------------- */
  function renderSpecials() {
    if (!el.specialsRail) return;
    el.specialsRail.innerHTML = D.featured.map(f => {
      const s = byId.get(f.id);
      if (!s) return '';
      const d = parseDate(s.date);
      const img = f.local || s.cover || s.spectrogram;
      return `<button class="special-card" data-play-id="${s.id}" aria-label="Reproducir ${esc(s.title)} del ${fmtDate(s.date)}">
        ${img ? `<img class="sc-img" src="${img}" alt="" loading="lazy">` : ''}
        <span class="sc-tint"></span>
        <span class="sc-top"><span>${esc(f.tag)}</span><span>${s.year}</span></span>
        <span class="sc-big">${pad(d.getDate())}</span>
        <span class="sc-bottom">
          <span class="sc-title">${esc(s.title)}</span>
          <span class="sc-meta"><b>${fmtDate(s.date)}</b><span>${s.durationLabel}</span></span>
        </span>
        <span class="sc-play"><svg><use href="#i-play"></use></svg></span>
      </button>`;
    }).join('');
  }

  /* ---------------- youtube ---------------- */
  function renderVideos(showAll = false) {
    if (!el.ytGrid) return;
    const visible = showAll ? D.videos : D.videos.slice(0, 9);
    el.ytGrid.innerHTML = visible.map((v, i) => {
      const title = `Sesión · ${fmtDate(v.date)}`;
      return `<button class="yt-card" data-video="${v.id}" aria-label="Ver ${esc(title)} en YouTube">
        <img class="yt-thumb" src="${v.thumb}" alt="" loading="${i === 0 ? 'eager' : 'lazy'}" ${i === 0 ? 'fetchpriority="high"' : ''}>
        <span class="yt-top"><span class="yt-date">${fmtDate(v.date)}</span></span>
        <span class="yt-dur">${v.duration ? longDur(v.duration) : 'SESIÓN'}</span>
        <span class="yt-play"><svg><use href="#i-play"></use></svg></span>
        <span class="yt-info"><span class="yt-title">${esc(title)}</span><span class="yt-meta"><b>${fmtViews(v.views)} visualizaciones</b><span>·</span><span>RESUBIDO</span></span></span>
      </button>`;
    }).join('');
    const more = $('#ytMore');
    if (more) more.hidden = showAll;
  }

  function openVideo(id) {
    const v = D.videos.find(x => x.id === id);
    if (!v || !el.videoModal) return;
    if (el.videoModalTitle) el.videoModalTitle.textContent = `Sesión · ${fmtDate(v.date)}`;
    if (el.videoMeta) el.videoMeta.textContent = `${v.title} · ${fmtViews(v.views)} visualizaciones · ${v.duration ? longDur(v.duration) : 'Directo resubido'}`;
    if (el.videoLink) el.videoLink.href = v.url;
    if (el.videoEmbed) {
      el.videoEmbed.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${v.id}?autoplay=1&rel=0&modestbranding=1&playsinline=1&color=white" title="Sesión de Mojin Time del ${fmtDate(v.date)}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>`;
    }
    openDialog(el.videoModal);
  }

  /* ---------------- dialogs ---------------- */
  function syncBodyLock() {
    const anyDialog = !!document.querySelector('dialog[open]');
    const menu = el.mobileMenu?.classList.contains('is-open');
    document.body.classList.toggle('is-locked', anyDialog || menu);
  }
  function openDialog(dialog) {
    if (!dialog) return;
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    syncBodyLock();
  }
  function closeDialog(dialog) {
    if (!dialog) return;
    dialog.close();
    syncBodyLock();
  }
  function clearDialog(dialog) {
    if (dialog === el.videoModal && el.videoEmbed) el.videoEmbed.innerHTML = '';
    if (dialog === el.liveModal && el.twitchEmbed) el.twitchEmbed.innerHTML = '';
    syncBodyLock();
  }

  function openTwitch() {
    if (!el.liveModal || !el.twitchEmbed) return;
    if (location.protocol === 'file:') {
      el.twitchEmbed.innerHTML = `<div class="embed-fallback"><b>El reproductor de Twitch necesita un servidor.</b><p>Abre la web desde tu hosting (o localhost) para ver el directo aquí dentro.</p><a class="btn btn-primary btn-sm" href="${D.site.twitch}" target="_blank" rel="noopener">Abrir Twitch</a></div>`;
    } else {
      const parent = location.hostname || 'localhost';
      el.twitchEmbed.innerHTML = `<iframe src="https://player.twitch.tv/?channel=mojintime&parent=${encodeURIComponent(parent)}&autoplay=true&muted=false" title="Directo de Mojin Time en Twitch" allowfullscreen allow="autoplay; fullscreen; picture-in-picture"></iframe>`;
    }
    openDialog(el.liveModal);
  }

  function setLiveMeta() {
    if (el.liveLastTitle) el.liveLastTitle.textContent = D.stats.lastBroadcastTitle || 'La Carpa · Live DJ Set';
    if (el.liveLastDate && D.stats.lastBroadcast) {
      try {
        const date = new Date(D.stats.lastBroadcast);
        const formatted = new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Europe/Madrid' })
          .format(date).replace('.', '').toUpperCase();
        el.liveLastDate.textContent = `Último directo · ${formatted}`;
      } catch {
        el.liveLastDate.textContent = 'Último directo · 27 NOV 2026';
      }
    }
  }

  /* ---------------- hero visual ---------------- */
  let audioEnergy = 0;
  function initHeroCanvas() {
    const canvas = el.heroCanvas;
    if (!canvas || reduceMotion) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let w = 0, h = 0, dpr = 1;
    let stars = [];
    let raf = 0, last = 0;
    let visible = true;
    let mx = 0, my = 0, tmx = 0, tmy = 0;
    const count = () => window.innerWidth < 720 ? 70 : window.innerWidth < 1200 ? 120 : 165;
    const makeStar = (z = 1) => ({
      x: (Math.random() - .5) * 2.35,
      y: (Math.random() - .5) * 2.35,
      z: z === 1 ? 1 : Math.random() * .95 + .05,
      size: Math.random() * .8 + .5,
      tint: Math.random() > .55 ? 1 : 0
    });
    function resize() {
      const rect = el.hero.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      stars = Array.from({ length: count() }, () => makeStar(Math.random()));
    }
    function draw(now) {
      if (!visible) return;
      const dt = Math.min(50, now - last || 16);
      last = now;
      mx += (tmx - mx) * .04;
      my += (tmy - my) * .04;
      let energy = reduceMotion ? 0 : audioEnergy;
      if (!reduceMotion && state.playing && state.analyser && state.analyserData) {
        state.analyser.getByteFrequencyData(state.analyserData);
        let sum = 0;
        for (let i = 0; i < state.analyserData.length; i++) sum += state.analyserData[i];
        energy = sum / (state.analyserData.length * 255);
        audioEnergy = energy;
      }
      const cx = w * .52 + mx * 34;
      const cy = h * .47 + my * 22;

      ctx.clearRect(0, 0, w, h);

      // slow horizontal audio waves
      for (let layer = 0; layer < 4; layer++) {
        ctx.beginPath();
        const base = h * .68 + layer * 20;
        for (let x = 0; x <= w; x += 20) {
          const p = x / w;
          const y = base
            + Math.sin(p * 9 + now * .00045 + layer * 1.2) * (10 + energy * 22)
            + Math.sin(p * 21 - now * .0007 + layer) * (4 + energy * 10);
          if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = `rgba(52,231,255,${.035 + energy * .045 + layer * .008})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // perspective star tunnel
      for (const s of stars) {
        const prevZ = Math.min(1.2, s.z + .022);
        s.z -= (.045 + energy * .2) * (dt / 1000);
        if (s.z <= .025) {
          s.x = (Math.random() - .5) * 2.35;
          s.y = (Math.random() - .5) * 2.35;
          s.z = 1;
          s.size = Math.random() * .8 + .5;
          continue;
        }
        const f = 1 / (s.z * 1.05 + .08);
        const pf = 1 / (prevZ * 1.05 + .08);
        const x = cx + s.x * w * .55 * f;
        const y = cy + s.y * h * .44 * f;
        const px = cx + s.x * w * .55 * pf;
        const py = cy + s.y * h * .44 * pf;
        if (x < -80 || x > w + 80 || y < -80 || y > h + 80) continue;
        const alpha = clamp((1 - s.z) * .65, .02, .72);
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(x, y);
        ctx.strokeStyle = s.tint
          ? `rgba(52,231,255,${alpha})`
          : `rgba(40,110,255,${alpha * .9})`;
        ctx.lineWidth = Math.max(.5, (1 - s.z) * s.size);
        ctx.stroke();
      }

      // small static dust
      ctx.fillStyle = 'rgba(160,230,255,.22)';
      for (let i = 0; i < 24; i++) {
        const x = ((i * 73.21 + now * .005) % w + w) % w;
        const y = (i * 41.7) % h;
        ctx.fillRect(x, y, 1, 1);
      }
      raf = requestAnimationFrame(draw);
    }
    function start() {
      if (!raf) { last = performance.now(); raf = requestAnimationFrame(draw); }
    }
    function stop() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    }
    resize();
    start();
    window.addEventListener('resize', () => { resize(); });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) stop(); else if (visible) start();
    });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(entries => {
        visible = entries[0].isIntersecting;
        if (visible) start(); else stop();
      }, { threshold: 0 }).observe(el.hero);
    }
    el.hero.addEventListener('pointermove', e => {
      if (!finePointer) return;
      const r = el.hero.getBoundingClientRect();
      tmx = clamp((e.clientX - r.left) / r.width - .5, -.5, .5) * 2;
      tmy = clamp((e.clientY - r.top) / r.height - .5, -.5, .5) * 2;
    }, { passive: true });
    el.hero.addEventListener('pointerleave', () => { tmx = 0; tmy = 0; });
  }

  /* ---------------- visualizer ---------------- */
  function initViz() {
    const canvas = el.viz;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let w = 0, h = 0, dpr = 1, raf = 0, last = 0;
    let active = true;
    function resize() {
      const rect = canvas.getBoundingClientRect();
      w = Math.max(1, rect.width);
      h = Math.max(1, rect.height);
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    function draw(now) {
      if (!active) { raf = 0; return; }
      if (now - last < 33) { raf = requestAnimationFrame(draw); return; }
      last = now;
      resizeIfNeeded();
      ctx.clearRect(0, 0, w, h);
      const bars = 30;
      const gap = 2;
      const bw = Math.max(1, (w - gap * (bars - 1)) / bars);
      const data = state.analyserData;
      let energy = 0;
      if (state.analyser && state.playing) {
        state.analyser.getByteFrequencyData(data);
        for (let i = 0; i < data.length; i++) energy += data[i];
        energy /= data.length * 255;
      } else {
        energy = .07 + Math.max(0, Math.sin(now * .0012)) * .05;
      }
      audioEnergy = energy;
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, 'rgba(52,231,255,.95)');
      grad.addColorStop(1, 'rgba(18,104,255,.35)');
      for (let i = 0; i < bars; i++) {
        let v;
        if (state.analyser && state.playing) {
          const idx = Math.floor((i / bars) * data.length * .72) + 2;
          v = data[Math.min(data.length - 1, idx)] / 255;
        } else {
          v = .12 + Math.abs(Math.sin(now * .0011 + i * .62)) * .28 + Math.abs(Math.sin(now * .0023 + i * .17)) * .12;
        }
        const bh = Math.max(2, v * h * .95);
        const x = i * (bw + gap);
        ctx.fillStyle = grad;
        ctx.globalAlpha = .35 + v * .65;
        ctx.fillRect(x, h - bh, bw, bh);
        ctx.globalAlpha = 1;
        ctx.fillStyle = 'rgba(52,231,255,.55)';
        ctx.fillRect(x, h - bh - 2, bw, 1);
      }
      raf = requestAnimationFrame(draw);
    }
    let lastW = 0, lastH = 0;
    function resizeIfNeeded() {
      const rect = canvas.getBoundingClientRect();
      if (Math.abs(rect.width - lastW) > 1 || Math.abs(rect.height - lastH) > 1) {
        lastW = rect.width; lastH = rect.height; resize();
      }
    }
    resize();
    if (reduceMotion) {
      // single static frame
      const data = state.analyserData;
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, 'rgba(52,231,255,.8)');
      grad.addColorStop(1, 'rgba(18,104,255,.2)');
      for (let i = 0; i < 30; i++) {
        const bh = 3 + Math.abs(Math.sin(i * .9)) * h * .35;
        ctx.fillStyle = grad;
        ctx.fillRect(i * ((w - 58) / 30 + 2), h - bh, ((w - 58) / 30), bh);
      }
      return;
    }
    raf = requestAnimationFrame(draw);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { if (raf) cancelAnimationFrame(raf); raf = 0; }
      else if (!raf && active) { last = 0; raf = requestAnimationFrame(draw); }
    });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(entries => {
        active = entries[0].isIntersecting;
        if (active && !raf) { last = 0; raf = requestAnimationFrame(draw); }
        if (!active && raf) { cancelAnimationFrame(raf); raf = 0; }
      }, { threshold: 0 }).observe(el.playerDeck);
    }
  }

  /* ---------------- header / nav ---------------- */
  function initHeader() {
    let lastY = window.scrollY || 0;
    let ticking = false;
    const sections = ['inicio', 'archivo', 'especiales', 'youtube', 'directo', 'sobre', 'redes'];
    function update() {
      const y = window.scrollY || 0;
      if (el.head) {
        el.head.classList.toggle('is-scrolled', y > 30);
        if (!el.mobileMenu?.classList.contains('is-open')) {
          if (y > lastY && y > 460) el.head.classList.add('is-hidden');
          else if (y < lastY - 4) el.head.classList.remove('is-hidden');
        }
      }
      if (el.progress) {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        el.progress.style.width = `${max > 0 ? (y / max) * 100 : 0}%`;
      }
      let active = 'inicio';
      for (const id of sections) {
        const section = document.getElementById(id);
        if (section && section.getBoundingClientRect().top <= 150) active = id;
      }
      $$('[data-nav]').forEach(link => link.classList.toggle('is-active', link.dataset.nav === active));
      lastY = y;
      updateMiniVisibility();
      ticking = false;
    }
    window.addEventListener('scroll', () => {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }, { passive: true });
    update();
  }

  function initMenu() {
    const background = [document.getElementById('main'), el.head, document.querySelector('.site-foot'), el.mini].filter(Boolean);
    const open = () => {
      if (!el.mobileMenu) return;
      el.mobileMenu.classList.add('is-open');
      el.mobileMenu.setAttribute('aria-hidden', 'false');
      el.menuToggle.setAttribute('aria-expanded', 'true');
      el.menuToggle.setAttribute('aria-label', 'Cerrar menú');
      document.body.classList.add('is-locked');
      background.forEach(node => { try { node.inert = true; } catch {} });
      setTimeout(() => el.menuClose?.focus({ preventScroll: true }), 50);
    };
    const close = () => {
      if (!el.mobileMenu) return;
      el.mobileMenu.classList.remove('is-open');
      el.mobileMenu.setAttribute('aria-hidden', 'true');
      el.menuToggle.setAttribute('aria-expanded', 'false');
      el.menuToggle.setAttribute('aria-label', 'Abrir menú');
      background.forEach(node => { try { node.inert = false; } catch {} });
      syncBodyLock();
      el.menuToggle?.focus({ preventScroll: true });
    };
    el.menuToggle?.addEventListener('click', () => {
      if (el.mobileMenu.classList.contains('is-open')) close(); else open();
    });
    el.menuClose?.addEventListener('click', close);
    $$('a', el.mobileMenu).forEach(a => a.addEventListener('click', close));
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && el.mobileMenu?.classList.contains('is-open')) close();
    });
  }

  /* ---------------- reveal / counters ---------------- */
  function initReveals() {
    const items = $$('.reveal');
    if (!items.length) return;
    if (!('IntersectionObserver' in window)) {
      items.forEach(x => x.classList.add('is-in'));
      return;
    }
    items.forEach((item, i) => {
      item.style.setProperty('--delay', `${Math.min(i % 4, 3) * .06}s`);
    });
    const obs = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          obs.unobserve(entry.target);
        }
      });
    }, { threshold: .08, rootMargin: '0px 0px -8% 0px' });
    items.forEach(item => obs.observe(item));
  }

  function initCounters() {
    const counters = $$('.counter');
    if (!counters.length) return;
    const animate = elc => {
      if (elc.dataset.done) return;
      elc.dataset.done = '1';
      const target = Number(elc.dataset.count || 0);
      const decimals = Number(elc.dataset.decimals || 0);
      const divide = Number(elc.dataset.divide || 1);
      const suffix = elc.dataset.suffix || '';
      const start = performance.now();
      const duration = reduceMotion ? 1 : 1400;
      const step = now => {
        const p = clamp((now - start) / duration, 0, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        let value = (target * eased) / divide;
        const factor = Math.pow(10, decimals);
        value = Math.floor(value * factor) / factor;
        elc.textContent = value.toLocaleString('es-ES', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + suffix;
        if (p < 1) requestAnimationFrame(step);
        else {
          let finalValue = target / divide;
          const factor2 = Math.pow(10, decimals);
          finalValue = Math.floor(finalValue * factor2) / factor2;
          elc.textContent = finalValue.toLocaleString('es-ES', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + suffix;
        }
      };
      requestAnimationFrame(step);
    };
    if (!('IntersectionObserver' in window)) { counters.forEach(animate); return; }
    const obs = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) { animate(entry.target); obs.unobserve(entry.target); }
      });
    }, { threshold: .6 });
    counters.forEach(c => obs.observe(c));
  }

  /* ---------------- cursor ---------------- */
  function initCursor() {
    if (!el.cursor || !finePointer || reduceMotion) return;
    const dot = $('.cursor-dot', el.cursor);
    const ring = $('.cursor-ring', el.cursor);
    let x = -100, y = -100, rx = -100, ry = -100, raf = 0;
    const move = e => {
      x = e.clientX; y = e.clientY;
      el.cursor.classList.add('is-active');
      if (!raf) raf = requestAnimationFrame(loop);
    };
    const loop = () => {
      rx += (x - rx) * .15;
      ry += (y - ry) * .15;
      if (dot) dot.style.transform = `translate(${x}px,${y}px) translate(-50%,-50%)`;
      if (ring) ring.style.transform = `translate(${rx}px,${ry}px) translate(-50%,-50%)`;
      if (Math.abs(x - rx) > .2 || Math.abs(y - ry) > .2) raf = requestAnimationFrame(loop);
      else raf = 0;
    };
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('mouseout', e => { if (!e.relatedTarget) el.cursor.classList.remove('is-active'); });
    document.addEventListener('mouseover', e => {
      if (e.target.closest('a,button,input,select,textarea,.special-card,.yt-card')) el.cursor.classList.add('is-hover');
      else el.cursor.classList.remove('is-hover');
    });
  }

  /* ---------------- magnetic / tilt ---------------- */
  function initMotion() {
    if (reduceMotion || !finePointer) return;
    $$('.btn-primary,.poster-play,.live-open,.rail-btn').forEach(btn => {
      btn.addEventListener('pointermove', e => {
        const r = btn.getBoundingClientRect();
        const dx = (e.clientX - r.left - r.width / 2) * .08;
        const dy = (e.clientY - r.top - r.height / 2) * .12;
        btn.style.transform = `translate(${dx}px,${dy}px)`;
      });
      btn.addEventListener('pointerleave', () => { btn.style.transform = ''; });
    });
    const poster = $('#heroPoster');
    const frame = poster?.querySelector('.poster-frame');
    if (poster && frame) {
      poster.addEventListener('pointermove', e => {
        const r = poster.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - .5;
        const py = (e.clientY - r.top) / r.height - .5;
        frame.style.transform = `rotateY(${px * 10}deg) rotateX(${-py * 8}deg) translateZ(8px)`;
      });
      poster.addEventListener('pointerleave', () => { frame.style.transform = ''; });
    }
  }

  /* ---------------- loader ---------------- */
  function initLoader() {
    let p = 0;
    const set = value => {
      p = clamp(value, 0, 100);
      if (el.loaderBar) el.loaderBar.style.width = `${p}%`;
      if (el.loaderPct) el.loaderPct.textContent = `${Math.round(p)}%`;
    };
    const tick = setInterval(() => {
      if (p < 88) set(p + Math.random() * 11);
    }, 160);
    const finish = () => {
      clearInterval(tick);
      set(100);
      setTimeout(() => {
        el.loader?.classList.add('is-out');
        if (el.loader) el.loader.setAttribute('aria-hidden', 'true');
      }, 380);
    };
    if (document.readyState === 'complete') setTimeout(finish, 500);
    else window.addEventListener('load', () => setTimeout(finish, 500), { once: true });
    setTimeout(finish, 3200);
  }

  /* ---------------- initial UI ---------------- */
  function initHero() {
    if (el.posterArt) {
      const local = featuredLocal.get(latest.id);
      const cover = local || latest.cover || latest.spectrogram;
      if (cover) {
        el.posterArt.style.backgroundImage = `linear-gradient(150deg, rgba(0,45,160,.65), rgba(0,210,255,.18)), url("${cover}")`;
        el.posterArt.style.backgroundBlendMode = 'multiply';
      }
    }
    if (el.posterDate) el.posterDate.textContent = fmtDate(latest.date);
    if (el.posterDuration) el.posterDuration.textContent = latest.durationLabel.toUpperCase();
    if (el.deckCode) el.deckCode.textContent = D.stats.sessions;
    if (el.year) el.year.textContent = String(new Date().getFullYear());
  }

  function initDataChrome() {
    $$('[data-play-latest]').forEach(btn => btn.addEventListener('click', playLatest));
    // update chip counts from data
    $$('.chip', el.yearChips).forEach(btn => {
      const y = btn.dataset.year;
      const span = btn.querySelector('span');
      if (!span) return;
      if (y === 'all') span.textContent = D.stats.sessions;
      else if (D.stats.yearCounts[y]) span.textContent = D.stats.yearCounts[y];
    });
    updateFavChip();
  }

  function bindPlayerEvents() {
    el.btnPlay?.addEventListener('click', togglePlay);
    el.btnPrev?.addEventListener('click', prevTrack);
    el.btnNext?.addEventListener('click', () => nextTrack(false));
    el.btnShuffle?.addEventListener('click', () => {
      state.shuffle = !state.shuffle;
      el.btnShuffle.classList.toggle('is-active', state.shuffle);
      el.btnShuffle.setAttribute('aria-pressed', String(state.shuffle));
      saveState(true);
      toast(state.shuffle ? 'Modo aleatorio activado' : 'Modo aleatorio desactivado');
    });
    el.btnRepeat?.addEventListener('click', () => {
      state.repeat = (state.repeat + 1) % 3;
      updateRepeatUI(true);
      saveState(true);
    });
    el.btnFav?.addEventListener('click', toggleFavorite);
    el.btnRandom?.addEventListener('click', playRandom);

    el.seek?.addEventListener('input', () => {
      const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : (state.current?.duration || 0);
      if (duration > 0) {
        const target = (Number(el.seek.value) / 1000) * duration;
        audio.currentTime = target;
        updateProgress();
      }
    });

    el.volume?.addEventListener('input', () => applyVolume(Number(el.volume.value) / 100));
    el.btnMute?.addEventListener('click', toggleMute);
    el.btnSpeed?.addEventListener('click', () => {
      const speeds = [0.75, 1, 1.25, 1.5, 2];
      let idx = speeds.indexOf(savedSpeed);
      idx = (idx + 1) % speeds.length;
      savedSpeed = speeds[idx];
      audio.playbackRate = savedSpeed;
      if (el.btnSpeed) el.btnSpeed.textContent = savedSpeed === 1 ? '1×' : `${String(savedSpeed).replace('.', ',')}×`;
      saveState(true);
      toast(`Velocidad: ${savedSpeed}×`);
    });

    el.miniPlay?.addEventListener('click', togglePlay);
    el.miniOpen?.addEventListener('click', goToPlayer);
    el.miniExpand?.addEventListener('click', goToPlayer);
    el.miniClose?.addEventListener('click', () => {
      state.miniClosed = true;
      el.mini.classList.remove('is-visible');
      saveState(true);
    });
    el.miniInfo?.addEventListener('click', goToPlayer);

    el.search?.addEventListener('input', () => {
      clearTimeout(state.searchTimer);
      state.searchTimer = setTimeout(() => {
        state.query = el.search.value.trim();
        renderPlaylist(true);
      }, 110);
    });
    el.searchClear?.addEventListener('click', () => {
      if (el.search) { el.search.value = ''; el.search.focus(); }
      state.query = '';
      renderPlaylist(true);
    });
    el.yearChips?.addEventListener('click', e => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      setYear(chip.dataset.year);
    });
    el.sort?.addEventListener('change', () => {
      state.sort = el.sort.value;
      renderPlaylist(true);
    });
    el.btnMore?.addEventListener('click', () => {
      state.shown += 30;
      renderPlaylist();
    });
    el.resetFilters?.addEventListener('click', () => {
      state.query = ''; state.year = 'all'; state.sort = 'recent';
      if (el.search) el.search.value = '';
      if (el.sort) el.sort.value = 'recent';
      $$('.chip', el.yearChips).forEach(b => b.classList.toggle('is-active', b.dataset.year === 'all'));
      renderPlaylist(true);
    });

    el.playlist?.addEventListener('click', e => {
      const btn = e.target.closest('[data-play-id]');
      if (!btn) return;
      const s = byId.get(btn.dataset.playId);
      if (s) {
        loadSession(s, { autoplay: true });
        toast(`Sonando · ${fmtDate(s.date)} · ${s.title}`);
      }
    });

    el.specialsRail?.addEventListener('click', e => {
      const btn = e.target.closest('[data-play-id]');
      if (!btn || el.specialsRail.classList.contains('is-dragging')) return;
      const s = byId.get(btn.dataset.playId);
      if (s) { loadSession(s, { autoplay: true }); toast(`Sonando · ${fmtDate(s.date)} · ${s.title}`); }
    });

    $$('[data-play-latest]').forEach(btn => {
      // already bound in initDataChrome; avoid duplicate handlers
    });

    audio.addEventListener('loadedmetadata', () => {
      const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : (state.current?.duration || 0);
      if (el.timeTotal) el.timeTotal.textContent = fmtTime(duration);
      if (state.pendingSeek > 5 && duration > 0) {
        const target = Math.min(state.pendingSeek, Math.max(0, duration - 3));
        try { audio.currentTime = target; } catch {}
        if (!state.restoreNotified && state.pendingSeek > 20) {
          state.restoreNotified = true;
          setTimeout(() => toast(`Retomando donde lo dejaste · ${fmtTime(target)}`), 500);
        }
        state.pendingSeek = 0;
      }
      updateProgress();
    });
    audio.addEventListener('durationchange', () => {
      const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : (state.current?.duration || 0);
      if (el.timeTotal) el.timeTotal.textContent = fmtTime(duration);
    });
    audio.addEventListener('timeupdate', updateProgress);
    audio.addEventListener('play', () => { state.hasInteracted = true; setPlaying(true); });
    audio.addEventListener('playing', () => { setPlaying(true); setLoading(false); ensureAudioContext(); resumeAudioContext(); });
    audio.addEventListener('pause', () => setPlaying(false));
    audio.addEventListener('waiting', () => setLoading(true));
    audio.addEventListener('canplay', () => setLoading(false));
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', () => {
      setLoading(false);
      setPlaying(false);
      setStatus('ERROR');
      toast('No se pudo cargar la sesión. Prueba a abrirla en Archive.', 4200);
    });

    window.addEventListener('beforeunload', () => saveState(true));
    window.addEventListener('pagehide', () => saveState(true));
  }

  function goToPlayer() {
    const target = document.getElementById('archivo');
    if (!target) return;
    target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    setTimeout(() => el.btnPlay?.focus({ preventScroll: true }), reduceMotion ? 0 : 600);
  }

  function renderSpecialButtons() {
    if (!el.specialsRail) return;
    const scrollByCard = dir => {
      const card = el.specialsRail.querySelector('.special-card');
      const amount = (card ? card.getBoundingClientRect().width : 320) + 16;
      el.specialsRail.scrollBy({ left: amount * dir, behavior: reduceMotion ? 'auto' : 'smooth' });
    };
    el.specialsPrev?.addEventListener('click', () => scrollByCard(-1));
    el.specialsNext?.addEventListener('click', () => scrollByCard(1));

    let down = false, moved = false, startX = 0, startScroll = 0;
    el.specialsRail.addEventListener('pointerdown', e => {
      if (e.pointerType !== 'mouse') return;
      down = true; moved = false; startX = e.clientX; startScroll = el.specialsRail.scrollLeft;
      el.specialsRail.classList.add('is-dragging');
    });
    window.addEventListener('pointermove', e => {
      if (!down) return;
      const dx = e.clientX - startX;
      if (Math.abs(dx) > 6) moved = true;
      el.specialsRail.scrollLeft = startScroll - dx;
    });
    const endDrag = () => {
      if (!down) return;
      down = false;
      el.specialsRail.classList.remove('is-dragging');
      setTimeout(() => { moved = false; }, 30);
    };
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
    el.specialsRail.addEventListener('click', e => {
      if (moved) { e.preventDefault(); e.stopPropagation(); }
    }, true);
  }

  function bindDialogs() {
    el.videoClose?.addEventListener('click', () => closeDialog(el.videoModal));
    el.videoModal?.addEventListener('close', () => clearDialog(el.videoModal));
    el.videoModal?.addEventListener('click', e => { if (e.target === el.videoModal) closeDialog(el.videoModal); });
    el.liveClose?.addEventListener('click', () => closeDialog(el.liveModal));
    el.liveModal?.addEventListener('close', () => clearDialog(el.liveModal));
    el.liveModal?.addEventListener('click', e => { if (e.target === el.liveModal) closeDialog(el.liveModal); });
    $('#openTwitch')?.addEventListener('click', openTwitch);
    $('#openTwitchCard')?.addEventListener('click', openTwitch);
    el.ytGrid?.addEventListener('click', e => {
      const card = e.target.closest('[data-video]');
      if (card) openVideo(card.dataset.video);
    });
    $('#ytMore')?.addEventListener('click', () => {
      renderVideos(true);
      toast('Cargados los 15 resubidos del canal');
    });
  }

  function bindMisc() {
    el.backTop?.addEventListener('click', () => window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' }));
    // keyboard shortcuts
    document.addEventListener('keydown', e => {
      const tag = (document.activeElement?.tagName || '').toLowerCase();
      const typing = ['input', 'textarea', 'select'].includes(tag) || document.activeElement?.isContentEditable;
      const interactive = ['input', 'textarea', 'select', 'button', 'a'].includes(tag);
      const dialogOpen = !!document.querySelector('dialog[open]');
      const menuOpen = el.mobileMenu?.classList.contains('is-open');
      if (typing || dialogOpen || menuOpen) return;
      if (e.code === 'Space' && !interactive) { e.preventDefault(); togglePlay(); }
      else if (e.key === 'ArrowRight' && !interactive && state.current) { e.preventDefault(); audio.currentTime = Math.min(Number.isFinite(audio.duration) ? audio.duration : state.current.duration, audio.currentTime + 15); }
      else if (e.key === 'ArrowLeft' && !interactive && state.current) { e.preventDefault(); audio.currentTime = Math.max(0, audio.currentTime - 15); }
      else if (e.key.toLowerCase() === 'm') { toggleMute(); }
      else if (e.key.toLowerCase() === 'f') { toggleFavorite(); }
    });
    // easter egg: type "carpa"
    let buffer = '';
    document.addEventListener('keydown', e => {
      if (e.key.length !== 1) return;
      const tag = (document.activeElement?.tagName || '').toLowerCase();
      if (['input', 'textarea', 'select'].includes(tag)) return;
      if (document.querySelector('dialog[open]') || el.mobileMenu?.classList.contains('is-open')) return;
      buffer = (buffer + e.key.toLowerCase()).slice(-5);
      if (buffer === 'carpa') {
        buffer = '';
        if (el.easter) {
          el.easter.classList.remove('is-on');
          void el.easter.offsetWidth;
          el.easter.classList.add('is-on');
          setTimeout(() => el.easter.classList.remove('is-on'), 1900);
        }
      }
    });
  }

  /* ---------------- init ---------------- */
  function init() {
    if (state.initialized) return;
    state.initialized = true;
    state.savedAt = 0;
    applyVolume(savedVolume, false);
    audio.playbackRate = savedSpeed;
    if (el.btnSpeed) el.btnSpeed.textContent = savedSpeed === 1 ? '1×' : `${String(savedSpeed).replace('.', ',')}×`;
    el.btnShuffle?.classList.toggle('is-active', state.shuffle);
    el.btnShuffle?.setAttribute('aria-pressed', String(state.shuffle));
    state.repeat = clamp(Number(state.repeat) || 0, 0, 2);
    updateRepeatUI(false);
    el.playerDeck?.classList.add('is-paused');

    if (state.current) {
      setSessionUI(state.current);
      audio.src = state.current.audio;
      audio.load();
      // set initial progress from archive metadata while metadata loads
      if (el.timeTotal) el.timeTotal.textContent = fmtTime(state.current.duration);
      if (el.timeNow) el.timeNow.textContent = '0:00';
      if (el.timeLeft) el.timeLeft.textContent = '-' + fmtTime(state.current.duration);
      if (state.pendingSeek > 0) setStatus('LISTO · CONTINÚA');
      else setStatus('LISTO PARA SONAR');
    }

    initHero();
    initDataChrome();
    renderPlaylist(true);
    renderSpecials();
    renderVideos();
    renderSpecialButtons();
    setLiveMeta();
    bindPlayerEvents();
    bindDialogs();
    bindMisc();
    initHeader();
    initMenu();
    initReveals();
    initCounters();
    initCursor();
    initMotion();
    initHeroCanvas();
    initViz();
    initLoader();
    setMediaHandlers();

    // small entry cue for keyboard users
    if (state.pendingSeek > 30) {
      setTimeout(() => toast('Tienes una sesión a medias. Dale al play para continuar.', 3800), 1600);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
