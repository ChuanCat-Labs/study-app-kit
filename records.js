/* Course-isolated records, reusable by the UI and deterministic Node tests. */
(() => {
  'use strict';
  function create(course){
    const questions=[...course.questions,...course.legacy.questions];
    const questionIds=new Set(questions.map(q=>q.id)),activeQuestionIds=new Set(course.questions.map(q=>q.id)),lessonIds=new Set([...course.lessons.map(l=>l.id),...course.legacy.lessonIds]);
    const aliasLesson=id=>course.legacy.lessonAliases[id]||id;
    const firstData=()=>({courseId:course.id,schemaVersion:2,history:[],demo:false,learned:[],reviews:{},bookmarks:[],draft:null});
    function normalizeData(value,strict=false){
      if(!value||value.courseId!==course.id||!Array.isArray(value.history))throw new Error('备份不属于本课程或格式不正确。');
      const result=firstData();
      result.history=value.history.map(run=>({recordedAt:typeof run.recordedAt==='string'?run.recordedAt:null,answers:(Array.isArray(run.answers)?run.answers:[]).filter(a=>questionIds.has(a.id)&&typeof a.correct==='boolean').map(a=>({id:a.id,correct:a.correct,type:questions.find(q=>q.id===a.id).type}))})).filter(run=>run.answers.length);
      if(strict&&result.history.reduce((n,r)=>n+r.answers.length,0)!==value.history.reduce((n,r)=>n+(Array.isArray(r.answers)?r.answers.length:0),0))throw new Error('备份含有未知题目，请核对课程版本。');
      result.learned=[...new Set((Array.isArray(value.learned)?value.learned:[]).filter(id=>lessonIds.has(id)).map(aliasLesson))];
      result.bookmarks=[...new Set((Array.isArray(value.bookmarks)?value.bookmarks:[]).filter(id=>lessonIds.has(id)).map(aliasLesson))];
      if(value.reviews&&typeof value.reviews==='object')for(const [id,r] of Object.entries(value.reviews))if(lessonIds.has(id)&&r&&typeof r==='object'){
        const key=aliasLesson(id),incoming={flagged:!!r.flagged,text:typeof r.text==='string'?r.text.slice(0,20000):'',updatedAt:typeof r.updatedAt==='string'?r.updatedAt:null},old=result.reviews[key];
        result.reviews[key]=old?{flagged:old.flagged||incoming.flagged,text:[old.text,incoming.text].filter((x,i,a)=>x&&a.indexOf(x)===i).join('\n\n'),updatedAt:[old.updatedAt,incoming.updatedAt].filter(Boolean).sort().at(-1)||null}:incoming;
      }
      const d=value.draft;
      if(d&&Array.isArray(d.pool)&&d.pool.length&&d.pool.every(id=>questionIds.has(id))){
        const answers=(Array.isArray(d.answers)?d.answers:[]).filter((a,i,all)=>d.pool.includes(a.id)&&typeof a.correct==='boolean'&&all.findIndex(b=>b.id===a.id)===i);
        const pending=d.pending&&activeQuestionIds.has(d.pending.id)&&answers.some(a=>a.id===d.pending.id)?d.pending:null;
        const fillDrafts=Object.fromEntries(Object.entries(d.fillDrafts||{}).filter(([id,text])=>d.pool.includes(id)&&typeof text==='string').map(([id,text])=>[id,text.slice(0,100)]));
        result.draft={pool:[...new Set(d.pool)],answers,pending,revealed:!!d.revealed,mode:d.mode==='essay'?'essay':'choice',fillDrafts};
      }
      return result;
    }
    return {firstData,normalizeData,questionIds,activeQuestionIds,lessonIds,aliasLesson};
  }
  window.CourseRecords={create};
})();
