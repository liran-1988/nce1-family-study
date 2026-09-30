"""Build a small offline APK using the installed Android SDK; never edits index.html."""
from pathlib import Path
import argparse
import hashlib
import json
import os
import secrets
import shutil
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parent
APP = ROOT.parent
PRIVATE = ROOT / '.private'
BUILD = ROOT / 'build'
DELIVERY = APP / 'delivery-android'
SDK = Path(os.environ.get('ANDROID_SDK_ROOT') or os.environ.get('ANDROID_HOME') or Path.home() / 'AppData/Local/Android/Sdk')
TOOLS = SDK / 'build-tools/34.0.0'
JAVA = Path(os.environ.get('JAVA_HOME', r'C:\Program Files\Java\jdk-17')) / 'bin'
ANDROID = next((p for p in sorted((SDK / 'platforms').glob('android-34*/android.jar')) if zipfile.is_zipfile(p)), SDK / 'platforms/android-34/android.jar')
PDF_SOURCE = Path('D:/BaiduNetdiskDownload/新概念英语/2. 新概念1-【2024版】/电子资料')
PDFS = {'student': '新概念英语第一册学生用书.pdf', 'workbook': '新概念英语第一册练习册附答案.pdf', 'teacher': '新概念英语 1（教师用书）.pdf'}


def run(*args, env=None):
    subprocess.run([str(a) for a in args], check=True, cwd=ROOT, env=env)


def java_tool(tool, *args, env=None):
    if tool == 'd8':
        run(JAVA / 'java.exe', '-cp', TOOLS / 'lib/d8.jar', 'com.android.tools.r8.D8', *args, env=env)
    else:
        run(JAVA / 'java.exe', '-jar', TOOLS / 'lib' / (tool + '.jar'), *args, env=env)


def signing():
    PRIVATE.mkdir(exist_ok=True)
    store, password = PRIVATE / 'family-release.jks', PRIVATE / 'password.txt'
    if store.exists() != password.exists():
        raise RuntimeError('Incomplete signing material; do not regenerate or lose update identity')
    if not store.exists():
        password.write_text(secrets.token_urlsafe(40), encoding='utf-8')
        run(JAVA / 'keytool.exe', '-genkeypair', '-keystore', store, '-storetype', 'JKS',
            '-storepass:file', password, '-keypass:file', password, '-alias', 'family-release',
            '-keyalg', 'RSA', '-keysize', '3072', '-validity', '36500',
            '-dname', 'CN=NCE1 Family Offline, OU=Home, O=Private Family, C=CN')
    # Only the owning Windows account and SYSTEM should be able to read signing material.
    username = os.environ.get('USERNAME')
    if os.name == 'nt' and username:
        run('icacls', PRIVATE, '/inheritance:r', '/grant:r', f'{username}:(OI)(CI)F', 'SYSTEM:(OI)(CI)F')
    return store, password


def assets(test_page=False):
    dest = BUILD / 'assets'
    dest.mkdir()
    shutil.copy2(ROOT / 'test-index.html' if test_page else APP / 'index.html', dest / 'index.html')
    # Current page embeds course data. Relative source data needed by future UI are copied too.
    for item in APP.glob('*.json'):
        if item.name.startswith(('data-', 'text-', 'grammar-', 'quiz-')):
            shutil.copy2(item, dest / item.name)
    for folder in ('books',):
        (dest / folder).mkdir()
    for key, name in PDFS.items():
        shutil.copy2(PDF_SOURCE / name, dest / 'books' / (key + '.pdf'))
    source_map = ROOT / 'media-map.json'
    mapping = json.loads(source_map.read_text(encoding='utf-8'))
    if mapping.get('version') != 1:
        raise ValueError('media-map version must be 1')
    for lesson, entries in mapping['videos'].items():
        if not 1 <= int(lesson) <= 144 or not isinstance(entries, list):
            raise ValueError('Invalid lesson videos')
        for item in entries:
            path = item['path']
            if not path or path.startswith('/') or any(c in path for c in '\\:%?#') or any(p in ('', '.', '..') for p in path.split('/')):
                raise ValueError('Unsafe media path')
    shutil.copy2(source_map, dest / 'media-map.json')
    return dest


def build(version_code, test_page=False):
    for path in (JAVA / 'javac.exe', ANDROID, TOOLS / 'aapt2.exe', TOOLS / 'lib/d8.jar', TOOLS / 'lib/apksigner.jar'):
        if not path.is_file():
            raise FileNotFoundError(path)
    if BUILD.exists():
        shutil.rmtree(BUILD)
    BUILD.mkdir()
    DELIVERY.mkdir(exist_ok=True)
    dest = assets(test_page)
    manifest = (ROOT / 'AndroidManifest.xml').read_text(encoding='utf-8')
    manifest = manifest.replace('android:versionCode="1"', f'android:versionCode="{version_code}"')
    (BUILD / 'AndroidManifest.xml').write_text(manifest, encoding='utf-8')
    run(TOOLS / 'aapt2.exe', 'compile', '--dir', ROOT / 'res', '-o', BUILD / 'resources.zip')
    run(TOOLS / 'aapt2.exe', 'link', '-o', BUILD / 'resources.apk', '-I', ANDROID,
        '--manifest', BUILD / 'AndroidManifest.xml', '--auto-add-overlay', BUILD / 'resources.zip')
    classes = BUILD / 'classes'
    classes.mkdir()
    sources = sorted((ROOT / 'src').rglob('*.java'))
    run(JAVA / 'javac.exe', '-encoding', 'UTF-8', '-source', '8', '-target', '8',
        '-bootclasspath', str(ANDROID) + os.pathsep + str(TOOLS / 'core-lambda-stubs.jar'), '-d', classes, *sources)
    jar = BUILD / 'classes.jar'
    with zipfile.ZipFile(jar, 'w', zipfile.ZIP_DEFLATED) as archive:
        for file in classes.rglob('*.class'):
            archive.write(file, file.relative_to(classes).as_posix())
    dex = BUILD / 'dex'
    dex.mkdir()
    java_tool('d8', '--release', '--min-api', '26', '--lib', ANDROID, '--output', dex, jar)
    unsigned = BUILD / 'unsigned.apk'
    shutil.copy2(BUILD / 'resources.apk', unsigned)
    with zipfile.ZipFile(unsigned, 'a', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for file in dest.rglob('*'):
            if file.is_file():
                archive.write(file, 'assets/' + file.relative_to(dest).as_posix())
        for file in dex.glob('*.dex'):
            archive.write(file, file.name)
    aligned = BUILD / 'aligned.apk'
    run(TOOLS / 'zipalign.exe', '-f', '4', unsigned, aligned)
    store, password = signing()
    output = (BUILD if test_page else DELIVERY) / ('test-native.apk' if test_page else 'nce1-family-offline.apk')
    java_tool('apksigner', 'sign', '--ks', store, '--ks-key-alias', 'family-release',
              '--ks-pass', 'file:' + str(password),
              '--out', output, aligned)
    java_tool('apksigner', 'verify', '--verbose', '--print-certs', output)
    run(TOOLS / 'zipalign.exe', '-c', '4', output)
    run(TOOLS / 'aapt.exe', 'dump', 'badging', output)
    report = {
        'apk': output.name, 'bytes': output.stat().st_size,
        'sha256': hashlib.sha256(output.read_bytes()).hexdigest(),
        'indexSha256': hashlib.sha256((dest / 'index.html').read_bytes()).hexdigest(),
        'mappingSha256': hashlib.sha256((dest / 'media-map.json').read_bytes()).hexdigest(),
        'versionCode': version_code, 'minSdk': 26, 'targetSdk': 34,
        'permissions': [], 'installationTest': 'NOT YET VERIFIED',
        'pdfs': {key: {'bytes': (dest / 'books' / (key + '.pdf')).stat().st_size,
                       'sha256': hashlib.sha256((dest / 'books' / (key + '.pdf')).read_bytes()).hexdigest()}
                 for key in PDFS}
    }
    ((BUILD if test_page else DELIVERY) / 'build-verification.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--version-code', type=int, default=1)
    parser.add_argument('--test-page', action='store_true', help='Native bridge verification page; never deliver this APK')
    options = parser.parse_args()
    if options.version_code < 1:
        parser.error('version-code must be positive')
    build(options.version_code, options.test_page)
