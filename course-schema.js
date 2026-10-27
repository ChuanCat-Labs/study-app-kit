/* Normalize the portable course contract before any rendering or storage access. */
(() => {
  'use strict';
  const array=v=>Array.isArray(v)?v:[],str=v=>typeof v==='string'?v:'';
  function assert(ok,message){if(!ok)throw new Error(message);}
  function ids(items,label){const result=new Set();for(const v of items){assert(v&&typeof v.id==='string'&&/^[a-zA-Z0-9][\w.-]*$/.test(v.id),label+'的ID格式无效');assert(!result.has(v.id),label+'的ID重复：'+v.id);result.add(v.id);}return result;}
  function image(value){assert(typeof value==='string'&&value&&!/^(?:[a-z]+:|\/|\\)/i.test(value)&&!value.split(/[\\/]/).includes('..')&&!/[<>"\u0000]/.test(value),'图片应为课程包内的相对路径');}
  function checkCrop(f){image(f.image);assert(f.crop&&['x','y','width','height'].every(k=>Number.isFinite(f.crop[k]))&&f.crop.x>=0&&f.crop.y>=0&&f.crop.width>0&&f.crop.height>0&&Number.isFinite(f.nativeWidth)&&f.nativeWidth>0&&f.crop.x+f.crop.width<=f.nativeWidth,'图片显示区域无效');}
  function checkImages(lesson){
    for(const ref of lesson.refs){if(ref.image)image(ref.image);if(ref.kind==='external')assert(/^https?:\/\//.test(ref.url||''),'外部资料链接无效');}
    for(const item of lesson.figures){assert(item&&item.image,'图缺少image');image(item.image);}
    for(const item of array(lesson.process))if(item.image)image(item.image);
    if(lesson.image)image(lesson.image.src);
    if(lesson.sourceFigure)checkCrop(lesson.sourceFigure);
  }
  function normalize(input){
    assert(input&&typeof input==='object','课程格式无效');assert(typeof input.id==='string'&&/^[a-zA-Z0-9][\w.-]*$/.test(input.id),'课程ID格式无效');
    for(const name of ['modules','lessons','questions'])assert(Array.isArray(input[name]),'课程缺少'+name+'数组');
    const modules=input.modules.map(m=>({...m,title:str(m.title)||m.id})),moduleIds=ids(modules,'模块');
    const lessons=input.lessons.map(l=>({...l,title:str(l.title)||l.id,concept:str(l.concept),explain:str(l.explain),warning:str(l.warning),formula:str(l.formula),metrics:array(l.metrics),refs:array(l.refs),figures:array(l.figures),questionIds:[]}));
    const lessonIds=ids(lessons,'知识点');
    for(const l of lessons){assert(moduleIds.has(l.module),'知识点模块不存在：'+l.id);assert(l.metrics.every(v=>Array.isArray(v)&&v.length===2),'核心结论格式无效');checkImages(l);}
    const questions=input.questions.map(q=>({...q,options:array(q.options),text:str(q.text),answer:str(q.answer),desc:str(q.desc)}));ids(questions,'题目');
    for(const q of questions){
      const lesson=lessons.find(l=>l.id===q.lessonId);assert(lesson,'题目知识点不存在：'+q.id);assert(q.module===lesson.module,'题目模块不一致：'+q.id);assert(['choice','essay'].includes(q.type),'题型无效：'+q.id);
      if(q.sourceFigure)checkCrop(q.sourceFigure);
      if(q.type==='choice'&&q.format==='fill')assert(array(q.accepted||[q.expectedAnswer]).some(v=>typeof v==='string'&&v),'填空题缺少答案：'+q.id);
      else if(q.type==='choice'){assert(q.options.length>=2&&Number.isInteger(q.correct)&&q.correct>=0&&q.correct<q.options.length,'选项或正确答案无效：'+q.id);assert(!q.format||q.format==='judgment','客观题格式无效：'+q.id);}
      lesson.questionIds.push(q.id);
    }
    const raw=input.legacy||{},legacy={questions:array(raw.questions),lessonIds:array(raw.lessonIds),lessonAliases:raw.lessonAliases||{},storageKeys:array(raw.storageKeys)};
    const allQuestions=ids([...questions,...legacy.questions],'活动与历史题目');
    assert(allQuestions.size===questions.length+legacy.questions.length,'历史题目重复');
    for(const q of legacy.questions)assert(['choice','essay'].includes(q.type),'历史题型无效');
    for(const [old,current] of Object.entries(legacy.lessonAliases)){assert(old!==current&&lessonIds.has(current)&&!lessonIds.has(old),'知识点合并映射无效');if(!legacy.lessonIds.includes(old))legacy.lessonIds.push(old);}
    const highlights=input.highlights||{};
    for(const info of Object.values(highlights)){assert(info&&info.width>0&&info.height>0&&Array.isArray(info.rects),'荧光坐标无效');for(const r of info.rects)assert(['x','y','width','height'].every(k=>Number.isFinite(r[k]))&&r.x>=0&&r.y>=0&&r.width>0&&r.height>0&&r.x+r.width<=info.width+1&&r.y+r.height<=info.height+1,'荧光矩形超出原页');}
    return {...input,id:input.id,version:str(input.version)||'1',title:str(input.title)||'复习助手',description:str(input.description),notice:str(input.notice),sourceInfo:str(input.sourceInfo),modules,lessons,questions,legacy,highlights};
  }
  window.CourseSchema={normalize};
  if(window.COURSE_SOURCE){try{window.COURSE=normalize(window.COURSE_SOURCE);}catch(error){window.COURSE_ERROR=error.message;window.COURSE=normalize({id:'invalid-course',modules:[],lessons:[],questions:[],title:'课程配置有误'});}}
})();
