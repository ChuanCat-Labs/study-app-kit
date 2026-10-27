"""Build the offline app from source. Never installs or publishes the result."""
from pathlib import Path
import argparse
import hashlib
import json
import os
import re
import secrets
import shutil
import subprocess
import tempfile
import zipfile
from xml.sax.saxutils import escape


KIT = Path(__file__).resolve().parents[1]
WEB = ['index.html', 'styles.css', 'mobile.css', 'learning.css', 'classroom.css',
       'app.js', 'presentation.js', 'course-schema.js', 'records.js', 'course-data.js']


def read_json(file):
    return json.loads(file.read_text(encoding='utf-8-sig'))


def write_json(file, value):
    file.parent.mkdir(parents=True, exist_ok=True)
    file.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf8')


def media(value):
    if isinstance(value, dict):
        for key, item in value.items():
            if key in ['image', 'src'] and isinstance(item, str):
                yield item
            else:
                yield from media(item)
    elif isinstance(value, list):
        for item in value:
            yield from media(item)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--project', type=Path, default=KIT)
    parser.add_argument('--sdk', type=Path, default=os.environ.get('ANDROID_HOME') or os.environ.get('ANDROID_SDK_ROOT') or Path.home() / 'AppData/Local/Android/Sdk')
    parser.add_argument('--jdk', type=Path, default=os.environ.get('JAVA_HOME'))
    parser.add_argument('--node', default=shutil.which('node'))
    parser.add_argument('--build-dir', type=Path, default=Path(tempfile.gettempdir()) / 'StudyAppKit-build')
    parser.add_argument('--keystore', type=Path, help='Existing private keystore; password in STUDYAPP_KEYSTORE_PASSWORD')
    parser.add_argument('--alias', default='study-app')
    args = parser.parse_args()
    if not args.jdk or not args.node:
        parser.error('Set JAVA_HOME and Node on PATH, or pass --jdk and --node.')
    root, sdk, jdk = args.project.resolve(strict=True), args.sdk.resolve(), args.jdk.resolve()
    exe = '.exe' if os.name == 'nt' else ''
    bt, android_jar = sdk / 'build-tools/34.0.0', sdk / 'platforms/android-34/android.jar'
    required = [android_jar, bt / ('aapt2' + exe), bt / ('zipalign' + exe),
                bt / ('aapt' + exe), bt / 'lib/apksigner.jar', bt / 'lib/d8.jar',
                jdk / ('bin/java' + exe), jdk / ('bin/javac' + exe), jdk / ('bin/keytool' + exe)]
    if any(not p.is_file() for p in required):
        parser.error('Missing Android SDK platform/build-tools 34.0.0 or JDK tools; run tools/doctor.mjs.')
    environment = os.environ.copy()

    def run(*command):
        result = subprocess.run([str(x) for x in command], capture_output=True, text=True,
                                encoding='utf8', errors='replace', env=environment)
        if result.returncode:
            raise RuntimeError(Path(str(command[0])).name + ':\n' + result.stdout + result.stderr)
        return result.stdout + result.stderr

    run(args.node, root / 'tools/prepare-course.mjs')
    run(args.node, root / 'tools/check-project.mjs')
    config, course = read_json(root / 'app-config.json'), read_json(root / 'course-data.json')

    def local_file(name):
        file = (root / name).resolve(strict=True)
        if not file.is_relative_to(root) or not file.is_file():
            raise ValueError('Asset must stay inside the project.')
        return file

    asset_names = sorted(set(WEB) | set(media(course)))
    payload = hashlib.sha256()
    for name in asset_names + [config['icon']]:
        payload.update(name.encode('utf8')); payload.update(local_file(name).read_bytes())
    for file in sorted((root / 'android').rglob('*')):
        if file.is_file():
            payload.update(file.relative_to(root).as_posix().encode('utf8')); payload.update(file.read_bytes())
    payload.update(json.dumps(config, sort_keys=True, ensure_ascii=False).encode('utf8'))
    payload_sha = payload.hexdigest()
    identity_file = root / '.signing/identity.json'
    previous = read_json(identity_file) if identity_file.exists() else None
    if previous:
        if previous['applicationId'] != config['applicationId'] or previous['courseId'] != course['id']:
            raise ValueError('Application/course identity changed; create a separate course project instead.')
        if config['versionCode'] < previous['versionCode'] or (config['versionCode'] == previous['versionCode'] and payload_sha != previous['payloadSha256']):
            raise ValueError('Content changed: increase versionCode before rebuilding an update.')

    private = root / '.signing'
    private.mkdir(exist_ok=True)
    key = args.keystore.resolve() if args.keystore else private / 'local-key.jks'
    secret_file = private / 'local-key.secret'
    supplied_password = environment.get('STUDYAPP_KEYSTORE_PASSWORD')
    if args.keystore:
        if not key.is_file() or not supplied_password:
            raise ValueError('Provide an existing keystore and STUDYAPP_KEYSTORE_PASSWORD. No replacement key is generated.')
    elif key.exists():
        if secret_file.exists():
            environment['STUDYAPP_KEYSTORE_PASSWORD'] = secret_file.read_text(encoding='utf8').strip()
        elif not supplied_password:
            raise ValueError('Existing key password is missing. Restore it; do not generate a new key for this app.')
    else:
        if previous:
            raise ValueError('Signing key is missing. Restore it to preserve update compatibility.')
        environment['STUDYAPP_KEYSTORE_PASSWORD'] = secrets.token_urlsafe(32)
        secret_file.write_text(environment['STUDYAPP_KEYSTORE_PASSWORD'], encoding='utf8')
        if os.name != 'nt':
            private.chmod(0o700); secret_file.chmod(0o600)
        run(jdk / ('bin/keytool' + exe), '-genkeypair', '-noprompt', '-keystore', key,
            '-storepass:env', 'STUDYAPP_KEYSTORE_PASSWORD', '-keypass:env', 'STUDYAPP_KEYSTORE_PASSWORD',
            '-alias', args.alias, '-keyalg', 'RSA', '-keysize', '2048', '-validity', '10000',
            '-dname', 'CN=Study App Local')

    # The only cleanup is of a fresh temporary stage, checked inside this build directory.
    build = args.build_dir.resolve()
    build.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='apk-', dir=build) as temporary:
        stage = Path(temporary).resolve()
        if not stage.is_relative_to(build):
            raise ValueError('Unexpected temporary build location.')
        native = stage / 'android'
        shutil.copytree(root / 'android', native)
        (native / 'res/drawable').mkdir(parents=True, exist_ok=True)
        shutil.copyfile(local_file(config['icon']), native / 'res/drawable/ic_launcher.png')
        label = escape(config['label']).replace('"', '\\"').replace("'", "\\'")
        (native / 'res/values/strings.xml').write_text('<resources><string name="app_name">' + label + '</string></resources>', encoding='utf8')
        (native / 'src/org/studyapp/kit/BuildConfig.java').write_text(
            'package org.studyapp.kit; final class BuildConfig { static final String APP_LABEL = ' +
            json.dumps(config['label']) + '; static final String COURSE_ID = ' + json.dumps(course['id']) + '; }', encoding='utf8')
        assets = stage / 'assets'; assets.mkdir()
        for name in asset_names:
            target = assets / name; target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(local_file(name), target)
        classes, dex, generated = [stage / n for n in ['classes', 'dex', 'generated']]
        for folder in [classes, dex, generated]:
            folder.mkdir()
        res, resources = stage / 'res.zip', stage / 'resources.apk'
        run(bt / ('aapt2' + exe), 'compile', '--no-crunch', '--dir', native / 'res', '-o', res)
        run(bt / ('aapt2' + exe), 'link', '-o', resources, '--manifest', native / 'AndroidManifest.xml',
            '-I', android_jar, '--java', generated, '--rename-manifest-package', config['applicationId'],
            '--version-code', config['versionCode'], '--version-name', config['versionName'], '-A', assets, res)
        run(jdk / ('bin/javac' + exe), '-encoding', 'UTF-8', '-source', '8', '-target', '8',
            '-classpath', android_jar, '-d', classes, *list((native / 'src').rglob('*.java')), *list(generated.rglob('*.java')))
        run(jdk / ('bin/java' + exe), '-cp', bt / 'lib/d8.jar', 'com.android.tools.r8.D8', '--lib',
            android_jar, '--min-api', '26', '--output', dex, *list(classes.rglob('*.class')))
        unsigned, aligned, signed = [stage / (n + '.apk') for n in ['unsigned', 'aligned', 'signed']]
        shutil.copyfile(resources, unsigned)
        with zipfile.ZipFile(unsigned, 'a', zipfile.ZIP_DEFLATED) as archive:
            for file in dex.glob('*.dex'):
                archive.write(file, file.name)
        run(bt / ('zipalign' + exe), '-f', '-p', '4', unsigned, aligned)
        run(jdk / ('bin/java' + exe), '-jar', bt / 'lib/apksigner.jar', 'sign', '--ks', key,
            '--ks-pass', 'env:STUDYAPP_KEYSTORE_PASSWORD', '--ks-key-alias', args.alias, '--out', signed, aligned)
        verification = run(jdk / ('bin/java' + exe), '-jar', bt / 'lib/apksigner.jar', 'verify', '--verbose', '--print-certs', signed)
        certificate = re.search(r'certificate SHA-256 digest: (\w+)', verification)
        if not certificate:
            raise ValueError('Signing certificate could not be verified.')
        certificate_sha = certificate.group(1)
        if previous and previous['certificateSha256'] != certificate_sha:
            raise ValueError('Signing certificate changed; update build stopped.')
        run(bt / ('zipalign' + exe), '-c', '4', signed)
        badging = run(bt / ('aapt' + exe), 'dump', 'badging', signed)
        if "name='" + config['applicationId'] + "'" not in badging:
            raise ValueError('Packaged application ID differs from configuration.')
        out = root / 'output'; out.mkdir(exist_ok=True)
        apk = out / ('study-app-' + config['versionName'] + '.apk')
        with zipfile.ZipFile(signed) as archive:
            for name in asset_names:
                if archive.read('assets/' + name) != local_file(name).read_bytes():
                    raise ValueError('Packaged asset differs: ' + name)
            if archive.read('res/drawable/ic_launcher.png') != local_file(config['icon']).read_bytes():
                raise ValueError('Packaged icon differs from original bytes.')
            packaged_assets = {name.removeprefix('assets/') for name in archive.namelist() if name.startswith('assets/') and not name.endswith('/')}
            if packaged_assets != set(asset_names):
                raise ValueError('Unexpected assets found in APK.')
        shutil.copyfile(signed, apk)
        identity = {'applicationId': config['applicationId'], 'courseId': course['id'],
                    'certificateSha256': certificate_sha, 'versionCode': config['versionCode'], 'payloadSha256': payload_sha}
        write_json(identity_file, identity)
        report = {**identity, 'appName': config['label'], 'versionName': config['versionName'], 'apk': apk.name,
                  'bytes': apk.stat().st_size, 'sha256': hashlib.sha256(apk.read_bytes()).hexdigest(),
                  'assetParity': True, 'assetCount': len(asset_names), 'iconParity': True,
                  'installation': 'not-performed', 'privateKeyIncluded': False}
        write_json(out / 'build-report.json', report)
        print(json.dumps(report, ensure_ascii=False))


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, ValueError, FileNotFoundError) as error:
        raise SystemExit(str(error))
