import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {ROOT, args, readJSON, inside, writeJSON, main} from './lib.mjs';

const ignoredDirectories = new Set(['.git', 'local', '.local', '.signing', 'output', 'build', 'node_modules', '__pycache__']);
function walk(root, directory = '') {
  const result = [];
  for (const entry of fs.readdirSync(path.join(root, directory), {withFileTypes: true})) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const relative = directory ? directory + '/' + entry.name : entry.name;
    if (entry.isSymbolicLink()) {result.push(relative); continue;}
    if (entry.isDirectory()) result.push(...walk(root, relative)); else result.push(relative);
  }
  return result;
}
export function audit(root, deny = []) {
  const issues = [], inventory = [], manifest = readJSON(path.join(root, 'public-files.json'));
  const approved = new Set(manifest.files);
  if (approved.size !== manifest.files.length) issues.push({file: 'public-files.json', rule: 'duplicate-path'});
  for (const name of walk(root)) if (!approved.has(name)) issues.push({file: name, rule: 'not-in-explicit-file-list'});
  const rules = [
    ['private-key-material', /-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/],
    ['access-token', /\b(?:gh[pousr]_[A-Za-z0-9]{24,}|github_pat_[A-Za-z0-9_]{30,}|sk-(?:proj-)?[A-Za-z0-9_-]{28,})\b/],
    ['personal-windows-home', /[A-Z]:[\\/]Users[\\/](?!<|example|public|default)[^\s<>"'\\/]+/i],
    ['personal-unix-home', /\/(?:home|Users)\/(?!<|example)[a-zA-Z0-9_.-]+\//],
    ['email-address', /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i],
    ['mobile-number', /\b1[3-9]\d{9}\b/]
  ];
  for (const name of approved) {
    try {
      const full = inside(root, name);
      if (!fs.statSync(full).isFile() || fs.lstatSync(full).isSymbolicLink()) throw new Error('not-a-regular-file');
      if (/\.(?:apk|aab|zip|jks|keystore|key|pem|pdf|docx|pptx)$/i.test(name)) issues.push({file: name, rule: 'private-or-archive-file-type'});
      if (/(?:^|\/)(?:\.env(?:\.|$)|\.signing|\.local|local|sources)(?:\/|$)/.test(name)) issues.push({file: name, rule: 'private-source-location'});
      const bytes = fs.readFileSync(full);
      inventory.push({file: name, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex')});
      if (manifest.assetChecksums?.[name] && manifest.assetChecksums[name] !== inventory.at(-1).sha256) issues.push({file: name, rule: 'pinned-asset-bytes-changed'});
      if (path.extname(name).toLowerCase() === '.png') {
        if (!bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) throw new Error('invalid-png');
        let position = 8; const allowed = new Set(['IHDR', 'IDAT', 'IEND', 'iCCP', 'sRGB', 'gAMA', 'cHRM', 'pHYs', 'tRNS', 'bKGD', 'sBIT', 'PLTE']);
        while (position + 12 <= bytes.length) {
          const length = bytes.readUInt32BE(position), type = bytes.toString('ascii', position + 4, position + 8);
          if (position + length + 12 > bytes.length) throw new Error('invalid-png-chunk');
          if (!allowed.has(type)) issues.push({file: name, rule: 'image-metadata-needs-review', chunk: type});
          position += length + 12;
        }
        if (position !== bytes.length) throw new Error('invalid-png-trailing-data');
      } else {
        const text = name + '\n' + bytes.toString('utf8');
        for (const [rule, pattern] of rules) if (pattern.test(text)) issues.push({file: name, rule});
        if (deny.some(value => value && text.toLowerCase().includes(value.toLowerCase()))) issues.push({file: name, rule: 'private-deny-list-match'});
      }
    } catch {issues.push({file: name, rule: 'missing-unsafe-or-invalid-file'});}
  }
  try {
    const course = readJSON(path.join(root, 'course-data.json'));
    if (course.id !== 'empty-course' || course.modules.length || course.lessons.length || course.questions.length) issues.push({file: 'course-data.json', rule: 'default-course-must-be-empty'});
    const expected = '// Generated from course-data.json by tools/prepare-course.mjs.\nwindow.COURSE_SOURCE = ' + JSON.stringify(course).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029') + ';\n';
    if (fs.readFileSync(path.join(root, 'course-data.js'), 'utf8') !== expected) issues.push({file: 'course-data.js', rule: 'runtime-course-differs-from-empty-source'});
    const config = readJSON(path.join(root, 'app-config.json'));
    if (config.applicationId !== 'org.studyapp.template' || config.icon !== 'assets/app-icon.png') issues.push({file: 'app-config.json', rule: 'template-identity-changed'});
  } catch {issues.push({file: 'course-data.json', rule: 'invalid-default-configuration'});}
  return {passed: issues.length === 0, checkedFiles: inventory.length, issues, inventory,
    scope: 'explicit-public-file-set; ignored-private-directories-excluded',
    manualReviewStillRequired: ['image-content-and-context', 'copyright-and-icon-reuse', 'future-git-metadata-and-release-files']};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(() => {
  const opts = args(), root = path.resolve(opts['--root'] || ROOT);
  const deny = opts['--deny-file'] ? fs.readFileSync(path.resolve(opts['--deny-file']), 'utf8').split(/\r?\n/).map(s => s.trim()).filter(Boolean) : [];
  const result = audit(root, deny);
  if (opts['--report']) writeJSON(path.resolve(opts['--report']), result);
  console.log(JSON.stringify({passed: result.passed, checkedFiles: result.checkedFiles, issues: result.issues, manualReviewStillRequired: result.manualReviewStillRequired}, null, 2));
  if (!result.passed) process.exitCode = 1;
});
