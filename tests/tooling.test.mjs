import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {spawn, spawnSync} from 'node:child_process';
import {once} from 'node:events';
import {ROOT, readJSON, writeJSON, inside, validateProject} from '../tools/lib.mjs';
import {audit} from '../tools/audit-public.mjs';

function temporary(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'study-app-kit-test-'));
  t.after(() => {
    const resolved = fs.realpathSync(directory), base = fs.realpathSync(os.tmpdir());
    assert(resolved.startsWith(base + path.sep) && path.basename(resolved).startsWith('study-app-kit-test-'));
    fs.rmSync(resolved, {recursive: true, force: true});
  });
  return directory;
}
function command(name, ...parameters) {
  return spawnSync(process.execPath, [path.join(ROOT, 'tools', name), ...parameters], {encoding: 'utf8'});
}
function create(t, extra = []) {
  const project = path.join(temporary(t), 'course');
  const result = command('create-project.mjs', '--course-id', 'neutral-test', '--name', '测试复习', '--output', project, ...extra);
  assert.equal(result.status, 0, result.stderr); return project;
}

test('new project is empty, self contained, distinct and keeps choices pending', t => {
  const project = create(t), {course, config} = validateProject(project);
  assert.equal(course.id, 'neutral-test'); assert.equal(course.lessons.length, 0);
  assert.equal(config.label, '测试复习'); assert.match(config.applicationId, /^org\.studyapp\.c[a-f0-9]{12}$/);
  assert.notEqual(config.applicationId, readJSON(path.join(ROOT, 'app-config.json')).applicationId);
  assert.equal(readJSON(path.join(project, 'production.json')).personalization.iconReviewed, false);
  assert(fs.existsSync(path.join(project, 'tools/build-apk.py')));
  assert(!fs.existsSync(path.join(project, '.git'))); assert(!fs.existsSync(path.join(project, '.signing')));
  const result = spawnSync(process.execPath, [path.join(project, 'tools/check-project.mjs')], {cwd: project, encoding: 'utf8'});
  assert.equal(result.status, 0, result.stderr);
  assert(JSON.parse(result.stdout).notices.some(n => n.includes('原教材')));
});

test('creation refuses existing destination without changing files', t => {
  const project = create(t), file = path.join(project, 'course-data.json'), before = fs.readFileSync(file);
  const result = command('create-project.mjs', '--course-id', 'another', '--output', project);
  assert.notEqual(result.status, 0); assert(fs.readFileSync(file).equals(before));
});

test('invalid course ID and invalid custom icon do not create output', t => {
  const temp = temporary(t), output = path.join(temp, 'bad'), fake = path.join(temp, 'icon.png');
  fs.writeFileSync(fake, 'not an image');
  for (const parameters of [['--course-id', '../bad'], ['--course-id', 'valid', '--icon', fake]]) {
    const result = command('create-project.mjs', ...parameters, '--output', output);
    assert.notEqual(result.status, 0); assert(!fs.existsSync(output));
  }
});

test('default and selected icons preserve exact bytes', t => {
  const project = create(t), original = fs.readFileSync(path.join(ROOT, 'assets/app-icon.png'));
  assert(fs.readFileSync(path.join(project, 'assets/app-icon.png')).equals(original));
  const other = path.join(temporary(t), 'custom');
  const result = command('create-project.mjs', '--course-id', 'custom', '--icon', path.join(ROOT, 'assets/app-icon.png'), '--output', other);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readJSON(path.join(other, 'app-config.json')).icon, 'assets/custom-icon.png');
  assert(fs.readFileSync(path.join(other, 'assets/custom-icon.png')).equals(original));
});

test('example creates four lessons, four formats, two preserved sources and a complete mapping', t => {
  const project = create(t, ['--example']), {course} = validateProject(project);
  assert.equal(course.lessons.length, 4); assert.equal(course.questions.length, 4);
  assert.deepEqual(new Set(course.questions.map(q => q.format || q.type)), new Set(['choice', 'judgment', 'fill', 'essay']));
  const sources = readJSON(path.join(project, '.local/source-manifest.json')).sources;
  assert.deepEqual(sources.map(s => s.role).sort(), ['notes', 'textbook']);
  for (const source of sources) {
    const bytes = fs.readFileSync(path.join(project, source.file));
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), source.sha256);
    assert.equal(source.review, 'pending');
  }
  const ledger = readJSON(path.join(project, '.local/content-review.json'));
  assert.deepEqual(ledger.items.map(i => i.lessonId), ['l1', 'l2', 'l3', 'l4']);
  assert(ledger.items.every(i => i.sourceIds.length === 2));
  assert.equal(readJSON(path.join(ROOT, 'course-data.json')).lessons.length, 0);
});

test('intake deduplicates by role and hash, keeps source bytes and never records absolute origins', t => {
  const project = create(t), source = path.join(temporary(t), 'notes.md'), original = '# 甲\n1. 乙\n';
  fs.writeFileSync(source, original);
  const originalArgs = ['--project', project, '--notes', source];
  assert.equal(command('intake.mjs', ...originalArgs).status, 0);
  assert.equal(JSON.parse(command('intake.mjs', ...originalArgs).stdout).added, 0);
  assert.equal(command('intake.mjs', '--project', project, '--textbook', source).status, 0);
  const raw = fs.readFileSync(path.join(project, '.local/source-manifest.json'), 'utf8'), sources = JSON.parse(raw).sources;
  assert.equal(sources.length, 2); assert(!raw.includes(path.dirname(source)));
  assert.equal(fs.readFileSync(path.join(project, sources[0].file), 'utf8'), original);
  assert.equal(fs.readFileSync(source, 'utf8'), original);
  assert.equal(JSON.parse(command('check-project.mjs', '--project', project).stdout).notices.some(n => n.includes('建议同时')), false);
});

test('intake rejects unsupported files before modifying registry', t => {
  const project = create(t), source = path.join(temporary(t), 'unknown.bin'), registry = path.join(project, '.local/source-manifest.json');
  fs.writeFileSync(source, 'binary'); const before = fs.readFileSync(registry);
  const result = command('intake.mjs', '--project', project, '--notes', source);
  assert.notEqual(result.status, 0); assert(fs.readFileSync(registry).equals(before));
});

test('project check distinguishes unresolved content from structural validation', t => {
  const project = create(t);
  writeJSON(path.join(project, '.local/content-review.json'), {items: [{id: 'review-a', status: 'pending', question: '这里是哪个符号？'}]});
  const result = JSON.parse(command('check-project.mjs', '--project', project).stdout);
  assert.equal(result.valid, true); assert.equal(result.unresolved.length, 1);
  assert.equal(result.validationScope, 'structure-and-local-assets-only');
});

test('course preparation rejects a missing local image before replacing runtime data', t => {
  const project = create(t, ['--example']), file = path.join(project, 'course-data.json'), data = readJSON(file);
  const before = fs.readFileSync(path.join(project, 'course-data.js'));
  data.lessons[2].refs[0].image = 'images/missing.png'; writeJSON(file, data);
  assert.notEqual(command('prepare-course.mjs', '--project', project).status, 0);
  assert(fs.readFileSync(path.join(project, 'course-data.js')).equals(before));
});

test('relative-path resolver rejects traversal and absolute paths', () => {
  for (const name of ['../outside', '/outside', 'C:/outside', 'assets\\bad.png']) assert.throws(() => inside(ROOT, name));
});

test('private original images cannot be referenced into the runtime or package', t => {
  const project = create(t, ['--example']), file = path.join(project, 'course-data.json'), data = readJSON(file);
  const secret = path.join(project, '.local/private.png');
  fs.copyFileSync(path.join(ROOT, 'assets/app-icon.png'), secret);
  data.lessons[2].refs[0].image = '.local/private.png'; writeJSON(file, data);
  assert.throws(() => validateProject(project), /私有/);
  assert.notEqual(command('prepare-course.mjs', '--project', project).status, 0);
});

test('public audit detects unlisted files, stale runtime data and private patterns without echoing values', t => {
  const directory = temporary(t), files = ['public-files.json', 'course-data.json', 'course-data.js', 'app-config.json', 'readme.md'];
  for (const name of files.filter(n => n !== 'readme.md')) fs.copyFileSync(path.join(ROOT, name), path.join(directory, name));
  writeJSON(path.join(directory, 'public-files.json'), {files}); fs.writeFileSync(path.join(directory, 'readme.md'), 'neutral');
  assert.equal(audit(directory).passed, true);
  const contact = ['private-name', 'example.invalid'].join('@'); fs.writeFileSync(path.join(directory, 'readme.md'), contact);
  let report = audit(directory); assert(report.issues.some(i => i.rule === 'email-address')); assert(!JSON.stringify(report).includes(contact));
  fs.writeFileSync(path.join(directory, 'readme.md'), 'uniqueprivateword');
  report = audit(directory, ['uniqueprivateword']); assert(report.issues.some(i => i.rule === 'private-deny-list-match'));
  fs.writeFileSync(path.join(directory, 'unexpected.txt'), 'extra');
  assert(audit(directory).issues.some(i => i.rule === 'not-in-explicit-file-list'));
  fs.writeFileSync(path.join(directory, 'course-data.js'), 'window.COURSE_SOURCE = {};');
  assert(audit(directory).issues.some(i => i.rule === 'runtime-course-differs-from-empty-source'));
});

test('preview exposes only runtime and referenced media, including example source SVG', async t => {
  const project = create(t, ['--example']);
  fs.mkdirSync(path.join(project, '.signing')); fs.writeFileSync(path.join(project, '.signing/secret.txt'), 'test-secret');
  const child = spawn(process.execPath, [path.join(ROOT, 'tools/serve.mjs'), '--project', project, '--port', '0'], {stdio: ['ignore', 'pipe', 'pipe']});
  t.after(() => child.kill());
  const text = await new Promise((resolve, reject) => {
    let message = ''; const timer = setTimeout(() => reject(new Error('preview did not start')), 15000);
    child.stdout.on('data', bytes => {message += bytes.toString(); if (message.includes('Preview:')) {clearTimeout(timer); resolve(message);}});
    child.on('error', error => {clearTimeout(timer); reject(error);});
  });
  const url = text.match(/http:\/\/127\.0\.0\.1:\d+/)[0];
  for (const item of ['/', '/course-data.js', '/tests/fixtures/page.svg']) assert.equal((await fetch(url + item)).status, 200);
  for (const item of ['/production.json', '/.signing/secret.txt', '/.local/source-manifest.json', '/package.json', '/examples/neutral/notes.md']) assert.equal((await fetch(url + item)).status, 404);
  assert.equal((await fetch(url + '/', {method: 'POST'})).status, 405);
  child.kill(); await once(child, 'exit');
});
