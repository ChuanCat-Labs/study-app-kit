import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {ROOT, args, readJSON, writeJSON, inside, main} from './lib.mjs';

main(() => {
  const opts = args();
  if (opts['--help']) {console.log('node tools/create-project.mjs --course-id my-course [--name 名称] [--icon 原图.png] [--example] [--output 目录]'); return;}
  const id = opts['--course-id'];
  if (typeof id !== 'string' || !/^[a-z][a-z0-9-]{0,62}$/.test(id)) throw new Error('请用 --course-id 提供以小写字母开始的课程ID。');
  const dest = path.resolve(opts['--output'] || path.join(ROOT, 'local/projects', id));
  if (fs.existsSync(dest)) throw new Error('目标已存在；创建操作不会覆盖项目。');
  const manifest = readJSON(path.join(ROOT, 'public-files.json'));
  const contents = manifest.files.map(name => [name, fs.readFileSync(inside(ROOT, name))]);
  let customIcon;
  if (opts['--icon']) {
    customIcon = fs.readFileSync(path.resolve(opts['--icon']));
    if (!customIcon.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) throw new Error('自选图标必须是PNG文件。');
  }
  fs.mkdirSync(dest, {recursive: true});
  for (const [name, content] of contents) {
    const target = inside(dest, name, {mustExist: false});
    fs.mkdirSync(path.dirname(target), {recursive: true}); fs.writeFileSync(target, content);
  }
  const config = readJSON(path.join(dest, 'app-config.json'));
  config.applicationId = 'org.studyapp.c' + crypto.randomBytes(6).toString('hex');
  config.label = opts['--name'] || '复习助手'; config.versionName = '1.0.0'; config.versionCode = 1;
  if (customIcon) {config.icon = 'assets/custom-icon.png'; fs.writeFileSync(path.join(dest, config.icon), customIcon);}
  writeJSON(path.join(dest, 'app-config.json'), config);
  const production = readJSON(path.join(dest, 'production.json'));
  production.personalization.iconChoice = customIcon ? 'custom' : 'default-black-cat';
  // Supplying a value is not proof that the user reviewed the final appearance.
  writeJSON(path.join(dest, 'production.json'), production);
  const course = readJSON(path.join(dest, opts['--example'] ? 'tests/fixtures/ui-course.json' : 'course-data.json'));
  course.id = id; course.title = config.label; course.version = '1';
  writeJSON(path.join(dest, 'course-data.json'), course);
  writeJSON(path.join(dest, '.local/source-manifest.json'), {schemaVersion: 1, sources: []});
  writeJSON(path.join(dest, '.local/content-review.json'), {schemaVersion: 1, items: []});
  writeJSON(path.join(dest, '.local/project-origin.json'), {kitVersion: '0.1.1', createdAt: new Date().toISOString(), example: !!opts['--example']});
  if (opts['--example']) {
    const intake = spawnSync(process.execPath, [path.join(dest, 'tools/intake.mjs'), '--project', dest,
      '--notes', path.join(dest, 'examples/neutral/notes.md'), '--textbook', path.join(dest, 'examples/neutral/textbook.md')], {encoding: 'utf8'});
    if (intake.status !== 0) throw new Error('示例来源登记失败：' + intake.stderr);
    const sources = readJSON(path.join(dest, '.local/source-manifest.json')).sources;
    const ledger = readJSON(path.join(dest, 'examples/neutral/review-ledger.json'));
    for (const item of ledger.items) item.sourceIds = sources.map(s => s.id);
    writeJSON(path.join(dest, '.local/content-review.json'), ledger);
    production.exam.scope = 'neutral-example-only';
    production.exam.questionTypes = ['choice', 'judgment', 'fill', 'essay'];
    writeJSON(path.join(dest, 'production.json'), production);
  }
  const prepared = spawnSync(process.execPath, [path.join(dest, 'tools/prepare-course.mjs')], {encoding: 'utf8'});
  if (prepared.status !== 0) throw new Error('项目已创建，但课程准备失败：' + prepared.stderr);
  console.log(JSON.stringify({created: true, courseId: id, name: config.label, icon: production.personalization.iconChoice,
    project: path.relative(process.cwd(), dest), next: '运行 check-project.mjs；确认名称和图标；建议同时提供个人整理资料与原教材。'}, null, 2));
});
