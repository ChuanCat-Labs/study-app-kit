import fs from 'node:fs';
import path from 'node:path';
import {args, projectRoot, readJSON, validateProject, main} from './lib.mjs';

main(() => {
  const opts = args(), root = projectRoot(opts), {course, config} = validateProject(root);
  const production = readJSON(path.join(root, 'production.json'));
  const notices = [];
  if (!production.personalization.appNameReviewed) notices.push('请确认软件名：' + config.label);
  if (!production.personalization.iconReviewed) notices.push('请确认保留默认黑猫图标或换用自己的PNG。');
  if (!production.personalization.courseTitleReviewed) notices.push('请确认课程名称。');
  const registry = path.join(root, '.local/source-manifest.json');
  const sources = fs.existsSync(registry) ? readJSON(registry).sources : [];
  if (!sources.some(s => s.role === 'notes') || !sources.some(s => s.role === 'textbook')) notices.push('建议同时提供个人整理资料和原教材或相关章节；只有一类也可继续。');
  if (production.exam.scope === 'unspecified') notices.push('考试范围未明确，不自动标为必考或扩展必做题。');
  const ledgerPath = path.join(root, '.local/content-review.json');
  const ledger = fs.existsSync(ledgerPath) ? readJSON(ledgerPath) : {items: []};
  const issues = ledger.items.filter(i => i.status === 'pending').map(i => ({id: i.id, question: i.question}));
  console.log(JSON.stringify({valid: true, courseId: course.id, lessons: course.lessons.length,
    questions: course.questions.length, notices, unresolved: issues, validationScope: 'structure-and-local-assets-only'}, null, 2));
});
