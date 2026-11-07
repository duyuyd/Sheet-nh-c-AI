"""Offline tests for AI worker logic. Real inference needs the optional model."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from types import SimpleNamespace

MODULE = Path(__file__).resolve().parents[1] / "tools" / "auto_sheet_ai.py"
spec = importlib.util.spec_from_file_location("goc_auto_sheet_ai", MODULE)
ai = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ai)

XML = """<?xml version="1.0" encoding="utf-8"?>
<score-partwise version="4.0">
<work><work-title>Original notes</work-title></work>
<part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
<part id="P1"><measure number="1">
<note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
<note><rest/><duration>1</duration><type>quarter</type></note>
<note><pitch><step>E</step><octave>4</octave></pitch><duration>2</duration><type>half</type></note>
</measure></part></score-partwise>"""


class AutoSheetTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.audio = self.root / "viet-nam.wav"
        self.audio.write_bytes(b"RIFF" + b"a" * 128)
        self.store = self.root / "store"
        self.db = ai.create_db(self.store)
        self.addCleanup(self.db.close)
        self.calls = []

    def predictor(self, input_path, midi_path):
        self.calls.append("predict")
        midi_path.write_bytes(b"MThd" + b"\0" * 40)
        return 2

    def convert(self, midi_path, xml_path):
        self.calls.append("convert")
        self.assertTrue(midi_path.read_bytes().startswith(b"MThd"))
        xml_path.write_text(XML, encoding="utf8")

    def test_real_paths_dedupe_persist_and_notes_not_claimed_verified(self):
        job_id = ai.queue_audio(self.db, self.audio, "bai-hat-1", "owned")
        self.assertEqual(job_id, ai.queue_audio(self.db, self.audio, "bai-hat-1", "owned"))
        result = ai.process_one(self.db, self.store, job_id,
                                predictor=self.predictor, converter=self.convert)
        self.assertEqual(result["status"], "ai_draft")
        self.assertEqual(result["source_rights"], "owned")
        self.assertFalse(result["verified"])
        self.assertIsNone(result["confidence"])
        self.assertEqual(result["notes_detected_in_midi"], 2)
        self.assertEqual(result["notes_in_musicxml"], 2)
        self.assertEqual(self.calls, ["predict", "convert"])
        self.assertTrue((self.store / "results" / job_id / "score.musicxml").exists())
        # Safe retry returns cached completed result, never calls the AI again.
        self.assertEqual(ai.process_one(self.db, self.store, job_id,
                                        predictor=self.predictor, converter=self.convert), result)
        self.assertEqual(self.calls, ["predict", "convert"])
        self.assertEqual(ai.run_queue(self.db, self.store), [])

    def test_invalid_and_missing_inputs_are_rejected(self):
        with self.assertRaises(ValueError):
            ai.queue_audio(self.db, self.audio, "../unsafe")
        with self.assertRaises(ValueError):
            ai.queue_audio(self.db, self.audio, rights="everyones_music_is_ours")
        bad = self.root / "index.html"
        bad.write_bytes(b"<html></html>")
        with self.assertRaises(ValueError):
            ai.queue_audio(self.db, bad)
        with self.assertRaises(FileNotFoundError):
            ai.queue_audio(self.db, self.root / "missing.wav")
        self.audio.write_bytes(b"")
        with self.assertRaises(ValueError):
            ai.queue_audio(self.db, self.audio)

    def test_no_synthetic_fallback_and_failure_is_persisted(self):
        job_id = ai.queue_audio(self.db, self.audio)
        def broken(_src, _dst):
            raise ValueError("No clear melody; not enough source data")
        with self.assertRaisesRegex(ValueError, "No clear melody"):
            ai.process_one(self.db, self.store, job_id, predictor=broken, converter=self.convert)
        record = self.db.execute("SELECT status,attempts,error FROM jobs WHERE job_id=?", (job_id,)).fetchone()
        self.assertEqual(record[0], "error")
        self.assertEqual(record[1], 1)
        self.assertIn("No clear melody", record[2])
        self.assertFalse((self.store / "results" / job_id / "score.musicxml").exists())
        # For a deterministically failed input the retry ceiling must be respected.
        for _ in range(2):
            with self.assertRaises(ValueError):
                ai.process_one(self.db, self.store, job_id, predictor=broken, converter=self.convert)
        with self.assertRaisesRegex(RuntimeError, "retry limit"):
            ai.process_one(self.db, self.store, job_id, predictor=broken, converter=self.convert)

    def test_rejects_invalid_xml_and_no_notes(self):
        invalid = self.root / "invalid.musicxml"
        invalid.write_text(XML.replace("<pitch>", "<other>").replace("</pitch>", "</other>"), encoding="utf8")
        with self.assertRaisesRegex(ValueError, "No pitched notes"):
            ai.verify_xml(invalid)
        with self.assertRaises(ai.ET.ParseError):
            invalid.write_text("<xml><broken>" + ("x" * 200), encoding="utf8")
            ai.verify_xml(invalid)

    def test_changed_audio_not_processed_against_stale_identity(self):
        job_id = ai.queue_audio(self.db, self.audio)
        self.audio.write_bytes(b"RIFF" + b"b" * 128)
        with self.assertRaisesRegex(ValueError, "changed"):
            ai.process_one(self.db, self.store, job_id, predictor=self.predictor, converter=self.convert)
        self.assertEqual(self.calls, [])


if __name__ == "__main__":
    unittest.main()
