#!/usr/bin/env python3
"""Publish the compiled preview APK with its real checksum; never copy signing keys."""
from pathlib import Path
import hashlib
import json
import shutil

root = Path(__file__).resolve().parents[2]
apk = root / 'mobile/build/Goc_Hop_Am_Android_Cai_Thu.apk'
target = root / 'public/downloads/Goc_Hop_Am_Android_1.3.0.apk'
target.parent.mkdir(parents=True, exist_ok=True)
shutil.copyfile(apk, target)
release = {'version':'1.3.0','versionCode':5,'package':'vn.gochopam.app.preview','channel':'preview','download':'/downloads/'+target.name,'sizeBytes':target.stat().st_size,'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'author':'NPT Duy','sourceRepository':'https://github.com/duyuyd/goc-hop-am'}
(target.parent/'android-release.json').write_text(json.dumps(release,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(release,ensure_ascii=False))
