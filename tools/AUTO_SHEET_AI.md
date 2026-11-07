# Góc Hợp Âm — Auto Sheet AI (free, local)

This module is part of the EXISTING Góc Hợp Âm repository. It does **not** create a new website and does **not** replace the Sites project. The worker runs inference on audio files the operator actually has and is authorized to process. It does not scrape, download or pretend to own audio from other music websites.

## Real AI processing

- Spotify Basic Pitch: sound -> **actual predicted MIDI notes**. Apache-2.0 code.
- music21: MIDI -> MusicXML, keeping notes, durations and rests where recoverable. BSD-3-Clause code.
- Optional locally installed MuseScore: render MusicXML -> PDF.
- Cache: SQLite job queue and source-file SHA256 deduplication. The same audio hash is not reprocessed if the output exists.
- Output: `notes.mid`, `score.musicxml`, optional `score.pdf`, and `manifest.json` under the configured local store directory.
- On failures: keep the queue's error state; up to 3 attempts; **no fabricated melody**. AI results remain `ai_draft`, not `verified`.
- All inference is local. No paid API key, no remote audio upload.

## Run on a local machine/server

```bash
python3.11 -m venv .venv
. .venv/bin/activate
pip install -r tools/requirements-ai.txt
python tools/auto_sheet_ai.py --input '/absolute/path/to/song.wav' --song-id YOUR_EXISTING_SONG_ID --rights owned --store ./goc-ai-results --pdf
```

Use `--scan /folder/with/permitted/audio` to queue many audio files. Jobs are deduplicated by the original audio bytes and persisted under `--store`. The `--rights` field is metadata, **not a grant of rights**. When unsure, leave it `unknown`.

## Practical limits

- Max input file size: 50 MiB; supported: WAV, MP3, M4A, FLAC, OGG, AIFF (actual codec support depends on installed decoders).
- Works best on isolated voice or one instrument. Dense commercial recordings may produce wrong/missing notes, rhythm and chord voicings.
- Does not generate lyrics from audio, identify songs by title, derive copyright permissions or guarantee exact piano/organ arrangements.
- Requires a local machine or a dedicated runner for inference. **This is not yet connected to the hosted Sites API or automatic 50,000-song processing.** No model can accurately transcribe an unavailable source recording.
- PDF export is optional and only runs when MuseScore is installed locally. If not, the MIDI and MusicXML remain usable.
- Output storage is local and persistent only while the configured store is retained. Arrange independent backups before production deployment.

## Next production integration boundary

The existing Sites project should enqueue a song only when authorized audio is available; a private worker processes the queue; a safe authenticated endpoint imports the resulting `manifest.json` + MusicXML into the Sites song record; an independent validation process can mark an AI draft as verified. Do **not** deploy an anonymous public endpoint running expensive AI inference or allow arbitrary audio URLs (SSRF/resource exhaustion).

## Test without downloading models

```bash
python -m unittest discover -s tests -p test_ai_sheet.py
```

These tests verify job persistence, deduplication, malformed inputs, failure handling and MusicXML integrity using fakes; they **do not** assert transcription accuracy until real audio benchmarks are available.
