import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

export const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const readJSON = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
export function writeJSON(file, value) {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}
export function args(argv = process.argv.slice(2)) {
  const out = {_: []};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (!key.startsWith('--')) {out._.push(key); continue;}
    const value = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
    if (key in out) out[key] = [...(Array.isArray(out[key]) ? out[key] : [out[key]]), value];
    else out[key] = value;
  }
  return out;
}
export function projectRoot(opts) {
  return fs.realpathSync(path.resolve(opts['--project'] || ROOT));
}
export function inside(root, relative, {mustExist = true} = {}) {
  if (typeof relative !== 'string' || !relative || relative.includes('\\') ||
      relative.includes(':') || relative.startsWith('/') ||
      relative.split('/').some(p => p === '..' || p === '.')) throw new Error('路径必须是项目内的相对路径。');
  const resolvedRoot = fs.realpathSync(root), full = path.resolve(resolvedRoot, relative);
  const contained = value => value.startsWith(resolvedRoot + path.sep);
  if (!contained(full)) throw new Error('路径超出项目。');
  if (mustExist) {
    if (!contained(fs.realpathSync(full))) throw new Error('链接目标超出项目。');
    return full;
  }
  let parent = path.dirname(full);
  while (!fs.existsSync(parent)) parent = path.dirname(parent);
  const realParent = fs.realpathSync(parent);
  if (realParent !== resolvedRoot && !contained(realParent)) throw new Error('链接目标超出项目。');
  return full;
}
export function normalizeCourse(root, data = readJSON(path.join(root, 'course-data.json'))) {
  const context = {window: {}};
  vm.runInNewContext(fs.readFileSync(path.join(root, 'course-schema.js'), 'utf8'), context);
  return context.window.CourseSchema.normalize(data);
}
export function mediaPaths(value, result = new Set()) {
  if (Array.isArray(value)) for (const item of value) mediaPaths(item, result);
  else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if (['image', 'src'].includes(key) && typeof item === 'string') result.add(item);
      else mediaPaths(item, result);
    }
  }
  return result;
}
export const WEB_FILES = ['index.html', 'styles.css', 'mobile.css', 'learning.css',
  'classroom.css', 'app.js', 'presentation.js', 'course-schema.js', 'records.js', 'course-data.js'];
export function courseAsset(root, relative) {
  if (/^(?:local|\.local|\.signing|output|build|node_modules)(?:\/|$)/.test(relative)) throw new Error('私有或工作目录不能作为课程运行资源。');
  const full = inside(root, relative);
  if (!fs.statSync(full).isFile() || !/\.(png|jpe?g|svg)$/i.test(relative)) throw new Error('引用图片不存在或格式不支持：' + relative);
  return full;
}
export function validateProject(root) {
  const course = normalizeCourse(root), config = readJSON(path.join(root, 'app-config.json'));
  if (!/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/.test(config.applicationId || '')) throw new Error('应用标识无效。');
  if (typeof config.label !== 'string' || !config.label.trim() || /[\u0000-\u001f]/.test(config.label)) throw new Error('软件名称无效。');
  if (!Number.isInteger(config.versionCode) || config.versionCode < 1 || config.versionCode > 2100000000 ||
      !/^[\w.-]+$/.test(config.versionName || '')) throw new Error('版本号无效。');
  const icon = courseAsset(root, config.icon);
  if (path.extname(icon).toLowerCase() !== '.png' || !fs.readFileSync(icon).subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) throw new Error('图标应为PNG原图。');
  for (const file of mediaPaths(course)) {
    courseAsset(root, file);
  }
  for (const file of WEB_FILES) inside(root, file);
  return {course, config};
}
export function main(fn) {
  Promise.resolve().then(fn).catch(error => {console.error(error.message); process.exitCode = 1;});
}
