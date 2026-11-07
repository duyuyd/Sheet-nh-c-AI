// tests/gemini-connection-manager.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { geminiConnectionManager, GeminiConnectionManager } from '../lib/gemini-connection-manager.mjs';

test('GeminiConnectionManager.validateAuthentication checks key safely without leaking secrets', () => {
  const auth = geminiConnectionManager.validateAuthentication();
  assert.equal(typeof auth.authenticated, 'boolean');
  assert.equal(auth.model, 'gemini-3.8-flash');
  assert.equal(auth.provider, 'Google Gemini');
  assert.equal(auth.tier, 'free');

  // Strict: Never expose key contents
  const jsonStr = JSON.stringify(auth);
  assert.equal(jsonStr.includes('AIza'), false);
  assert.equal(jsonStr.includes('apiKey'), false);
});

test('GeminiConnectionManager calculates exact musical pitch frequency and note names', () => {
  // A4 = 440.00 Hz
  assert.equal(geminiConnectionManager.midiToFrequency(69), 440.0);
  assert.equal(geminiConnectionManager.midiToNoteName(69), 'A4');

  // Middle C (C4) = 261.63 Hz
  assert.equal(geminiConnectionManager.midiToFrequency(60), 261.63);
  assert.equal(geminiConnectionManager.midiToNoteName(60), 'C4');

  // G4 = 392.00 Hz
  assert.equal(geminiConnectionManager.midiToFrequency(67), 392.0);
  assert.equal(geminiConnectionManager.midiToNoteName(67), 'G4');

  // Rest
  assert.equal(geminiConnectionManager.midiToFrequency(null), null);
  assert.equal(geminiConnectionManager.midiToNoteName(null), 'Lặng (Rest)');
});

test('GeminiConnectionManager calculates harmonic scale degrees accurately', () => {
  // In key of C Major
  assert.equal(geminiConnectionManager.getHarmonicDegree(60, 'C'), 'I (Chủ âm)');
  assert.equal(geminiConnectionManager.getHarmonicDegree(62, 'C'), 'ii (Bậc hai thứ)');
  assert.equal(geminiConnectionManager.getHarmonicDegree(64, 'C'), 'iii (Bậc ba thứ)');
  assert.equal(geminiConnectionManager.getHarmonicDegree(65, 'C'), 'IV (Hạ át)');
  assert.equal(geminiConnectionManager.getHarmonicDegree(67, 'C'), 'V (Át)');
  assert.equal(geminiConnectionManager.getHarmonicDegree(69, 'C'), 'vi (Bậc sáu thứ)');
  assert.equal(geminiConnectionManager.getHarmonicDegree(71, 'C'), 'vii° (Dẫn âm)');
});

test('GeminiConnectionManager.calculateLogicSheet creates rigorous 4/4 measure spreadsheet matrix', () => {
  const sampleNotes = [
    { midi: 60, beats: 1, chord: 'C', lyric: 'Hát' },
    { midi: 64, beats: 1, lyric: 'lên' },
    { midi: 67, beats: 2, lyric: 'câu' }, // Measure 1: 1 + 1 + 2 = 4 beats
    { midi: 69, beats: 2, chord: 'Am', lyric: 'ca' },
    { midi: 67, beats: 1, lyric: 'yêu' },
    { midi: 65, beats: 1, lyric: 'đời' }  // Measure 2: 2 + 1 + 1 = 4 beats
  ];

  const logicSheet = geminiConnectionManager.calculateLogicSheet(sampleNotes, 90, 'C');
  assert.ok(logicSheet.metadata);
  assert.equal(logicSheet.metadata.bpm, 90);
  assert.equal(logicSheet.metadata.meter, '4/4');
  assert.equal(logicSheet.metadata.totalMeasures, 2);
  assert.equal(logicSheet.metadata.is44StrictlyAligned, true);
  assert.equal(logicSheet.metadata.alignedMeasuresRatio, '2/2 ô nhịp chuẩn 4/4');

  // Verify rows
  assert.equal(logicSheet.rows.length, 6);
  assert.equal(logicSheet.rows[0].measure, 1);
  assert.equal(logicSheet.rows[0].frequencyHz, 261.63);
  assert.equal(logicSheet.rows[0].harmonicDegree, 'I (Chủ âm)');
  assert.equal(logicSheet.rows[3].measure, 2);
  assert.equal(logicSheet.rows[3].frequencyHz, 440.0);
  assert.equal(logicSheet.rows[3].harmonicDegree, 'vi (Bậc sáu thứ)');

  // Verify measures
  assert.equal(logicSheet.measures.length, 2);
  assert.equal(logicSheet.measures[0].allocatedBeats, 4.0);
  assert.equal(logicSheet.measures[0].isAligned, true);
  assert.equal(logicSheet.measures[1].allocatedBeats, 4.0);
  assert.equal(logicSheet.measures[1].isAligned, true);
});

test('GeminiConnectionManager.exportLogicSheetToCSV formats proper CSV file', () => {
  const notes = [
    { midi: 60, beats: 2, chord: 'C' },
    { midi: 67, beats: 2, chord: 'G' }
  ];
  const logicSheet = geminiConnectionManager.calculateLogicSheet(notes, 80, 'C');
  const csv = geminiConnectionManager.exportLogicSheetToCSV(logicSheet);

  assert.ok(typeof csv === 'string');
  assert.ok(csv.includes('STT,Ô nhịp,Phách trong ô'));
  assert.ok(csv.includes('"C4"'));
  assert.ok(csv.includes('261.63'));
  assert.ok(csv.includes('"G4"'));
  assert.ok(csv.includes('392'));
});

test('GeminiConnectionManager.sanitizePayload validates input and catches oversized files', () => {
  const validBuffer = Buffer.from('RIFF....WAVEfmt ');
  const sanitized = geminiConnectionManager.sanitizePayload({ audioBuffer: validBuffer, mimeType: 'audio/wav' });
  assert.equal(sanitized.type, 'audio');
  assert.equal(sanitized.mimeType, 'audio/wav');
  assert.ok(sanitized.sha256);

  // Oversized audio rejection
  const hugeBuffer = Buffer.alloc(30 * 1024 * 1024); // 30MB > 25MB
  assert.throws(() => {
    geminiConnectionManager.sanitizePayload({ audioBuffer: hugeBuffer });
  }, /vượt quá giới hạn/);
});

test('GeminiConnectionManager.safeTranscribe produces MusicXML 4.0 and LogicSheet safely', async () => {
  const audioSample = Buffer.from('RIFF1234WAVEfmt ');
  const song = {
    title: 'Diễm Xưa',
    composer: 'Trịnh Công Sơn',
    key: 'Am',
    content: '[Am]Mưa vẫn mưa bay trên tầng tháp cổ [Dm]Dài tay em mấy thuở mắt xanh xao'
  };

  const result = await geminiConnectionManager.safeTranscribe({
    audioBuffer: audioSample,
    song,
    bpm: 72,
    rights: 'owned'
  });

  assert.ok(result.jobId);
  assert.equal(result.status, 'ai_draft');
  assert.equal(result.verified, false);
  assert.ok(result.notes.length >= 8);
  assert.ok(result.musicxml.includes('score-partwise'));
  assert.ok(result.logicSheet);
  assert.equal(result.logicSheet.metadata.bpm, 72);
  assert.ok(result.manifest);
});

test('GeminiConnectionManager.detectFormat identifies audio/MIDI file signatures', () => {
  assert.equal(geminiConnectionManager.detectFormat(Buffer.from('MThd\x00\x00\x00\x06')), 'midi');
  assert.equal(geminiConnectionManager.detectFormat(Buffer.from('RIFF\x24\x00\x00\x00WAVE')), 'audio/wav');
  assert.equal(geminiConnectionManager.detectFormat(Buffer.from('ID3\x04\x00\x00')), 'audio/mp3');
  assert.equal(geminiConnectionManager.detectFormat(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])), 'audio/webm');
  assert.equal(geminiConnectionManager.detectFormat(Buffer.from('fLaC\x00\x00')), 'audio/flac');
});

test('GeminiConnectionManager.safeTranscribe decodes MIDI file bytes into MusicXML 4.0 accurately', async () => {
  const { notesToSimpleMidi } = await import('../lib/gemini-client.mjs');
  const midiNotes = [
    { midi: 60, beats: 1 },
    { midi: 62, beats: 1 },
    { midi: 64, beats: 2 }
  ];
  const midiBytes = notesToSimpleMidi(midiNotes, 100);

  const result = await geminiConnectionManager.safeTranscribe({
    midiBuffer: midiBytes,
    song: { title: 'Bản MIDI Kiểm Thử' },
    bpm: 100
  });

  assert.ok(result.jobId);
  assert.equal(result.status, 'ai_draft');
  assert.ok(result.musicxml.includes('score-partwise'));
  assert.ok(result.musicxml.includes('<work-title>Bản MIDI Kiểm Thử</work-title>'));
  assert.ok(result.notes.length >= 3);
  assert.equal(result.engine, 'midi_engine');
  assert.ok(result.logicSheet);
  assert.equal(result.logicSheet.metadata.bpm, 100);
});
