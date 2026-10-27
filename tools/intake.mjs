import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {args, projectRoot, readJSON, writeJSON, inside, main} from './lib.mjs';

main(() => {
  const opts = args(), root = projectRoot(opts);
  const registryPath = path.join(root, '.local/source-manifest.json');
  const registry = fs.existsSync(registryPath) ? readJSON(registryPath) : {schemaVersion: 1, sources: []};
  const requests = [];
  for (const role of ['notes', 'textbook', 'supplement']) for (const file of [opts['--' + role]].flat().filter(Boolean)) {
    const full = path.resolve(file), stat = fs.lstatSync(full);
    if (stat.isSymbolicLink() || !stat.isFile()) throw new Error('请逐个提供原文件；链接和目录需先检查后再导入。');
    const ext = path.extname(full).toLowerCase();
    if (!['.md', '.txt', '.pdf', '.docx', '.pptx', '.png', '.jpg', '.jpeg', '.webp'].includes(ext)) throw new Error('格式需另行提取，请先提供文本、PDF、Office或图片。');
    const bytes = fs.readFileSync(full), sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
    requests.push({full, ext, bytes, sha256, role});
  }
  if (!requests.length) throw new Error('使用 --notes、--textbook 或 --supplement 提供文件。');
  let added = 0;
  for (const request of requests) {
    if (registry.sources.some(s => s.sha256 === request.sha256 && s.role === request.role)) continue;
    const id = request.role + '-' + request.sha256.slice(0, 16);
    const relative = '.local/sources/' + id + '/original' + request.ext;
    const dest = inside(root, relative, {mustExist: false}); fs.mkdirSync(path.dirname(dest), {recursive: true});
    fs.writeFileSync(dest, request.bytes);
    registry.sources.push({id, role: request.role, label: path.basename(request.full), file: relative,
      sha256: request.sha256, extraction: 'pending', review: 'pending', originalPageMap: []}); added++;
  }
  writeJSON(registryPath, registry);
  console.log(JSON.stringify({added, total: registry.sources.length, networkRequests: 0,
    message: '原文件已登记到本地私有目录；登记不等于完成文字提取或内容核准。建议同时提供原教材与个人整理资料。'}, null, 2));
});
