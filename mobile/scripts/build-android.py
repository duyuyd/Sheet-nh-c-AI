#!/usr/bin/env python3
"""Build without Gradle using the official Android SDK, ECJ and bundletool.

Only the installable preview APK is signed with a disposable Android debug key.
The production AAB deliberately remains unsigned for the owner's upload key.
"""
import argparse
import os
from pathlib import Path
import shutil
import subprocess
import zipfile

root = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser()
parser.add_argument('--android-jar', required=True, type=Path)
parser.add_argument('--build-tools', required=True, type=Path)
parser.add_argument('--ecj', required=True, type=Path)
parser.add_argument('--bundletool', required=True, type=Path)
parser.add_argument('--debug-keystore', required=True, type=Path)
args = parser.parse_args()
work = root / 'mobile/build'
work.mkdir(exist_ok=True)

def run(*command):
    subprocess.run([str(x) for x in command], check=True, cwd=root)

run('node', root / 'mobile/scripts/prepare-web.mjs')
for name in ['classes', 'dex']:
    p=work/name
    if p.exists(): shutil.rmtree(p)
    p.mkdir()
tools=args.build_tools.resolve()
for name in ['aapt2','zipalign']:
    (tools/name).chmod((tools/name).stat().st_mode | 0o111)
res=root/'mobile/android/app/src/main/res'
run(tools/'aapt2','compile','--dir',res,'-o',work/'resources.zip')
sources=sorted((root/'mobile/android/app/src/main/java').rglob('*.java'))
run('java','-jar',args.ecj,'-1.8','-encoding','UTF-8','-classpath',args.android_jar,'-d',work/'classes',*sources)
with zipfile.ZipFile(work/'classes.jar','w',zipfile.ZIP_DEFLATED) as z:
    for p in sorted((work/'classes').rglob('*.class')): z.write(p,p.relative_to(work/'classes'))
run('java','-cp',tools/'lib/d8.jar','com.android.tools.r8.D8','--release','--min-api','26','--lib',args.android_jar,'--output',work/'dex',work/'classes.jar')
manifest=root/'mobile/android/app/src/main/AndroidManifest.xml'
preview_manifest=work/'AndroidManifest-preview.xml'
preview_manifest.write_text(manifest.read_text().replace('package="vn.gochopam.app"','package="vn.gochopam.app.preview"').replace('vn.gochopam.app.recordings','vn.gochopam.app.preview.recordings').replace('android:label="Góc Hợp Âm"','android:label="Góc Hợp Âm · Thử"'))
run(tools/'aapt2','link','-o',work/'base.apk','--manifest',preview_manifest,'-I',args.android_jar,work/'resources.zip')
assets=['index.html','bundle.js','app.css','icon.svg','player.html','player.js']
with zipfile.ZipFile(work/'base.apk','a',zipfile.ZIP_DEFLATED) as z:
    z.write(work/'dex/classes.dex','classes.dex')
    for name in assets:z.write(root/'public/mobile'/name,'assets/'+name)
run(tools/'zipalign','-f','-p','4',work/'base.apk',work/'aligned.apk')
if not args.debug_keystore.exists():
    args.debug_keystore.parent.mkdir(parents=True,exist_ok=True)
    run('keytool','-genkeypair','-noprompt','-keystore',args.debug_keystore,'-storepass','android','-keypass','android','-alias','androiddebugkey','-keyalg','RSA','-keysize','2048','-validity','10000','-dname','CN=Android Debug,O=Android,C=US')
apk=work/'Goc_Hop_Am_Android_Cai_Thu.apk'
run('java','-jar',tools/'lib/apksigner.jar','sign','--ks',args.debug_keystore,'--ks-pass','pass:android','--key-pass','pass:android','--out',apk,work/'aligned.apk')
run('java','-jar',tools/'lib/apksigner.jar','verify','--verbose',apk)
run(tools/'aapt2','link','--proto-format','-o',work/'proto.apk','--manifest',manifest,'-I',args.android_jar,work/'resources.zip')
with zipfile.ZipFile(work/'base-module.zip','w',zipfile.ZIP_DEFLATED) as out:
    with zipfile.ZipFile(work/'proto.apk') as source:
        for item in source.namelist():out.writestr('manifest/AndroidManifest.xml' if item=='AndroidManifest.xml' else item,source.read(item))
    out.write(work/'dex/classes.dex','dex/classes.dex')
    for name in assets:out.write(root/'public/mobile'/name,'assets/'+name)
aab=work/'Goc_Hop_Am_Play_Chua_Ky.aab'
if aab.exists():aab.unlink()
run('java','-jar',args.bundletool,'build-bundle','--modules='+str(work/'base-module.zip'),'--output='+str(aab))
run('java','-jar',args.bundletool,'validate','--bundle='+str(aab))
print('Built preview APK and unsigned production AAB:',apk,aab,sep='\n')
