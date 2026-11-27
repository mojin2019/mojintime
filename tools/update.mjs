#!/usr/bin/env node
/* ============================================================
   MOJIN TIME · actualizador automático
   - Lee Internet Archive (sesiones nuevas, duraciones, tamaños)
   - Lee el feed de YouTube (resubidos, vistas, duración, miniatura)
   - Lee Twitch (seguidores y último directo)
   - Regenera assets/js/data.js y los números fijos de index.html
   Sin dependencias externas. Node 20+.
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_PATH = path.join(ROOT, 'assets', 'js', 'data.js');
const INDEX_PATH = path.join(ROOT, 'index.html');
const MANIFEST_PATH = path.join(ROOT, 'site.webmanifest');
const SITEMAP_PATH = path.join(ROOT, 'sitemap.xml');
const ROBOTS_PATH = path.join(ROOT, 'robots.txt');
const YT_DIR = path.join(ROOT, 'assets', 'img', 'yt');

const ARCHIVE_ID = 'mojin-time-la-carpa';
const YT_CHANNEL_ID = 'UCedPSfiLFZMcHlkbmF7fM-w';
const YT_HANDLE = '@mojinTime';
const TWITCH_LOGIN = 'mojintime';
const YT_MAX_VIDEOS = 15;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const SITE_URL = (process.env.SITE_URL || '').trim();

const log = (...args) => console.log(...args);
const warn = (...args) => console.warn('  !', ...args);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const pad = n => String(n).padStart(2, '0');

async function fetchText(url, options = {}, attempts = 2) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const res = await fetch(url, {
        ...options,
        headers: {
          'User-Agent': UA,
          'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
          ...(options.headers || {})
        },
        signal: AbortSignal.timeout(options.timeout || 45000)
      });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return await res.text();
    } catch (error) {
      lastError = error;
      if (attempt + 1 < attempts) await sleep(1200);
    }
  }
  throw lastError;
}

function readData() {
  const src = fs.readFileSync(DATA_PATH, 'utf8');
  const sandbox = { window: {} };
  vm.runInNewContext(src, sandbox, { filename: DATA_PATH });
  const data = sandbox.window.MOJIN_DATA;
  if (!data || !Array.isArray(data.sessions)) throw new Error('data.js no contiene MOJIN_DATA.sessions');
  return data;
}

function decodeXml(value) {
  return String(value ?? '')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, num) => String.fromCodePoint(Number(num)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/* ---------------- fechas de los archivos ---------------- */
const RE_YMD = /(?:^|[^\d])(\d{4})[-_. ](\d{1,2})[-_. ](\d{1,2})(?:[^\d]|$)/;
const RE_DMY = /(?:^|[^\d])(\d{1,2})[-_. ](\d{1,2})[-_. ](\d{4})(?:[^\d]|$)/;

function validDate(y, m, d) {
  if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function isoFromParts(y, m, d) {
  if (!validDate(y, m, d)) return null;
  return `${String(y).padStart(4, '0')}-${pad(m)}-${pad(d)}`;
}

function parseArchiveDate(name) {
  let match = name.match(RE_YMD);
  if (match) {
    const iso = isoFromParts(Number(match[1]), Number(match[2]), Number(match[3]));
    if (iso) return iso;
  }
  match = name.match(RE_DMY);
  if (match) {
    const iso = isoFromParts(Number(match[3]), Number(match[2]), Number(match[1]));
    if (iso) return iso;
  }
  return null;
}

function parsePart(name) {
  const match = name.match(/\bPART(?:E)?\s*[-_.]?\s*(\d{1,2})\b/i);
  return match ? Number(match[1]) : 0;
}

const SMALL_WORDS = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'y', 'o', 'a', 'en', 'con', 'por', 'para', 'mi', 'tu', 'su', 'al']);

function titleCase(value) {
  return value
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word, index) => {
      if (index > 0 && SMALL_WORDS.has(word)) return word;
      if (/^\d+$/.test(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

function prettySpecial(name) {
  const raw = name
    .replace(/\.mp3$/i, '')
    .replace(/^[\s\S]*?ESPECIAL\s*/i, '')
    .replace(/\bPART(?:E)?\s*\d+[\s\S]*$/i, '')
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!raw) return 'La Carpa';
  return titleCase(raw)
    .replace(/\bCumple\b/gi, 'Cumpleaños')
    .replace(/\bCumpleanos\b/gi, 'Cumpleaños');
}

function durationLabel(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return h > 0 ? `${h} h ${pad(m)} min` : `${m} min`;
}

function encodeArchiveName(name) {
  return name.split('/').map(encodeURIComponent).join('/');
}

function makeSession(file, byLower) {
  const name = file.name;
  const date = parseArchiveDate(name);
  if (!date) return null;

  const part = parsePart(name);
  const special = !part && /ESPECIAL/i.test(name);
  const title = part
    ? `Parte ${part}`
    : special
      ? `Especial ${prettySpecial(name)}`
      : 'Sesión completa';
  const label = part ? `Parte ${part}` : special ? 'Especial' : 'Sesión completa';

  const base = name.replace(/\.mp3$/i, '');
  const coverName = byLower.get(`${base}.png`.toLowerCase()) || null;
  const spectrogramName = byLower.get(`${base}_spectrogram.png`.toLowerCase()) || null;
  const audio = `https://archive.org/download/${ARCHIVE_ID}/${encodeArchiveName(name)}`;
  const duration = Math.round((Number(file.length) || 0) * 100) / 100;

  return {
    id: `s-${crypto.createHash('sha1').update(name, 'utf8').digest('hex').slice(0, 10)}`,
    file: name,
    title,
    date,
    year: Number(date.slice(0, 4)),
    dateRaw: name,
    duration,
    durationLabel: durationLabel(duration),
    size: Number(file.size) || 0,
    part,
    special,
    label,
    audio,
    download: `${audio}?download=1`,
    cover: coverName ? `https://archive.org/download/${ARCHIVE_ID}/${encodeArchiveName(coverName)}` : null,
    spectrogram: spectrogramName ? `https://archive.org/download/${ARCHIVE_ID}/${encodeArchiveName(spectrogramName)}` : null
  };
}

/* ---------------- Internet Archive ---------------- */
async function loadArchive() {
  const metadataUrl = `https://archive.org/metadata/${ARCHIVE_ID}`;
  log('→ Internet Archive:', metadataUrl);
  const json = JSON.parse(await fetchText(metadataUrl));
  const files = Array.isArray(json.files) ? json.files : [];
  const mp3 = files.filter(file => /\.mp3$/i.test(file.name) && (!file.source || file.source === 'original'));
  if (mp3.length < 10) throw new Error(`Internet Archive devolvió solo ${mp3.length} MP3; se cancela para no romper el archivo.`);
  const byLower = new Map(files.map(file => [String(file.name).toLowerCase(), file.name]));
  return { files, mp3, byLower };
}

/* ---------------- YouTube ---------------- */
function parseYoutubeFeed(xml) {
  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(match => match[1]);
  return entries.map(entry => {
    const id = entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1] || '';
    const title = decodeXml(entry.match(/<title>([\s\S]*?)<\/title>/)?.[1] || '');
    const published = entry.match(/<published>([^<]+)<\/published>/)?.[1] || '';
    const views = Number(entry.match(/<media:statistics\s+views="(\d+)"/)?.[1] || 0);
    return { id, title, published, views };
  }).filter(video => video.id);
}

async function loadYoutubeVideos() {
  const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${YT_CHANNEL_ID}`;
  log('→ YouTube:', feedUrl);
  const xml = await fetchText(feedUrl);
  return parseYoutubeFeed(xml).slice(0, YT_MAX_VIDEOS);
}

async function fetchVideoDetails(id) {
  try {
    const html = await fetchText(`https://www.youtube.com/watch?v=${encodeURIComponent(id)}`, {
      timeout: 30000,
      headers: { Cookie: 'CONSENT=YES+cb.20210328-17-p0.en+FX+000' }
    });
    const seconds = Number(html.match(/"lengthSeconds":"(\d+)"/)?.[1] || 0)
      || Math.round(Number(html.match(/"approxDurationMs":"(\d+)"/)?.[1] || 0) / 1000);
    const views = Number(html.match(/"viewCount":"(\d+)"/)?.[1] || 0);
    return { duration: seconds, views };
  } catch (error) {
    warn(`No se pudo leer la duración de YouTube ${id}: ${error.message}`);
    return { duration: 0, views: 0 };
  }
}

async function ensureThumb(id, previous) {
  if (previous) {
    const absolute = path.join(ROOT, previous);
    if (fs.existsSync(absolute)) return previous;
  }
  const candidates = [
    [`https://i.ytimg.com/vi_webp/${id}/maxresdefault.webp`, 'webp'],
    [`https://i.ytimg.com/vi/${id}/maxresdefault.jpg`, 'jpg'],
    [`https://i.ytimg.com/vi/${id}/hqdefault.jpg`, 'jpg']
  ];
  for (const [url, extension] of candidates) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30000) });
      if (!res.ok) continue;
      const buffer = Buffer.from(await res.arrayBuffer());
      if (buffer.length < 1000) continue;
      fs.mkdirSync(YT_DIR, { recursive: true });
      const relative = `assets/img/yt/${id}.${extension}`;
      fs.writeFileSync(path.join(ROOT, relative), buffer);
      return relative;
    } catch {}
  }
  warn(`No se pudo descargar la miniatura de ${id}; se usará la URL de YouTube.`);
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

async function updateVideos(data, feedEntries) {
  const previous = new Map((data.videos || []).map(video => [video.id, video]));
  const missing = feedEntries.filter(entry => !previous.has(entry.id));
  const details = new Map();
  if (missing.length) {
    log(`→ YouTube: ${missing.length} vídeo(s) nuevo(s), leyendo duración y miniatura…`);
    const results = await Promise.allSettled(missing.map(async entry => {
      const info = await fetchVideoDetails(entry.id);
      const thumb = await ensureThumb(entry.id, null);
      return { id: entry.id, info, thumb };
    }));
    for (const result of results) {
      if (result.status === 'fulfilled') details.set(result.value.id, result.value);
      else warn(`Vídeo nuevo incompleto: ${result.reason?.message || result.reason}`);
    }
  }

  const videos = [];
  for (const entry of feedEntries) {
    const old = previous.get(entry.id);
    const extra = details.get(entry.id);
    const duration = old?.duration || extra?.info.duration || 0;
    const views = entry.views || extra?.info.views || old?.views || 0;
    const thumb = extra?.thumb || await ensureThumb(entry.id, old?.thumb);
    videos.push({
      id: entry.id,
      title: entry.title || old?.title || '',
      published: entry.published || old?.published || '',
      date: (entry.published || old?.published || '').slice(0, 10),
      duration,
      minutes: duration ? Math.round(duration / 60) : 0,
      views,
      thumb,
      url: `https://www.youtube.com/watch?v=${entry.id}`
    });
  }
  videos.sort((a, b) => String(b.published).localeCompare(String(a.published)));
  return { videos, newCount: missing.length };
}

async function loadYoutubeSubs() {
  try {
    const html = await fetchText(`https://www.youtube.com/${YT_HANDLE}`, {
      timeout: 30000,
      headers: { Cookie: 'CONSENT=YES+cb.20210328-17-p0.en+FX+000' }
    });
    const match = html.match(/([\d.,]+)\s*([KM])?\s*(?:suscriptores|subscribers)/i);
    if (!match) return null;
    let value = Number(match[1].replace(/\./g, '').replace(',', '.'));
    if (!Number.isFinite(value) || value <= 0) return null;
    if (match[2]?.toUpperCase() === 'K') value *= 1000;
    if (match[2]?.toUpperCase() === 'M') value *= 1000000;
    return Math.round(value);
  } catch (error) {
    warn(`No se pudieron leer los suscriptores de YouTube: ${error.message}`);
    return null;
  }
}

/* ---------------- Twitch ---------------- */
async function loadTwitch() {
  try {
    const query = `query { user(login: "${TWITCH_LOGIN}") { followers { totalCount } lastBroadcast { startedAt title } } }`;
    const text = await fetchText('https://gql.twitch.tv/gql', {
      method: 'POST',
      headers: {
        'Client-ID': 'kimne78kx3ncx6brgo4mv6wki5h1ko',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query })
    });
    const user = JSON.parse(text)?.data?.user;
    if (!user) return null;
    return {
      followers: Number(user.followers?.totalCount) || 0,
      lastBroadcast: user.lastBroadcast?.startedAt || '',
      lastBroadcastTitle: user.lastBroadcast?.title || ''
    };
  } catch (error) {
    warn(`No se pudo leer Twitch: ${error.message}`);
    return null;
  }
}

/* ---------------- fusión de sesiones ---------------- */
function mergeSessions(data, mp3, byLower) {
  const previous = new Map(data.sessions.map(session => [session.id, session]));
  const previousOrder = new Map(data.sessions.map((session, index) => [session.id, index]));
  const sessions = [];
  const seen = new Set();
  let added = 0;

  for (const file of mp3) {
    const fresh = makeSession(file, byLower);
    if (!fresh) {
      warn(`Sin fecha reconocible, se omite: ${file.name}`);
      continue;
    }
    if (seen.has(fresh.id)) continue;
    seen.add(fresh.id);
    const old = previous.get(fresh.id);
    if (old) {
      const duration = fresh.duration || old.duration || 0;
      const sameDuration = old.duration && Math.abs(duration - old.duration) < 60;
      sessions.push({
        ...fresh,
        title: old.title || fresh.title,
        label: old.label || fresh.label,
        part: fresh.part || old.part || 0,
        special: typeof old.special === 'boolean' ? old.special : fresh.special,
        duration,
        durationLabel: sameDuration && old.durationLabel ? old.durationLabel : durationLabel(duration),
        size: fresh.size || old.size || 0
      });
    } else {
      sessions.push(fresh);
      added++;
    }
  }

  sessions.sort((a, b) => {
    const byDate = String(b.date).localeCompare(String(a.date));
    if (byDate) return byDate;
    const byPart = Number(a.part || 0) - Number(b.part || 0);
    if (byPart) return byPart;
    const aIndex = previousOrder.get(a.id);
    const bIndex = previousOrder.get(b.id);
    if (aIndex != null && bIndex != null) return aIndex - bIndex;
    if (aIndex != null) return -1;
    if (bIndex != null) return 1;
    return String(a.file).localeCompare(String(b.file), 'es');
  });

  const removed = data.sessions.filter(session => !seen.has(session.id)).length;
  return { sessions, added, removed };
}

/* ---------------- estadísticas y destacados ---------------- */
function makeStats(sessions, oldStats) {
  const durationSeconds = Math.round(sessions.reduce((sum, session) => sum + (Number(session.duration) || 0), 0) * 100) / 100;
  const sizeBytes = sessions.reduce((sum, session) => sum + (Number(session.size) || 0), 0);
  const sizeGB = Math.round((sizeBytes / (1024 ** 3)) * 100) / 100;
  const years = [...new Set(sessions.map(session => String(session.year)))].sort();
  const yearCounts = {};
  for (const year of years) yearCounts[year] = sessions.filter(session => String(session.year) === year).length;
  const dates = sessions.map(session => session.date).filter(Boolean).sort();
  return {
    sessions: sessions.length,
    hours: Math.floor(durationSeconds / 3600),
    durationSeconds,
    sizeGB,
    sizeBytes,
    twitchFollowers: oldStats.twitchFollowers || 0,
    youtubeSubs: oldStats.youtubeSubs || 0,
    years,
    yearCounts,
    firstDate: dates[0] || '',
    latestDate: dates[dates.length - 1] || '',
    lastBroadcast: oldStats.lastBroadcast || '',
    lastBroadcastTitle: oldStats.lastBroadcastTitle || ''
  };
}

function updateFeatured(data, sessions) {
  const latest = sessions[0];
  const featured = Array.isArray(data.featured) ? data.featured.filter(entry => !entry.auto) : [];
  const latestEntry = featured.find(entry => /última|ultima/i.test(String(entry.tag || '')));
  if (latestEntry) latestEntry.id = latest.id;
  else featured.unshift({ id: latest.id, tag: 'La última', local: 'assets/img/covers/cover-latest.png' });

  const taken = new Set(featured.map(entry => entry.id));
  const autoSpecials = sessions
    .filter(session => session.special && session.id !== latest.id && !taken.has(session.id))
    .slice(0, 4)
    .map(session => {
      const rawTag = String(session.title || 'Especial').replace(/^Especial\s*/i, '') || 'Especial';
      const tag = rawTag.charAt(0).toUpperCase() + rawTag.slice(1);
      return { id: session.id, tag, local: null, auto: true };
    });

  const index = Math.max(0, featured.findIndex(entry => /última|ultima/i.test(String(entry.tag || ''))));
  featured.splice(index + 1, 0, ...autoSpecials);
  data.featured = featured;
}

/* ---------------- textos fijos del HTML ---------------- */
function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function replacePairs(text, pairs) {
  const unique = new Map();
  for (const [from, to] of pairs) {
    if (from && to && String(from) !== String(to)) unique.set(String(from), String(to));
  }
  const keys = [...unique.keys()].sort((a, b) => b.length - a.length);
  if (!keys.length) return text;
  const pattern = new RegExp(keys.map(escapeRegExp).join('|'), 'g');
  return text.replace(pattern, match => unique.get(match));
}

function sizeLabel(value) {
  return Number(value || 0).toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function followersK(value) {
  return (Number(value || 0) / 1000).toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function buildNumberPairs(oldStats, newStats, oldVideos, newVideos, oldRange, newRange) {
  const oldSizeLabel = sizeLabel(oldStats.sizeGB);
  const newSizeLabel = sizeLabel(newStats.sizeGB);
  const oldSizeAttr = Number(oldStats.sizeGB || 0).toFixed(2);
  const newSizeAttr = Number(newStats.sizeGB || 0).toFixed(2);
  const oldFollowers = Number(oldStats.twitchFollowers || 0);
  const newFollowers = Number(newStats.twitchFollowers || 0);
  const oldSubs = Number(oldStats.youtubeSubs || 0);
  const newSubs = Number(newStats.youtubeSubs || 0);

  const pairs = [
    [`${oldStats.sessions} sesiones`, `${newStats.sessions} sesiones`],
    [`${oldStats.sessions} noches`, `${newStats.sessions} noches`],
    [`${oldStats.sessions} grabaciones`, `${newStats.sessions} grabaciones`],
    [`${oldStats.hours} horas`, `${newStats.hours} horas`],
    [`${oldStats.hours} HORAS`, `${newStats.hours} HORAS`],
    [`${oldSizeLabel} GB`, `${newSizeLabel} GB`],
    [`data-count="${oldStats.sessions}">${oldStats.sessions}<`, `data-count="${newStats.sessions}">${newStats.sessions}<`],
    [`data-count="${oldStats.hours}">${oldStats.hours}<`, `data-count="${newStats.hours}">${newStats.hours}<`],
    [`data-count="${oldStats.sessions}"`, `data-count="${newStats.sessions}"`],
    [`data-count="${oldStats.hours}"`, `data-count="${newStats.hours}"`],
    [`data-count="${oldSizeAttr}"`, `data-count="${newSizeAttr}"`],
    [`id="plCount">${oldStats.sessions}<`, `id="plCount">${newStats.sessions}<`],
    [`id="deckCode">${oldStats.sessions}<`, `id="deckCode">${newStats.sessions}<`],
    [`${oldRange}`, `${newRange}`],
    [`${oldVideos} resubidos`, `${newVideos} resubidos`]
  ];

  if (oldFollowers > 0) {
    pairs.push([`data-count="${oldFollowers}"`, `data-count="${newFollowers}"`]);
    pairs.push([`${oldFollowers} seguidores`, `${newFollowers} seguidores`]);
    if (oldFollowers >= 1000) pairs.push([`${followersK(oldFollowers)} K`, `${followersK(newFollowers)} K`]);
  }
  if (oldSubs > 0) pairs.push([`${oldSubs} suscriptores`, `${newSubs} suscriptores`]);
  return pairs;
}

function replaceYearChips(html, stats) {
  const years = Object.keys(stats.yearCounts || {}).sort((a, b) => Number(b) - Number(a));
  const chips = [
    '<div class="chips" id="yearChips" role="group" aria-label="Filtrar por año">',
    `                <button class="chip is-active" data-year="all">Todas <span>${stats.sessions}</span></button>`,
    ...years.map(year => `                <button class="chip" data-year="${year}">${year} <span>${stats.yearCounts[year]}</span></button>`),
    '              </div>'
  ].join('\n');
  return html.replace(/<div class="chips" id="yearChips"[\s\S]*?<\/div>/, chips);
}

function updateSiteFiles(data, oldStats, oldVideos, stats, videos) {
  const oldRange = oldStats.years?.length ? `${oldStats.years[0]}—${oldStats.years[oldStats.years.length - 1]}` : '';
  const newRange = stats.years.length ? `${stats.years[0]}—${stats.years[stats.years.length - 1]}` : oldRange;
  const pairs = buildNumberPairs(oldStats, stats, oldVideos, videos, oldRange, newRange);

  const oldSiteUrl = String(data.site.url || '').replace(/\/$/, '');
  const newSiteUrl = (SITE_URL || data.site.url || '').replace(/\/$/, '');
  const siteChanged = !!SITE_URL && newSiteUrl !== oldSiteUrl;

  let html = fs.readFileSync(INDEX_PATH, 'utf8');
  html = replacePairs(html, pairs);
  html = replaceYearChips(html, stats);
  if (siteChanged) html = html.split(oldSiteUrl).join(newSiteUrl);
  fs.writeFileSync(INDEX_PATH, html, 'utf8');

  let manifest = fs.readFileSync(MANIFEST_PATH, 'utf8');
  manifest = replacePairs(manifest, pairs);
  fs.writeFileSync(MANIFEST_PATH, manifest, 'utf8');

  let sitemap = fs.readFileSync(SITEMAP_PATH, 'utf8');
  const today = new Date().toISOString().slice(0, 10);
  sitemap = sitemap.replace(/<lastmod>[^<]*<\/lastmod>/, `<lastmod>${today}</lastmod>`);
  if (siteChanged) {
    sitemap = sitemap.replace(/<loc>[^<]*<\/loc>/, `<loc>${newSiteUrl}/</loc>`);
  }
  fs.writeFileSync(SITEMAP_PATH, sitemap, 'utf8');

  if (siteChanged) {
    let robots = fs.readFileSync(ROBOTS_PATH, 'utf8');
    robots = robots.replace(/^Sitemap:.*$/m, `Sitemap: ${newSiteUrl}/sitemap.xml`);
    fs.writeFileSync(ROBOTS_PATH, robots, 'utf8');
  }

  data.site.url = SITE_URL ? `${newSiteUrl}/` : data.site.url;
  if (data.site.linktree === data.site.url || data.site.linktree === `${oldSiteUrl}/`) {
    data.site.linktree = `${newSiteUrl}/`;
  }
}

/* ---------------- principal ---------------- */
async function main() {
  log('MOJIN TIME · actualización automática');
  const data = readData();
  const oldStats = structuredClone(data.stats);
  const oldVideos = Array.isArray(data.videos) ? data.videos.length : 0;

  const archive = await loadArchive();
  const merged = mergeSessions(data, archive.mp3, archive.byLower);
  log(`→ Archivo: ${merged.sessions.length} sesiones (${merged.added} nuevas, ${merged.removed} fuera).`);

  let videos = data.videos || [];
  let newVideos = 0;
  try {
    const feed = await loadYoutubeVideos();
    if (feed.length) {
      const result = await updateVideos(data, feed);
      videos = result.videos;
      newVideos = result.newCount;
      log(`→ YouTube: ${videos.length} resubidos (${newVideos} nuevos).`);
    } else {
      warn('El feed de YouTube llegó vacío; se conservan los vídeos actuales.');
    }
  } catch (error) {
    warn(`YouTube no disponible, se conservan los vídeos actuales: ${error.message}`);
  }

  const twitch = await loadTwitch();
  const subs = await loadYoutubeSubs();

  const stats = makeStats(merged.sessions, oldStats);
  if (twitch) {
    stats.twitchFollowers = twitch.followers || stats.twitchFollowers;
    stats.lastBroadcast = twitch.lastBroadcast || stats.lastBroadcast;
    stats.lastBroadcastTitle = twitch.lastBroadcastTitle || stats.lastBroadcastTitle;
  }
  if (subs) stats.youtubeSubs = subs;

  data.meta.generatedAt = new Date().toISOString();
  data.stats = stats;
  data.sessions = merged.sessions;
  data.videos = videos;
  updateFeatured(data, merged.sessions);

  updateSiteFiles(data, oldStats, oldVideos, stats, videos.length);

  const output = `window.MOJIN_DATA = ${JSON.stringify(data, null, 2)};\n`;
  const previousOutput = fs.readFileSync(DATA_PATH, 'utf8');
  if (previousOutput !== output) fs.writeFileSync(DATA_PATH, output, 'utf8');

  log(`→ Stats: ${stats.sessions} sesiones · ${stats.hours} h · ${stats.sizeGB} GB · ${stats.youtubeSubs} subs · ${stats.twitchFollowers} seguidores.`);
  log(`→ Última sesión: ${stats.latestDate}. Último directo: ${stats.lastBroadcast || 'sin dato'}.`);
  log('Listo.');
}

export { main, parseArchiveDate, makeSession, mergeSessions, makeStats, updateSiteFiles };

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  main().catch(error => {
    console.error('ERROR:', error.message);
    process.exit(1);
  });
}
