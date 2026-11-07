#!/usr/bin/env python3
"""Góc Hợp Âm: zero-cloud-cost audio -> MIDI -> MusicXML AI worker.

Install with pip install -r tools/requirements-ai.txt. Basic Pitch performs
actual inference locally; music21 converts the result into notation.
No remote AI API, synthetic note fallbacks, or automatic public publishing.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import sqlite3
import subprocess
import tempfile
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timezone

SUPPORTED = {".wav", ".mp3", ".m4a", ".flac", ".ogg", ".aiff"}
MAX_BYTES = 50 * 1024 * 1024
MODEL_ID = "spotify/basic-pitch"
MODEL_REV = "local-default"
MAX_ATTEMPTS = 3


def stamp():
    return datetime.now(timezone.utc).isoformat()


def digest(path: Path):
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def inspect_audio(path: Path):
    path = Path(path).resolve(strict=True)
    if not path.is_file() or path.suffix.lower() not in SUPPORTED:
        raise ValueError("Expected a real supported audio file, not a link")
    size = path.stat().st_size
    if size <= 0 or size > MAX_BYTES:
        raise ValueError("Audio must be nonempty and at most 50 MiB")
    return path


def create_db(root: Path):
    root.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(str(root / "jobs.sqlite3"), timeout=30)
    con.execute("PRAGMA busy_timeout=30000")
    con.execute("""CREATE TABLE IF NOT EXISTS jobs (
        job_id TEXT PRIMARY KEY, input_path TEXT NOT NULL,
        song_id TEXT, rights TEXT NOT NULL, status TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0, error TEXT,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )""")
    con.commit()
    return con


def queue_audio(con, audio, song_id=None, rights="unknown"):
    if rights not in ("unknown", "owned", "licensed", "public_domain"):
        raise ValueError("Invalid source-rights status")
    path = inspect_audio(Path(audio))
    key = digest(path) + "-" + MODEL_REV
    clean_id = str(song_id or "").strip()
    if clean_id and (len(clean_id) > 100 or not all(ch.isascii() and (ch.isalnum() or ch in "._-") for ch in clean_id)):
        raise ValueError("song_id may only contain ASCII letters, digits, dot, underscore and dash")
    now = stamp()
    con.execute("INSERT OR IGNORE INTO jobs (job_id,input_path,song_id,rights,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?)",
                (key, str(path), clean_id, rights, "queued", now, now))
    con.commit()
    return key


def predict_basic_pitch(input_path: Path, midi_path: Path):
    # Imported only for an actual inference run. CI does not pretend to test model accuracy.
    from basic_pitch.inference import predict
    _raw, midi, _events = predict(str(input_path))
    notes = [n for instrument in midi.instruments if not instrument.is_drum for n in instrument.notes
             if n.end > n.start and 0 <= n.pitch <= 127]
    if not notes:
        raise ValueError("AI detected no actual playable notes")
    midi.write(str(midi_path))
    return len(notes)


def convert_midi(midi_path: Path, musicxml_path: Path):
    from music21 import converter
    score = converter.parse(str(midi_path), format="midi")
    score.write("musicxml", fp=str(musicxml_path))


def verify_xml(path: Path):
    if not path.is_file() or path.stat().st_size < 120:
        raise ValueError("MusicXML was not generated")
    root = ET.parse(path).getroot()
    if not root.tag.endswith("score-partwise") and not root.tag.endswith("score-timewise"):
        raise ValueError("Invalid MusicXML score root")
    notes = root.findall(".//{*}note")
    if not notes:
        notes = root.findall(".//note")
    sounded = [n for n in notes if n.find("{*}pitch") is not None or n.find("pitch") is not None]
    if not sounded:
        raise ValueError("No pitched notes in the generated score")
    return len(sounded)


def render_pdf_optional(xml_path, pdf_path):
    # MuseScore is free software; not bundled, no network calls.
    binary = next((shutil.which(exe) for exe in ("musescore", "musescore3", "mscore") if shutil.which(exe)), None)
    if not binary:
        return False
    try:
        subprocess.run([binary, "-o", str(pdf_path), str(xml_path)],
                       timeout=120, capture_output=True, check=True)
        return pdf_path.exists() and pdf_path.stat().st_size > 300
    except (OSError, subprocess.CalledProcessError, subprocess.TimeoutExpired):
        return False


def process_one(con, root: Path, job_id, predictor=None, converter=None, pdf=False):
    record = con.execute("SELECT input_path,song_id,rights,status,attempts FROM jobs WHERE job_id=?", (job_id,)).fetchone()
    if record is None:
        raise KeyError("Unknown queued audio job")
    input_path, song_id, rights, status, attempts = record
    output = root / "results" / job_id
    manifest_path = output / "manifest.json"
    if status == "ai_draft" and manifest_path.is_file() and (output / "notes.mid").exists() and (output / "score.musicxml").exists():
        return json.loads(manifest_path.read_text(encoding="utf8"))
    if status == "processing":
        raise RuntimeError("Job is already processing; do not start concurrently")
    if attempts >= MAX_ATTEMPTS:
        raise RuntimeError("Job reached retry limit; inspect errors and requeue explicitly")
    con.execute("UPDATE jobs SET status='processing',attempts=attempts+1,error=NULL,updated_at=? WHERE job_id=?",
                (stamp(), job_id))
    con.commit()
    temp = None
    try:
        path = inspect_audio(Path(input_path))
        if digest(path) + "-" + MODEL_REV != job_id:
            raise ValueError("Audio changed since it was queued")
        (root / "staging").mkdir(parents=True, exist_ok=True)
        temp = Path(tempfile.mkdtemp(prefix="sheet-", dir=root / "staging"))
        midi_path, xml_path = temp / "notes.mid", temp / "score.musicxml"
        note_count = (predictor or predict_basic_pitch)(path, midi_path)
        if not isinstance(note_count, int) or note_count < 1 or not midi_path.is_file() or midi_path.stat().st_size < 20:
            raise ValueError("AI did not produce playable MIDI")
        (converter or convert_midi)(midi_path, xml_path)
        xml_notes = verify_xml(xml_path)
        pdf_ready = render_pdf_optional(xml_path, temp / "score.pdf") if pdf else False
        manifest = {
            "job_id": job_id, "song_id": song_id, "status": "ai_draft",
            "source_audio_sha256": job_id.split("-", 1)[0],
            "source_rights": rights, "source_name": path.name,
            "model": MODEL_ID, "model_revision": MODEL_REV,
            "notes_detected_in_midi": note_count, "notes_in_musicxml": xml_notes,
            "verified": False, "confidence": None, "review_required": True,
            "midi": "notes.mid", "musicxml": "score.musicxml",
            "pdf": "score.pdf" if pdf_ready else None, "generated_at": stamp()
        }
        (temp / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf8")
        output.parent.mkdir(parents=True, exist_ok=True)
        if output.exists():
            shutil.rmtree(output)
        os.replace(temp, output)
        temp = None
        con.execute("UPDATE jobs SET status='ai_draft',error=NULL,updated_at=? WHERE job_id=?", (stamp(), job_id))
        con.commit()
        return manifest
    except Exception as exc:
        message = (type(exc).__name__ + ": " + str(exc))[:800]
        con.execute("UPDATE jobs SET status='error',error=?,updated_at=? WHERE job_id=?",
                    (message, stamp(), job_id))
        con.commit()
        raise
    finally:
        if temp is not None:
            shutil.rmtree(temp, ignore_errors=True)


def run_queue(con, root, max_jobs=10, **opts):
    results = []
    jobs = con.execute("SELECT job_id FROM jobs WHERE status IN ('queued','error') AND attempts<? ORDER BY created_at LIMIT ?",
                       (MAX_ATTEMPTS, max_jobs)).fetchall()
    for (job_id,) in jobs:
        try:
            result = process_one(con, root, job_id, **opts)
            results.append({"job_id": job_id, "status": result["status"]})
        except Exception as error:
            results.append({"job_id": job_id, "status": "error", "message": str(error)[:300]})
    return results


def main():
    ap = argparse.ArgumentParser(description="Góc Hợp Âm: free local audio-to-sheet AI worker")
    ap.add_argument("--input", type=Path, help="One local audio file")
    ap.add_argument("--scan", type=Path, help="Scan a local directory, not remote websites")
    ap.add_argument("--song-id", default="", help="Existing Góc Hợp Âm song ID")
    ap.add_argument("--rights", choices=("unknown", "owned", "licensed", "public_domain"), default="unknown")
    ap.add_argument("--store", type=Path, default=Path(".goc-hop-am-ai"))
    ap.add_argument("--pdf", action="store_true", help="Render with local MuseScore if installed")
    ap.add_argument("--max-jobs", type=int, default=10)
    args = ap.parse_args()
    root = args.store.expanduser().resolve()
    with create_db(root) as db:
        if args.input:
            queue_audio(db, args.input, args.song_id, args.rights)
        if args.scan:
            folder = args.scan.expanduser().resolve(strict=True)
            if not folder.is_dir():
                ap.error("--scan must be a local directory")
            for path in sorted(folder.iterdir()):
                if path.is_file() and path.suffix.lower() in SUPPORTED:
                    try:
                        queue_audio(db, path, None, args.rights)
                    except (ValueError, OSError):
                        pass
        report = run_queue(db, root, max_jobs=max(1, min(100, args.max_jobs)), pdf=args.pdf)
        print(json.dumps(report, ensure_ascii=False, indent=2))
        if any(x["status"] == "error" for x in report):
            raise SystemExit(1)


if __name__ == "__main__":
    main()
