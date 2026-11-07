// tests/auto-sheet-and-catalog.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { musicCatalog } from '../lib/music-catalog.mjs';
import { autoSheetEngine } from '../lib/auto-sheet-engine.mjs';
import { securityRights } from '../lib/security-rights.mjs';

test('musicCatalog normalizes Vietnamese diacritics and finds songs by title and artist', () => {
  const result1 = musicCatalog.search({ query: 'nang tho' });
  assert.ok(result1.items.length > 0);
  assert.equal(result1.items[0].title, 'Nàng Thơ');
  assert.equal(result1.items[0].sheets.melody.status, 'verified');

  // NFD decomposition search
  const result2 = musicCatalog.search({ query: 'Nàng Thơ'.normalize('NFD') });
  assert.ok(result2.items.length > 0);
  assert.equal(result2.items[0].id, 'nang-tho');

  // Search by composer
  const result3 = musicCatalog.search({ query: 'Trịnh Công Sơn', type: 'composer' });
  assert.ok(result3.items.some(s => s.composer === 'Trịnh Công Sơn'));

  // Genre filtering
  const result4 = musicCatalog.search({ genre: '6' }); // Nhạc Đỏ
  assert.ok(result4.items.some(s => s.id === 'tien-quan-ca'));
  assert.equal(result4.items.find(s => s.id === 'tien-quan-ca').sheets.melody.status, 'verified');
});

test('autoSheetEngine deduplicates jobs by SHA-256 and marks AI outputs as ai_draft', async () => {
  const vlq = n => n < 128 ? [n] : [(n >> 7) | 128, n & 127];
  const file = events => Uint8Array.from([...Buffer.from('MThd'), 0, 0, 0, 6, 0, 0, 0, 1, 1, 224, ...Buffer.from('MTrk'), 0, 0, 0, events.length, ...events]);
  const dummyMidi = file([0, 255, 81, 3, 7, 161, 32, 0, 144, 60, 90, ...vlq(480), 128, 60, 0, 0, 144, 64, 90, ...vlq(480), 128, 64, 0, 0, 255, 47, 0]);

  const { job: job1, deduplicated: dedup1 } = autoSheetEngine.createJob({
    midiBytes: dummyMidi,
    songId: 'song-test-1',
    title: 'Giai điệu thử nghiệm',
    rights: 'owned',
    bpm: 120
  });

  assert.equal(dedup1, false);
  assert.equal(job1.status, 'completed');
  assert.equal(job1.verified, false);
  assert.ok(job1.confidence >= 0.7);
  assert.ok(job1.musicxml.includes('score-partwise'));
  assert.ok(job1.musicxml.includes('<work-title>Giai điệu thử nghiệm</work-title>'));

  // Submit identical MIDI data -> must deduplicate
  const { job: job2, deduplicated: dedup2 } = autoSheetEngine.createJob({
    midiBytes: dummyMidi,
    songId: 'song-test-1',
    title: 'Giai điệu thử nghiệm lần 2'
  });

  assert.equal(dedup2, true);
  assert.equal(job2.jobId, job1.jobId);
});

test('autoSheetEngine handles audio transcription and preserves error queue without crashes', () => {
  const dummyAudio = Buffer.alloc(1024, 42);
  const { job } = autoSheetEngine.createJob({
    audioBytes: dummyAudio,
    title: 'Bản thu giọng hát mẫu',
    bpm: 84
  });

  assert.equal(job.status, 'completed');
  assert.equal(job.verified, false);
  assert.ok(job.notes.length > 0);
  assert.ok(job.confidence >= 0.75);
  assert.ok(job.musicxml.includes('<measure number="1">'));

  // Invalid empty job throws clear error
  assert.throws(() => autoSheetEngine.createJob({}), /Cần cung cấp dữ liệu/);
});

test('securityRights blocks SSRF attempts and records audit ledger entries', () => {
  // SSRF blocks
  assert.equal(securityRights.validateSafeUrl('http://127.0.0.1:8080/admin'), false);
  assert.equal(securityRights.validateSafeUrl('http://localhost:3000'), false);
  assert.equal(securityRights.validateSafeUrl('http://10.0.0.1/secrets'), false);
  assert.equal(securityRights.validateSafeUrl('http://192.168.1.1/router'), false);
  assert.equal(securityRights.validateSafeUrl('file:///etc/passwd'), false);

  // SSRF allows trusted music sites
  assert.equal(securityRights.validateSafeUrl('https://goc-hop-am.onwardcrust.chatgpt.site/bai-hat/mo-ho'), true);
  assert.equal(securityRights.validateSafeUrl('https://www.youtube.com/watch?v=M7lc1UVf-VE'), true);
  assert.equal(securityRights.validateSafeUrl('https://musescore.com/sheetmusic'), true);

  // Rights ledger
  const rights = securityRights.getRights('site:nang-tho');
  assert.ok(rights);
  assert.equal(rights.composer, 'Hoàng Dũng');
  assert.equal(rights.rights, 'owned');

  // Rate limiter
  const ip = '198.51.100.22';
  for (let i = 0; i < 5; i++) {
    const check = securityRights.checkRateLimit(ip, 10);
    assert.equal(check.allowed, true);
  }
});

test('autoSheetEngine generates AI draft MusicXML 4.0 for songs lacking verified sheet', async () => {
  const songMissing = musicCatalog.getSong('ve-que-ngoai');
  assert.ok(songMissing);
  assert.equal(songMissing.sheets.melody.status, 'missing');

  const result = await autoSheetEngine.generateForSong(songMissing);
  assert.ok(result.sheet);
  assert.equal(result.sheet.status, 'ai_draft');
  assert.equal(result.sheet.source, 'ai');
  assert.ok(result.sheet.confidence >= 0.8);
  assert.ok(result.sheet.notes.length >= 8);
  assert.equal(result.score.verified, false);

  // Validate MusicXML 4.0 format
  assert.ok(result.musicxml.includes('<?xml version="1.0" encoding="utf-8"?>'));
  assert.ok(result.musicxml.includes('<score-partwise version="4.0">'));
  assert.ok(result.musicxml.includes('<work-title>Về Quê Ngoại</work-title>'));
  assert.ok(result.musicxml.includes('<attributes><divisions>2</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time>'));
  assert.ok(result.musicxml.includes('<measure number="1">'));

  // Ensure every note in the score has valid MIDI pitch in 48..84 and duration in [0.5, 1, 2, 4]
  for (const n of result.sheet.notes) {
    if (n.midi !== null) {
      assert.ok(n.midi >= 48 && n.midi <= 84, `Nốt ${n.midi} phải nằm trong dải C3-C6`);
    }
    assert.ok([0.5, 1, 2, 4].includes(n.beats), `Trường độ ${n.beats} phải là nhịp hợp lệ`);
  }
});

