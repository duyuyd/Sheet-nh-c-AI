// Pure search/identity helpers. No external fetches, publishing, or rights inference.
const MAX_TEXT = 200;
const VALID_STATES = new Set(['verified', 'ai_draft', 'missing', 'unknown']);
const VARIANTS = new Set(['melody', 'piano', 'organ']);

export function normalizeMusicText(value) {
  return String(value ?? '').slice(0, MAX_TEXT).normalize('NFKD')
    .replace(/[đĐ]/g, 'd').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}

// Title-only coincidences and different performances must never silently merge.
// Canonical work IDs must come from trusted catalog data, not from fuzzy matching.
export function catalogWorkKey(record) {
  if (!record || typeof record !== 'object') return null;
  if (typeof record.workId === 'string' && record.workId.trim()) {
    return 'work:' + record.workId.trim().slice(0, MAX_TEXT);
  }
  const title = normalizeMusicText(record.title);
  const composer = normalizeMusicText(record.composer);
  if (title && composer) return 'title-composer:' + title + '|' + composer;
  if (title && record.source && record.sourceId) {
    return 'source:' + String(record.source).slice(0, 80) + '|' + String(record.sourceId).slice(0, MAX_TEXT);
  }
  return null;
}

export function sheetState(record, variant) {
  if (!VARIANTS.has(variant)) throw new TypeError('Unknown sheet variant');
  const status = record?.sheets?.[variant]?.status;
  return VALID_STATES.has(status) ? status : 'unknown';
}

function bigrams(s) {
  const compact = s.replace(/ /g, '');
  const result = new Map();
  for (let i = 0; i < compact.length - 1; i++) {
    const key = compact.slice(i, i + 2);
    result.set(key, (result.get(key) ?? 0) + 1);
  }
  return result;
}
function fuzzyRatio(a, b) {
  if (a === b) return 1;
  if (a.length < 3 || b.length < 3) return 0;
  const x = bigrams(a), y = bigrams(b);
  let common = 0, total = 0;
  for (const n of x.values()) total += n;
  for (const [key, n] of y) { total += n; common += Math.min(n, x.get(key) ?? 0); }
  return total ? 2 * common / total : 0;
}

export function rankMusicCatalog(records, query, { limit = 50 } = {}) {
  const q = normalizeMusicText(query);
  if (!q || !Array.isArray(records)) return [];
  const boundedLimit = Math.max(1, Math.min(200, Math.trunc(Number(limit) || 50)));
  const scored = [];
  for (let index = 0; index < Math.min(records.length, 50000); index++) {
    const song = records[index];
    if (!song || typeof song.title !== 'string') continue;
    const title = normalizeMusicText(song.title);
    if (!title) continue;
    const composer = normalizeMusicText(song.composer);
    const artists = [song.artist, ...(Array.isArray(song.artists) ? song.artists : [])].map(normalizeMusicText);
    let score = title === q ? 100 : title.startsWith(q) ? 85 : title.includes(q) ? 70 : 0;
    if (composer === q || artists.includes(q)) score = Math.max(score, 75);
    else if (composer.includes(q) || artists.some(a => a.includes(q))) score = Math.max(score, 60);
    if (!score) {
      const fuzzy = fuzzyRatio(title, q);
      if (fuzzy >= 0.56) score = 10 + Math.round(fuzzy * 40);
    }
    if (score) scored.push({ song, score, index });
  }
  return scored.sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, boundedLimit).map(({song,score}) => ({song, score}));
}

// Duplicates are grouped only with explicit trusted identity or title + composer.
// Keep all source records; no record becomes 'verified' merely by merging.
export function groupCatalogByWork(records) {
  if (!Array.isArray(records)) return [];
  const groups = [], byKey = new Map();
  for (const record of records) {
    if (!record || typeof record.title !== 'string' || !record.title.trim()) continue;
    const key = catalogWorkKey(record);
    if (key && byKey.has(key)) groups[byKey.get(key)].sources.push(record);
    else {
      const group = {key, title:record.title, sources:[record]};
      if (key) byKey.set(key, groups.length);
      groups.push(group);
    }
  }
  return groups;
}
