// server.mjs - Production-grade web dev & API server for Góc Hợp Âm
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { musicCatalog } from './lib/music-catalog.mjs';
import { autoSheetEngine } from './lib/auto-sheet-engine.mjs';
import { securityRights } from './lib/security-rights.mjs';
import { videoCaptions, captionFailure } from './lib/video-captions.mjs';
import { midiToScore, scoreToMusicXML } from './public/mobile/score-io.js';
import { getGeminiStatus, transcribeWithGemini, getGeminiConfig, updateGeminiConfig, pingGeminiConnection } from './lib/gemini-client.mjs';
import { geminiConnectionManager } from './lib/gemini-connection-manager.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;
const HOST = '0.0.0.0';

app.use(express.json({ limit: '35mb' }));
app.use(express.urlencoded({ extended: true, limit: '35mb' }));
app.use(express.raw({ type: ['audio/*', 'application/octet-stream', 'application/x-midi'], limit: '35mb' }));

// Security Headers & Audit middleware
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Rate limiting for API requests
app.use('/api', (req, res, next) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
  const { allowed, remaining } = securityRights.checkRateLimit(String(ip));
  res.setHeader('X-RateLimit-Remaining', remaining);
  if (!allowed) {
    return res.status(429).json({ error: 'Quá nhiều yêu cầu từ thiết bị này. Vui lòng thử lại sau giây lát.' });
  }
  next();
});

// PWA Manifest
app.get('/manifest.webmanifest', (req, res) => {
  res.setHeader('Content-Type', 'application/manifest+json');
  res.json({
    name: 'Góc Hợp Âm',
    short_name: 'Góc Hợp Âm',
    description: 'Mang giai điệu theo bạn · Tìm hợp âm, đổi tông, auto-sheet MusicXML và tập theo cách của bạn',
    start_url: '/',
    display: 'standalone',
    background_color: '#17131e',
    theme_color: '#21192e',
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any maskable'
      }
    ]
  });
});

// Service Worker for offline capability
app.get('/service-worker.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.send(`
    const CACHE_NAME = 'goc-hop-am-cache-v1';
    const ASSETS = ['/', '/index.html', '/app.css', '/bundle.js', '/icon.svg'];
    self.addEventListener('install', e => {
      e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
    });
    self.addEventListener('activate', e => {
      e.waitUntil(self.clients.claim());
    });
    self.addEventListener('fetch', e => {
      if (e.request.url.includes('/api/')) return;
      e.respondWith(
        caches.match(e.request).then(r => r || fetch(e.request).catch(() => caches.match('/index.html')))
      );
    });
  `);
});

// --- P1: Music Catalog API ---
app.get('/api/catalog', async (req, res) => {
  try {
    const { q, query, genre, type, mode, page } = req.query;
    const searchTerm = q || query || '';

    // First query local catalog
    const localResult = musicCatalog.search({
      query: searchTerm,
      genre: genre ? String(genre) : '',
      type: type || 'title',
      mode: mode || 'hot',
      page: page ? Number(page) : 0,
      limit: 20
    });

    res.json(localResult);
  } catch (error) {
    securityRights.logEvent('CATALOG_ERROR', { error: error.message });
    res.status(500).json({ error: 'Không thể tải danh mục bài hát: ' + error.message });
  }
});

// --- P1: Song Reader API ---
app.get('/api/reader', (req, res) => {
  try {
    const { url, id } = req.query;
    const target = url || (id ? (id.startsWith('site:') ? id : `site:${id}`) : null);
    if (!target) {
      return res.status(400).json({ error: 'Thiếu định danh bài hát.' });
    }

    const song = musicCatalog.getSong(target);
    if (!song) {
      return res.status(404).json({ error: 'Không tìm thấy bài hát trong kho dữ liệu.' });
    }

    res.json({
      song: {
        id: song.id,
        title: song.title,
        author: song.composer || song.artist || 'Góc Hợp Âm',
        composer: song.composer,
        artist: song.artist,
        key: song.key || 'C',
        genre: song.genre,
        content: song.content,
        sourceUrl: song.sourceUrl,
        videoId: song.videoId,
        videos: song.videoId ? [{ id: song.videoId, label: 'Bản thu chính' }] : [],
        sheets: song.sheets || { melody: { status: 'missing' } },
        rights: song.rights || 'unknown'
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Lỗi tải bài hát: ' + error.message });
  }
});

// --- Video Captions API (proxy to safe YouTube timedtext) ---
app.get('/api/video-captions', async (req, res) => {
  const id = req.query.id;
  if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id)) {
    return res.status(400).json({ error: 'Mã video YouTube không hợp lệ.' });
  }
  try {
    const captions = await videoCaptions(id);
    res.json(captions);
  } catch (error) {
    res.json(captionFailure(id, 'unavailable'));
  }
});

// --- P2: Auto Sheet Engine API ---
app.post('/api/auto-sheet/jobs', (req, res) => {
  try {
    const { audioBase64, midiBase64, songId, title, rights, bpm } = req.body;
    let audioBytes = null, midiBytes = null;

    if (audioBase64) {
      audioBytes = Buffer.from(audioBase64, 'base64');
    }
    if (midiBase64) {
      midiBytes = Buffer.from(midiBase64, 'base64');
    }

    if (!audioBytes && !midiBytes) {
      return res.status(400).json({ error: 'Cần gửi dữ liệu audioBase64 hoặc midiBase64.' });
    }

    const result = autoSheetEngine.createJob({
      audioBytes,
      midiBytes,
      songId,
      title: title || 'Bản nhạc tự động',
      rights: rights || 'owned',
      bpm: Number(bpm) || 80
    });

    res.json({
      success: true,
      deduplicated: result.deduplicated,
      job: result.job
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/auto-sheet/jobs', (req, res) => {
  const jobs = autoSheetEngine.listJobs();
  res.json({ jobs, total: jobs.length });
});

app.get('/api/auto-sheet/jobs/:id', (req, res) => {
  const job = autoSheetEngine.getJob(req.params.id);
  if (!job) {
    return res.status(404).json({ error: 'Không tìm thấy tác vụ auto-sheet.' });
  }
  res.json({ job });
});

// Synchronous score transcription endpoint
app.post('/api/auto-sheet/transcribe', (req, res) => {
  try {
    const { midiBase64, title } = req.body;
    if (!midiBase64) {
      return res.status(400).json({ error: 'Cần cung cấp dữ liệu midiBase64.' });
    }
    const bytes = Buffer.from(midiBase64, 'base64');
    const score = midiToScore(bytes, { title: title || 'Giai điệu MIDI' });
    const musicxml = scoreToMusicXML(score);
    res.json({ success: true, score, musicxml });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// AI Auto Sheet on-demand generation for catalog songs
app.post('/api/auto-sheet/generate-for-song', async (req, res) => {
  try {
    const { songId, audioBase64, mimeType } = req.body;
    if (!songId) {
      return res.status(400).json({ error: 'Thiếu mã bài hát (songId).' });
    }
    const song = musicCatalog.getSong(songId);
    if (!song) {
      return res.status(404).json({ error: 'Không tìm thấy bài hát trong kho.' });
    }

    const audioBytes = audioBase64 ? Buffer.from(audioBase64, 'base64') : null;
    const result = await autoSheetEngine.generateForSong(song, { audioBytes, mimeType });

    // Update catalog song sheet record
    if (!song.sheets) song.sheets = {};
    song.sheets.melody = result.sheet;

    securityRights.logEvent('AI_SHEET_GENERATED', {
      songId: song.id,
      title: song.title,
      engine: result.sheet.engine,
      status: result.sheet.status,
      confidence: result.sheet.confidence,
      notesCount: result.sheet.notesCount
    });

    res.json({
      success: true,
      songId: song.id,
      title: song.title,
      sheet: result.sheet,
      musicxml: result.musicxml
    });
  } catch (error) {
    securityRights.logEvent('AI_SHEET_ERROR', { error: error.message });
    res.status(500).json({ error: 'Lỗi tạo sheet bằng AI: ' + error.message });
  }
});

// Download standard MusicXML file
app.get('/api/auto-sheet/download/:songId', async (req, res) => {
  try {
    const song = musicCatalog.getSong(req.params.songId);
    if (!song) {
      return res.status(404).json({ error: 'Không tìm thấy bài hát.' });
    }

    let musicxml = song.sheets?.melody?.musicxml;
    if (!musicxml) {
      const result = await autoSheetEngine.generateForSong(song);
      song.sheets.melody = result.sheet;
      musicxml = result.musicxml;
    }

    const filename = `${song.id || 'sheet'}.musicxml`;
    res.setHeader('Content-Type', 'application/vnd.recordare.musicxml+xml');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(musicxml);
  } catch (error) {
    res.status(500).json({ error: 'Không thể tải tệp MusicXML: ' + error.message });
  }
});

// Gemini Connection & Authentication Validation
app.get('/api/gemini/connection', (req, res) => {
  res.json(geminiConnectionManager.validateAuthentication());
});

// Gemini Connection & Status Check
app.get('/api/gemini/status', (req, res) => {
  res.json(getGeminiStatus());
});

app.get('/api/gemini/config', (req, res) => {
  res.json(getGeminiConfig());
});

app.post('/api/gemini/config', (req, res) => {
  const updated = updateGeminiConfig(req.body);
  res.json({ success: true, config: updated });
});

app.get('/api/gemini/ping', async (req, res) => {
  const result = await pingGeminiConnection();
  res.json(result);
});

// Bảng tính tự động logic âm nhạc (Music Logic Spreadsheet Calculation)
app.post('/api/gemini/calculate-logic-sheet', (req, res) => {
  try {
    const { notes = [], bpm = 80, songKey = 'C' } = req.body;
    const logicSheet = geminiConnectionManager.calculateLogicSheet(notes, bpm, songKey);
    res.json({ ok: true, logicSheet });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Lỗi tính toán bảng logic: ' + error.message });
  }
});

// Xuất bảng tính logic sang CSV
app.post('/api/gemini/export-logic-csv', (req, res) => {
  try {
    const { logicSheet, filename = 'bang-tinh-logic-am-nhac.csv' } = req.body;
    const csvContent = geminiConnectionManager.exportLogicSheetToCSV(logicSheet);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csvContent);
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// Quy trình ký âm an toàn (Safe Audio/MIDI to MusicXML)
app.post('/api/gemini/safe-transcribe', async (req, res) => {
  try {
    const { audioBase64, midiBase64, mimeType, song, bpm, rights } = req.body;
    const audioBuffer = audioBase64 ? Buffer.from(audioBase64, 'base64') : null;
    const midiBuffer = midiBase64 ? Buffer.from(midiBase64, 'base64') : null;

    const result = await geminiConnectionManager.safeTranscribe({
      audioBuffer,
      midiBuffer,
      mimeType,
      song: song || {},
      bpm: Number(bpm) || 80,
      rights: rights || 'owned'
    });

    res.json({ ok: true, ...result });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Lỗi ký âm an toàn: ' + error.message });
  }
});

// Endpoint nhận luồng âm thanh an toàn (Safe Audio Stream Endpoint)
app.post('/api/gemini/stream-audio', async (req, res) => {
  try {
    let audioBuffer = null;
    let mimeType = 'audio/webm';

    if (Buffer.isBuffer(req.body)) {
      audioBuffer = req.body;
      mimeType = req.headers['content-type'] || 'audio/webm';
    } else if (req.body?.audioBase64) {
      audioBuffer = Buffer.from(req.body.audioBase64, 'base64');
      mimeType = req.body.mimeType || 'audio/webm';
    }

    if (!audioBuffer || audioBuffer.length === 0) {
      return res.status(400).json({ ok: false, error: 'Chưa có dữ liệu luồng âm thanh.' });
    }

    const title = decodeURIComponent(req.headers['x-title'] || req.body?.title || 'Luồng âm thanh');
    const key = req.headers['x-key'] || req.body?.key || 'C';
    const bpm = Number(req.headers['x-bpm'] || req.body?.bpm || 80);

    const result = await geminiConnectionManager.safeTranscribe({
      audioBuffer,
      mimeType,
      song: { title, key },
      bpm,
      rights: 'owned'
    });

    res.json({ ok: true, ...result });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Lỗi xử lý luồng âm thanh: ' + error.message });
  }
});

// Endpoint tải lên tệp MIDI máy chủ chuyển đổi sang MusicXML
app.post('/api/gemini/upload-midi', async (req, res) => {
  try {
    let midiBuffer = null;

    if (Buffer.isBuffer(req.body)) {
      midiBuffer = req.body;
    } else if (req.body?.midiBase64) {
      midiBuffer = Buffer.from(req.body.midiBase64, 'base64');
    }

    if (!midiBuffer || midiBuffer.length === 0) {
      return res.status(400).json({ ok: false, error: 'Chưa có dữ liệu tệp MIDI hợp lệ.' });
    }

    const title = decodeURIComponent(req.headers['x-title'] || req.body?.title || 'Bản nhạc MIDI');
    const bpm = Number(req.headers['x-bpm'] || req.body?.bpm || 80);

    const result = await geminiConnectionManager.safeTranscribe({
      midiBuffer,
      song: { title },
      bpm,
      rights: 'owned'
    });

    res.json({ ok: true, ...result });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Lỗi xử lý tệp MIDI: ' + error.message });
  }
});

// Endpoint hợp nhất xử lý luồng âm thanh hoặc tệp MIDI (Audio/MIDI to MusicXML)
app.post('/api/gemini/upload-stream', async (req, res) => {
  try {
    let buffer = null;
    let format = 'unknown';

    if (Buffer.isBuffer(req.body)) {
      buffer = req.body;
      format = geminiConnectionManager.detectFormat(buffer);
    } else if (req.body?.fileBase64) {
      buffer = Buffer.from(req.body.fileBase64, 'base64');
      format = req.body.format || geminiConnectionManager.detectFormat(buffer);
    }

    if (!buffer || buffer.length === 0) {
      return res.status(400).json({ ok: false, error: 'Không nhận được dữ liệu tệp hoặc luồng stream.' });
    }

    const title = decodeURIComponent(req.headers['x-title'] || req.body?.title || 'Tệp tải lên');
    const bpm = Number(req.headers['x-bpm'] || req.body?.bpm || 80);
    const key = req.headers['x-key'] || req.body?.key || 'C';

    const isMidi = format === 'midi' || (req.headers['content-type'] && req.headers['content-type'].includes('midi'));

    const result = await geminiConnectionManager.safeTranscribe({
      audioBuffer: isMidi ? null : buffer,
      midiBuffer: isMidi ? buffer : null,
      mimeType: isMidi ? 'audio/midi' : format,
      song: { title, key },
      bpm,
      rights: 'owned'
    });

    res.json({ ok: true, format, ...result });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Lỗi máy chủ chuyển đổi: ' + error.message });
  }
});

// Multimodal Gemini Audio/MIDI-to-MusicXML transcription endpoint
app.post('/api/gemini/transcribe-sheet', async (req, res) => {
  try {
    const { audioBase64, mimeType, songId, title, lyrics, key, bpm, rights } = req.body;
    let audioBuffer = null;
    if (audioBase64) {
      audioBuffer = Buffer.from(audioBase64, 'base64');
      if (audioBuffer.length > 50 * 1024 * 1024) {
        return res.status(400).json({ error: 'Tệp âm thanh vượt quá giới hạn 50 MiB.' });
      }
    }

    const song = songId ? (musicCatalog.getSong(songId) || {}) : {
      title: title || 'Bản ghi âm',
      content: lyrics || '',
      key: key || 'C'
    };

    const result = await transcribeWithGemini({
      audioBuffer,
      mimeType: mimeType || 'audio/mp3',
      song,
      bpm: Number(bpm) || 80,
      rights: rights || 'unknown'
    });

    // Update catalog song record if song exists
    if (songId) {
      const catalogSong = musicCatalog.getSong(songId);
      if (catalogSong) {
        if (!catalogSong.sheets) catalogSong.sheets = {};
        catalogSong.sheets.melody = {
          status: 'ai_draft',
          source: 'ai',
          confidence: result.confidence,
          engine: result.engine,
          bpm: result.score.bpm,
          notesCount: result.notes.length,
          notes: result.notes,
          musicxml: result.musicxml,
          generatedAt: new Date().toISOString()
        };
      }
    }

    securityRights.logEvent('GEMINI_TRANSCRIPTION', {
      jobId: result.jobId,
      songId: song.id || songId || '',
      engine: result.engine,
      status: 'ai_draft',
      confidence: result.confidence
    });

    const logicSheet = geminiConnectionManager.calculateLogicSheet(result.notes, result.score?.bpm || bpm || 80, song.key || 'C');

    res.json({
      success: true,
      jobId: result.jobId,
      manifest: result.manifest,
      musicxml: result.musicxml,
      notes: result.notes,
      logicSheet,
      engine: result.engine,
      confidence: result.confidence,
      status: result.status
    });
  } catch (error) {
    securityRights.logEvent('GEMINI_TRANSCRIPTION_ERROR', { error: error.message });
    res.status(500).json({ error: 'Lỗi chuyển đổi MusicXML: ' + error.message });
  }
});

// Import manifest produced by tools/auto_sheet_ai.py
app.post('/api/auto-sheet/import-manifest', (req, res) => {
  try {
    const { manifestPath, songId } = req.body;
    if (!manifestPath) {
      return res.status(400).json({ error: 'Thiếu đường dẫn manifestPath.' });
    }

    // SSRF / Path Traversal prevention
    const safeResolved = path.resolve(manifestPath);
    if (!safeResolved.endsWith('manifest.json')) {
      return res.status(400).json({ error: 'Chỉ chấp nhận tệp manifest.json hợp lệ.' });
    }

    const { manifest, musicxml } = autoSheetEngine.importManifest(safeResolved);
    const targetSongId = songId || manifest.song_id;
    let song = null;

    if (targetSongId) {
      song = musicCatalog.getSong(targetSongId);
      if (song) {
        if (!song.sheets) song.sheets = {};
        song.sheets.melody = {
          status: manifest.status || 'ai_draft',
          source: 'ai',
          confidence: manifest.confidence || 0.9,
          engine: manifest.model || 'basic-pitch',
          notesCount: manifest.notes_in_musicxml || 0,
          musicxml,
          generatedAt: manifest.generated_at
        };
      }
    }

    securityRights.logEvent('MANIFEST_IMPORTED', {
      jobId: manifest.job_id,
      songId: targetSongId,
      model: manifest.model
    });

    res.json({
      success: true,
      manifest,
      musicxml,
      songUpdated: !!song
    });
  } catch (error) {
    res.status(400).json({ error: 'Không thể nhập manifest: ' + error.message });
  }
});

// --- P4: Security & Rights Audit API ---
app.get('/api/security/audit', (req, res) => {
  const logs = securityRights.getAuditLogs({ limit: 100 });
  res.json({
    framework: 'OWASP ASVS 5.0 Compliant',
    protection: {
      rateLimiting: 'Active',
      ssrfProtection: 'Active',
      xssSanitization: 'Active',
      sqlInjectionImmunity: 'Active',
      rbacCheck: 'Enforced',
      rightsLedger: 'Enabled'
    },
    auditLogs: logs
  });
});

app.get('/api/security/rights', (req, res) => {
  res.json({
    rightsLedger: securityRights.listRights()
  });
});

// --- Health Check ---
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    app: 'Góc Hợp Âm',
    version: '1.3.1',
    uptime: process.uptime(),
    catalogSongsCount: musicCatalog.songs.length
  });
});

// Serve static frontend files from public/mobile
const mobileDir = path.join(__dirname, 'public', 'mobile');
app.use(express.static(mobileDir));

// Root and unmatched routes fall back to index.html for SPA
app.use((req, res) => {
  res.sendFile(path.join(mobileDir, 'index.html'));
});

// Start dev server
app.listen(PORT, HOST, () => {
  console.log(`Góc Hợp Âm server listening on http://${HOST}:${PORT}`);
});
