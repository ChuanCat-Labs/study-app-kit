import fs from 'node:fs';
import path from 'node:path';
import {args, projectRoot, readJSON, normalizeCourse, mediaPaths, courseAsset, main} from './lib.mjs';

main(() => {
  const opts = args(), root = projectRoot(opts);
  const input = path.resolve(opts._[0] || path.join(root, 'course-data.json'));
  const output = path.resolve(opts._[1] || path.join(root, 'course-data.js'));
  const data = readJSON(input);
  normalizeCourse(root, data);
  for (const name of mediaPaths(data)) courseAsset(root, name);
  fs.writeFileSync(output, '// Generated from course-data.json by tools/prepare-course.mjs.\nwindow.COURSE_SOURCE = ' +
    JSON.stringify(data).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029') + ';\n');
  console.log(JSON.stringify({courseId: data.id, modules: data.modules.length, lessons: data.lessons.length, questions: data.questions.length}));
});
