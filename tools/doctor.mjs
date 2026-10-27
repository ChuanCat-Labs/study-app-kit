import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {args, main} from './lib.mjs';

main(() => {
  const opts = args(), win = process.platform === 'win32';
  const sdk = opts['--sdk'] || process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || path.join(os.homedir(), 'AppData/Local/Android/Sdk');
  const jdk = opts['--jdk'] || process.env.JAVA_HOME;
  const python = opts['--python'] || (win ? 'python' : 'python3');
  const probe = (cmd, parameters) => {
    const r = spawnSync(cmd, parameters, {encoding: 'utf8', timeout: 15000});
    return {available: r.status === 0, version: (r.stdout || r.stderr || '').trim().split(/\r?\n/)[0]};
  };
  const java = probe(jdk ? path.join(jdk, 'bin', 'java' + (win ? '.exe' : '')) : 'java', ['-version']);
  const py = probe(python, ['--version']);
  const checks = {node: {available: Number(process.versions.node.split('.')[0]) >= 20, version: process.version},
    python: {...py, available: py.available && /^Python 3\.(?:1[0-9]|[2-9][0-9])\./.test(py.version)},
    jdk: {...java, available: java.available && !!jdk && Number((java.version.match(/"(\d+)/) || [])[1]) >= 17},
    androidPlatform34: {available: fs.existsSync(path.join(sdk, 'platforms/android-34/android.jar'))},
    androidBuildTools34: {available: ['aapt2', 'aapt', 'zipalign'].every(n => fs.existsSync(path.join(sdk, 'build-tools/34.0.0', n + (win ? '.exe' : '')))) && fs.existsSync(path.join(sdk, 'build-tools/34.0.0/lib/apksigner.jar'))}};
  const ready = Object.values(checks).every(c => c.available);
  console.log(JSON.stringify({readyForAndroidBuild: ready, checks,
    hints: ready ? [] : ['Node.js 20+、Python 3.10+、JDK 17+；设置 JAVA_HOME 和 ANDROID_HOME 或传入 --jdk、--sdk。',
      'Android SDK需安装platforms;android-34与build-tools;34.0.0。浏览器预览只需要Node.js。'],
    changesMade: false}, null, 2));
  if (!ready) process.exitCode = 1;
});
