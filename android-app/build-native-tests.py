"""Build/install a separate Instrumentation APK, never expose debug controls in release."""
from pathlib import Path
import importlib.util
import shutil
import zipfile
import subprocess

ROOT = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('build', ROOT / 'build.py')
b = importlib.util.module_from_spec(spec)
spec.loader.exec_module(b)
DEST = ROOT / '.private' / 'native-tests'
DEST.mkdir(exist_ok=True)
manifest = '''<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="family.nce1.test" android:versionCode="1" android:versionName="1"><uses-sdk android:minSdkVersion="26" android:targetSdkVersion="34"/><application android:label="NCE native local tests"/><instrumentation android:name="family.nce1.test.NativeChecks" android:targetPackage="family.nce1.offline"/></manifest>'''
(DEST / 'AndroidManifest.xml').write_text(manifest, encoding='utf-8')
b.run(b.TOOLS / 'aapt2.exe', 'link', '-o', DEST / 'resources.apk', '-I', b.ANDROID, '--manifest', DEST / 'AndroidManifest.xml')
classes = DEST / 'classes'
classes.mkdir(exist_ok=True)
b.run(b.JAVA / 'javac.exe', '-encoding', 'UTF-8', '-source', '8', '-target', '8',
      '-bootclasspath', str(b.ANDROID) + ';' + str(b.TOOLS / 'core-lambda-stubs.jar'),
      '-d', classes, *sorted((ROOT / 'tests').rglob('*.java')))
with zipfile.ZipFile(DEST / 'classes.jar', 'w', zipfile.ZIP_DEFLATED) as archive:
    for file in classes.rglob('*.class'):
        archive.write(file, file.relative_to(classes).as_posix())
dex = DEST / 'dex'
dex.mkdir(exist_ok=True)
b.java_tool('d8', '--release', '--min-api', '26', '--lib', b.ANDROID, '--output', dex, DEST / 'classes.jar')
shutil.copy2(DEST / 'resources.apk', DEST / 'unsigned.apk')
with zipfile.ZipFile(DEST / 'unsigned.apk', 'a', zipfile.ZIP_DEFLATED) as archive:
    for file in dex.glob('*.dex'):
        archive.write(file, file.name)
b.run(b.TOOLS / 'zipalign.exe', '-f', '4', DEST / 'unsigned.apk', DEST / 'aligned.apk')
store, password = b.signing()
b.java_tool('apksigner', 'sign', '--ks', store, '--ks-key-alias', 'family-release', '--ks-pass', 'file:' + str(password),
           '--out', DEST / 'native-tests.apk', DEST / 'aligned.apk')
adb = [str(b.SDK / 'platform-tools/adb.exe'), '-s', 'emulator-5556']
subprocess.run(adb + ['install', '-r', str(DEST / 'native-tests.apk')], check=True)
subprocess.run(adb + ['shell', 'am', 'instrument', '-w', 'family.nce1.test/family.nce1.test.NativeChecks'], check=True)
