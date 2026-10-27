/* MEMORY / LAB V4. Verified learning mode + preserved V3 quiz and analytics. */
(() => {
  'use strict';
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));
  const COURSE = window.COURSE;
  if (!COURSE || !Array.isArray(COURSE.lessons)) throw new Error('课程内容未加载');
  const STORE = 'memory-lab-course:' + COURSE.id;
  const MODULES = COURSE.modules;
  const QUESTIONS = COURSE.questions;
  const ALL_QUESTIONS = [...QUESTIONS,...(COURSE.legacy?.questions||[])];
  const LESSONS = COURSE.lessons;
  const deepCopy = (value) => JSON.parse(JSON.stringify(value));
  const {firstData,normalizeData,questionIds,activeQuestionIds,lessonIds,aliasLesson}=window.CourseRecords.create(COURSE);
  function readData(){
    try {
      const current=localStorage.getItem(STORE);
      if(current)return normalizeData(JSON.parse(current));
      // Only explicitly declared same-course keys participate in migration.
      for(const key of COURSE.legacy.storageKeys){
        const raw=localStorage.getItem(key); if(!raw)continue;
        const parsed=JSON.parse(raw);
        if(parsed.courseId===COURSE.id && !parsed.demo)return normalizeData(parsed);
      }
    } catch (_err) { /* Never overwrite a damaged source value during reading. */ }
    return firstData();
  }
  let data = readData();
  let storageAvailable=true;
  function writeData(){
    data.draft=state.session?{...state.session,mode:state.mode}:null;
    try{localStorage.setItem(STORE,JSON.stringify(data));storageAvailable=true;}
    catch(_err){storageAvailable=false;$('#storage-notice').textContent='本机保存失败，请及时导出备份；本次页面内仍可继续使用。';toast('本机保存失败，请导出备份。');}
  }
  const state = {page:'home',mode:data.draft?.mode||'choice',selected:new Set(MODULES.map(m=>m.id)),session:data.draft,lessonIndex:0,studyList:[],search:'',filter:'all',learningOrigin:'home'};
  const byId = (id) => ALL_QUESTIONS.find(q=>q.id===id);
  const moduleById = (id) => MODULES.find(m=>m.id===id);
  const getAnswers = (runs) => runs.flatMap(run=>run.answers);
  const accuracy = (answers) => answers.length ? answers.filter(answer=>answer.correct).length/answers.length : null;
  const percentage = (value) => value === null ? '—' : `${Math.round(value*100)}%`;
  const sessionQuestions = () => state.session?.pool ? QUESTIONS.filter(q=>state.session.pool.includes(q.id)) : QUESTIONS.filter(q=>state.selected.has(q.module));
  const answeredIds = () => new Set(state.session?.answers.map(a=>a.id) || []);
  const remainingForMode = () => {
    const done = answeredIds();
    return sessionQuestions().filter(q=>q.type===state.mode && !done.has(q.id));
  };
  const currentQuestion = () => state.session?.pending ? byId(state.session.pending.id) : remainingForMode()[0];
  function setPage(page){
    state.page=page;
    $$('[data-screen]').forEach(el=>{el.hidden=el.dataset.screen!==page});
    $$('.app-tab').forEach(el=>{
      const active=el.dataset.page===(page==='learn'?'home':page);
      el.classList.toggle('selected',active);
      el.setAttribute('aria-selected',String(active));
    });
    $('#section-footer').textContent=({home:'KNOWLEDGE / 01',learn:'LEARNING / 02',quiz:'RECALL / 03',stats:'ANALYTICS / 04'})[page];
    if(page==='home')renderHome();
    if(page==='learn')renderLearning();
    if(page==='quiz'){
      if(!state.session) startSession(false);
      renderQuiz();
    }
    if(page==='stats')renderStats();
    window.scrollTo({top:0,behavior:'instant'});
  }
  function renderHome(){
    const host=$('#module-list');host.replaceChildren();
    MODULES.forEach((m,i)=>{
      const questions=QUESTIONS.filter(q=>q.module===m.id);
      const card=document.createElement('div');card.className='card module-card';
      const header=document.createElement('div');header.className='module-header';
      const title=document.createElement('b');title.textContent=`${String(i+1).padStart(2,'0')}　${m.title}`;
      const count=document.createElement('span');count.textContent=`${questions.length} 题`;
      header.append(title,count);
      const label=document.createElement('label');label.className='module-row';
      const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=state.selected.has(m.id);
      checkbox.addEventListener('change',()=>{if(checkbox.checked)state.selected.add(m.id);else state.selected.delete(m.id);updateHomeCounts()});
      const strong=document.createElement('strong');strong.textContent=m.title;
      const extra=document.createElement('em');extra.textContent=`客观 ${questions.filter(q=>q.type==='choice').length} · 大题 ${questions.filter(q=>q.type==='essay').length} · 已学 ${LESSONS.filter(l=>l.module===m.id && data.learned.includes(l.id)).length}/${LESSONS.filter(l=>l.module===m.id).length}`;
      label.append(checkbox,strong,extra);card.append(header,label);
      const points=LESSONS.filter(l=>l.module===m.id && matchesLesson(l));
      if(points.length){
        const details=document.createElement('details');details.className='module-points';details.open=!!state.search||state.filter!=='all';
        const summary=document.createElement('summary');summary.textContent=`展开知识点 · ${points.length} 条`;details.append(summary);
        for(const point of points){
          const button=document.createElement('button');button.type='button';button.className='point-link';button.dataset.lessonId=point.id;
          const name=document.createElement('span');name.className='point-text';name.textContent=(data.bookmarks.includes(point.id)?'★ ':'')+(point.displayNumber||String(LESSONS.indexOf(point)+1).padStart(2,'0'))+' '+point.title;
          button.classList.toggle('is-focus',point.exam==='重点'||!!point.focusScope);
          const status=document.createElement('small');status.textContent=data.reviews[point.id]?.flagged?'有疑问':point.focusScope?(point.focusAll?'课堂重点':'部分重点'):point.exam==='重点'?'课堂重点':point.status==='待确认'?'待确认':data.learned.includes(point.id)?'已学习':'阅读 →';
          button.append(name,status);button.addEventListener('click',()=>openLesson(point.id));details.append(button);
        }
        card.append(details);
      }
      if(points.length || (!state.search && state.filter==='all'))host.append(card);
    });
    if(!host.childElementCount){const empty=document.createElement('p');empty.className='empty-message';empty.textContent=LESSONS.length?'没有符合条件的知识点，试试其他关键词或筛选。':'当前还没有课程内容。配置课程后即可开始学习。';host.append(empty);}
    $('#resume-draft').hidden=!state.session;
    updateHomeCounts();
  }
  function updateHomeCounts(){
    $('#selected-modules').innerHTML=`${String(state.selected.size).padStart(2,'0')} <span>/ ${String(MODULES.length).padStart(2,'0')}</span>`;
    $('#available-count').innerHTML=`${String(QUESTIONS.filter(q=>state.selected.has(q.module)).length).padStart(2,'0')} <span>题</span>`;
    $('#start-quiz').disabled=!QUESTIONS.some(q=>state.selected.has(q.module));
    $('#start-learning').disabled=!LESSONS.some(l=>state.selected.has(l.module));
  }
  function startSession(navigate=true,pointId=null){
    if(!pointId && state.selected.size===0)return;
    const point=pointId?LESSONS.find(l=>l.id===pointId):null;
    const pool=point ? point.questionIds : QUESTIONS.filter(q=>state.selected.has(q.module)).map(q=>q.id);
    if(!pool.length)return;
    if(state.session?.answers.length && !confirm('有未提交的练习。开始新练习将替换该草稿，已提交记录不受影响。继续吗？'))return;
    state.session={answers:[],pending:null,revealed:false,pool};
    state.mode=pool.some(id=>byId(id)?.type==='choice')?'choice':'essay';
    writeData();
    if(navigate)setPage('quiz');
  }
  function grade(question,correct,selectedOption=null){
    const session=state.session;
    if(!session||session.pending||session.answers.some(item=>item.id===question.id))return;
    session.answers.push({id:question.id,correct:Boolean(correct),type:question.type});
    session.pending={id:question.id,correct:Boolean(correct),selectedOption};
    writeData();renderQuiz();
  }
  function renderQuiz(){
    if(!state.session){$('#question-card').hidden=true;$('#finish-session').disabled=true;$('#next-question').hidden=true;$('#quiz-helper').textContent='请先选择有题目的模块，再开始练习。';return;}
    $$('.mode-tab').forEach(btn=>btn.classList.toggle('selected',btn.dataset.mode===state.mode));
    const total=sessionQuestions().length, answered=state.session.answers.filter(a=>activeQuestionIds.has(a.id)).length;
    $('#mode-hint').textContent=state.mode==='choice'?'客观题 · 选择／判断／填空':'大题 · 对照答案后自评';
    $('#progress-label').textContent=`${answered} / ${total} 已完成`;
    $('#progress-bar').style.width=total ? `${100*answered/total}%`:'0%';
    $('#finish-session').disabled=state.session.answers.length===0;
    $('#next-question').hidden=!state.session.pending;
    const question=currentQuestion();
    $('#question-card').hidden=!question;
    $('#quiz-helper').textContent=question?'未作答题目不计入正确率；切换题型会保留已完成的成绩。':'此题型已全部完成，可以切换题型或结束本轮。';
    if(!question){window.CourseUI.presentQuiz(null,state.session);return;}
    $('#question-number').textContent=`${String(QUESTIONS.indexOf(question)+1).padStart(2,'0')}.`;
    $('#question-module').textContent=moduleById(question.module).title;
    $('#question-text').textContent=question.text;
    $('#question-description').textContent=(question.type==='choice'?'自编复习题 · 请选择一个正确答案。':question.desc)+' '+(LESSONS.find(l=>l.id===question.lessonId)?.exam==='不考'?'本项不在考试范围。':'');
    $('#question-source').dataset.lessonId=question.lessonId;
    $('#choice-options').hidden=question.type!=='choice';
    $('#essay-block').hidden=question.type!=='essay';
    const pending=state.session.pending;
    const result=$('#answer-result');result.textContent='';result.style.color='#438c76';
    if(question.type==='choice'){
      const host=$('#choice-options');host.replaceChildren();
      question.options.forEach((label,i)=>{
        const button=document.createElement('button');button.type='button';button.className='choice';
        const tag=document.createElement('strong');tag.textContent=String.fromCharCode(65+i);
        const name=document.createElement('span');name.textContent=label;button.append(tag,name);
        if(pending){button.disabled=true;if(i===question.correct)button.classList.add('correct');else if(i===pending.selectedOption)button.classList.add('wrong');}
        else button.addEventListener('click',()=>grade(question,i===question.correct,i));
        host.append(button);
      });
      if(pending){result.textContent=pending.correct?`回答正确。${question.answer}`:`回答错误。${question.answer}`;result.style.color=pending.correct?'#438c76':'#a66c65';}
    }else{
      $('#essay-reference').textContent=question.answer;
      $('#reveal-answer').hidden=state.session.revealed||!!pending;
      $('#essay-reference').hidden=!state.session.revealed;
      $('#self-rating').hidden=!state.session.revealed||!!pending;
      if(pending)result.textContent=pending.correct?'已记录：答对':'已记录：未答对';
    }
    window.CourseUI.presentQuiz(question,state.session);
  }
  function nextQuestion(){if(state.session){state.session.pending=null;state.session.revealed=false;writeData();renderQuiz();window.scrollTo({top:0,behavior:'instant'});}}
  function finishSession(){
    if(!state.session||state.session.answers.length===0)return;
    // Replace the seeded showcase rows when the user records their first real session.
    // Demo answers must never contaminate the real cumulative accuracy.
    if (data.demo) data.history = [];
    data.history.push({recordedAt:new Date().toISOString(),answers:deepCopy(state.session.answers)});
    data.demo=false;state.session=null;writeData();
    setPage('stats');
  }
  function renderStats(){
    const history=data.history, all=getAnswers(history), correct=all.filter(a=>a.correct).length;
    $('#data-label').textContent='本地真实记录';
    renderReviewSummary();
    const last=history.slice(-7), chart=$('#last-seven-chart'), labels=$('#chart-labels');
    chart.replaceChildren();labels.replaceChildren();
    if(!last.length){
      const text=document.createElement('span');text.textContent='暂无练习记录';
      text.style.cssText='grid-column:1/-1;align-self:center;text-align:center;font-size:12px;color:#98a8ae';chart.append(text);
    }
    last.forEach((run,i)=>{
      const rate=accuracy(run.answers), col=document.createElement('div');col.className='chart-col';
      const value=document.createElement('div');value.className='chart-value';value.textContent=percentage(rate);
      const bar=document.createElement('div');bar.className='chart-bar';bar.style.height=`${Math.round(rate*100)}%`;
      col.title=`第 ${history.length-last.length+i+1} 次：${percentage(rate)}`;
      col.append(value,bar);chart.append(col);
    });
    for(let i=0;i<7;i++){
      const el=document.createElement('span');el.textContent=i<last.length?String(history.length-last.length+i+1).padStart(2,'0'):'';labels.append(el);
    }
    $('#total-accuracy').textContent=percentage(accuracy(all));
    $('#total-detail').innerHTML=`累计答对 ${correct} 题<br>累计练习 ${all.length} 题`;
    const ranking=MODULES.map(module=>{
      const questions=QUESTIONS.filter(q=>q.module===module.id);
      const scoped=all.filter(a=>questions.some(q=>q.id===a.id));
      const visited=new Set(scoped.map(a=>a.id));
      const unreviewed=questions.length?1-visited.size/questions.length:null;
      const score=accuracy(scoped);
      // Priority: missing coverage 58%, incorrect-answer ratio 42%.
      const priority=unreviewed===null?-1:.58*unreviewed+.42*(score===null?0:1-score);
      return {...module,hasQuestions:questions.length>0,score,unreviewed,priority,learnedCount:LESSONS.filter(l=>l.module===module.id && data.learned.includes(l.id)).length,lessonCount:LESSONS.filter(l=>l.module===module.id).length};
    }).sort((a,b)=>b.priority-a.priority);
    const host=$('#recommendation-list');host.replaceChildren();
    ranking.forEach((m,i)=>{
      const item=document.createElement('div');item.className='recommendation';
      const header=document.createElement('div');header.className='recommendation-head';
      const title=document.createElement('b');title.textContent=`${String(i+1).padStart(2,'0')}　${m.title}`;
      const button=document.createElement('button');button.type='button';button.textContent='复习 ↗';
      button.disabled=!m.hasQuestions;button.addEventListener('click',()=>{state.selected=new Set([m.id]);startSession();});
      header.append(title,button);
      const meta=document.createElement('div');meta.className='recommendation-meta';
      const accuracyTag=document.createElement('span');accuracyTag.textContent=`正确率 ${m.score===null?'暂无记录':percentage(m.score)}`;
      const blankTag=document.createElement('span');blankTag.textContent=m.hasQuestions?`未复习率 ${percentage(m.unreviewed)}`:'暂无题目';
      const learningTag=document.createElement('span');learningTag.textContent=`已学习 ${m.learnedCount}/${m.lessonCount}`;
      meta.append(accuracyTag,blankTag,learningTag);
      const track=document.createElement('div');track.className='mini-track';
      const bar=document.createElement('div');bar.style.width=`${Math.round(m.unreviewed*100)}%`;track.append(bar);
      const reason=document.createElement('div');reason.className='recommendation-reason';
      reason.textContent=!m.hasQuestions?'此模块可阅读，尚未配置练习题':m.unreviewed===1?'整个模块尚未复习':m.score!==null&&m.score<.65?'答题正确率偏低，建议加强复习':'还有知识点尚未覆盖';
      item.append(header,meta,track,reason);host.append(item);
    });
  }

  function openLearning(){
    state.studyList=LESSONS.filter(l=>state.selected.has(l.module));
    if(!state.studyList.length)return;
    state.lessonIndex=0;state.learningOrigin='home';
    setPage('learn');
  }
  function currentLesson(){return state.studyList[state.lessonIndex]}
  function renderLearning(){
    const lesson=currentLesson();
    if(!lesson){setPage('home');return;}
    const total=state.studyList.length;
    const finished=state.studyList.filter(item=>data.learned.includes(item.id)).length;
    $('#learning-position').textContent=`KNOWLEDGE ${String(state.lessonIndex+1).padStart(2,'0')} / ${String(total).padStart(2,'0')}`;
    $('#learning-progress-label').textContent=`已学习 ${finished} / ${total}`;
    $('#learning-progress-bar').style.width=`${Math.round(finished/total*100)}%`;
    $('#learning-subtitle').textContent=moduleById(lesson.module).title;
    $('#lesson-index').textContent=`${String(state.lessonIndex+1).padStart(2,'0')}.`;
    $('#lesson-title').textContent=lesson.title;
    renderLessonEvidence(lesson);
    $('#learning-back').textContent=state.learningOrigin==='quiz'?'‹　返回本轮练习':'‹　返回知识点列表';
    $('#lesson-concept').textContent=lesson.concept;
    $('#lesson-explanation').textContent=lesson.explain;
    $('#lesson-warning').textContent=lesson.warning;
    $('#lesson-formula').hidden=!lesson.formula;
    $('#lesson-formula').textContent=lesson.formula;
    const status=$('#lesson-state');
    status.textContent=data.learned.includes(lesson.id)?'已学习':'未学习';
    status.classList.toggle('learned',data.learned.includes(lesson.id));
    const host=$('#lesson-metrics');host.replaceChildren();
    lesson.metrics.forEach(([label,value])=>{
      const item=document.createElement('div');item.className='lesson-metric';
      const small=document.createElement('small');small.textContent=label;
      const strong=document.createElement('strong');strong.textContent=value;
      item.append(small,strong);host.append(item);
    });
    $('#finish-learning-point').textContent=state.lessonIndex===total-1?'完成学习 · 返回列表　✓':'完成学习 · 下一知识点　→';
    window.CourseUI.renderLesson(lesson,showSource);
    $('#previous-learning-point').disabled=state.lessonIndex===0;
    $('#practice-learning-point').disabled=!lesson.questionIds.length;
    $('#practice-learning-point').textContent=lesson.questionIds.length?'进入对应练习　↗':lesson.exam==='了解'?'了解栏目，暂无练习':'本项暂无练习';
  }
  $$('.app-tab').forEach(btn=>btn.addEventListener('click',()=>setPage(btn.dataset.page)));
  $('#start-learning').addEventListener('click',openLearning);
  $('#learning-back').addEventListener('click',()=>setPage(state.learningOrigin==='quiz'?'quiz':'home'));
  $('#previous-learning-point').addEventListener('click',()=>{
    if(state.lessonIndex>0){state.lessonIndex--;renderLearning();window.scrollTo({top:0,behavior:'instant'});}
  });
  $('#finish-learning-point').addEventListener('click',()=>{
    const point=currentLesson();if(!point)return;
    if(!data.learned.includes(point.id)){data.learned.push(point.id);writeData();}
    if(state.lessonIndex===state.studyList.length-1)setPage('home');
    else{state.lessonIndex++;renderLearning();window.scrollTo({top:0,behavior:'instant'});}
  });
  $('#practice-learning-point').addEventListener('click',()=>{
    const point=currentLesson();if(point)startSession(true,point.id);
  });
  $('#start-quiz').addEventListener('click',()=>startSession());
  $$('.mode-tab').forEach(btn=>btn.addEventListener('click',()=>{
    state.mode=btn.dataset.mode;
    if(state.session){state.session.pending=null;state.session.revealed=false;}
    writeData();renderQuiz();
  }));
  $('#submit-fill').addEventListener('click',()=>{
    const q=currentQuestion();if(!q||q.format!=='fill'||state.session?.pending)return;
    const value=$('#fill-answer').value.trim();if(!value){toast('请先填写答案。');$('#fill-answer').focus();return;}
    const normalize=text=>text.normalize('NFKC').replace(/[\s，。,.、；;：:]/g,'').toLowerCase();
    grade(q,(q.accepted||[q.expectedAnswer]).some(item=>normalize(item)===normalize(value)),value);
  });
  $('#fill-answer').addEventListener('keydown',e=>{if(e.key==='Enter')$('#submit-fill').click();});
  $('#fill-answer').addEventListener('input',e=>{const q=currentQuestion();if(q?.format==='fill'&&state.session&&!state.session.pending){state.session.fillDrafts={...state.session.fillDrafts,[q.id]:e.target.value};writeData();}});
  $('#reveal-answer').addEventListener('click',()=>{if(state.session){state.session.revealed=true;writeData();renderQuiz();}});
  $('#self-incorrect').addEventListener('click',()=>{const q=currentQuestion();if(q?.type==='essay'&&state.session?.revealed)grade(q,false)});
  $('#self-correct').addEventListener('click',()=>{const q=currentQuestion();if(q?.type==='essay'&&state.session?.revealed)grade(q,true)});
  $('#next-question').addEventListener('click',nextQuestion);
  $('#finish-session').addEventListener('click',finishSession);
  $('#reset-records').addEventListener('click',()=>{$('#reset-confirmation').hidden=false});
  $('#cancel-reset').addEventListener('click',()=>{$('#reset-confirmation').hidden=true});
  $('#confirm-reset').addEventListener('click',()=>{
    data={...data,history:[],demo:false,learned:[],draft:null};state.session=null;writeData();
    $('#reset-confirmation').hidden=true;
    $('#storage-notice').textContent='练习与已学习标记已清空，核对记录和收藏继续保留。';
    renderStats();
  });

  let sourceItems=[],sourceIndex=0,toastTimer;
  function toast(text){const el=$('#toast');el.textContent=text;el.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{el.hidden=true;},2400);}
  function matchesLesson(lesson){
    const text=JSON.stringify(lesson).toLowerCase();
    if(state.search && !text.includes(state.search.toLowerCase()))return false;
    if(state.filter==='focus')return lesson.exam==='重点'||!!lesson.focusScope;
    if(state.filter==='pending')return lesson.status==='待确认'||lesson.warning.includes('尚未确认')||lesson.warning.includes('未取得');
    if(state.filter==='saved')return data.bookmarks.includes(lesson.id)||!!data.reviews[lesson.id]?.flagged||!!data.reviews[lesson.id]?.text;
    return true;
  }
  function openLesson(id,fromQuiz=false){
    const lesson=LESSONS.find(l=>l.id===id);if(!lesson)return;
    state.studyList=LESSONS.filter(l=>l.module===lesson.module);
    state.lessonIndex=state.studyList.findIndex(l=>l.id===id);state.learningOrigin=fromQuiz?'quiz':'home';setPage('learn');
  }
  function badge(text,kind=''){const span=document.createElement('span');span.className='content-badge '+kind;span.textContent=text;return span;}
  function renderLessonEvidence(lesson){
    const labels=$('#lesson-labels');labels.replaceChildren();
    if(lesson.exam==='重点'||lesson.focusScope){const strong=document.createElement('strong');strong.className='focus-heading';strong.textContent=lesson.focusScope?'课堂重点：'+lesson.focusScope:'课堂重点';labels.append(strong);}
    if(['不考','了解','待确认'].includes(lesson.exam))labels.append(badge(lesson.exam==='待确认'?'课堂条件待确认':'课堂提示：'+lesson.exam,'secondary'));
    if(lesson.status&&lesson.status!=='教材已核对'&&lesson.status!=='书目信息')labels.append(badge(lesson.status,lesson.status==='待确认'?'pending':''));
    $('#lesson-figure').hidden=!lesson.image;
    if(lesson.image){$('#lesson-image').src=lesson.image.src;$('#lesson-image').alt=lesson.image.caption||'插图';$('#lesson-image-caption').textContent=lesson.image.caption||'';}
    const list=$('#lesson-sources');list.replaceChildren();
    if(lesson.examNote)labels.append(badge('课堂范围：'+lesson.examNote,'secondary'));
    const imageRefs=lesson.refs.filter(r=>r.image).map(r=>window.CourseUI.sourceRef(lesson,r));
    for(const ref of lesson.refs){
      let el;if(ref.kind==='external'){el=document.createElement('a');el.href=ref.url;el.target='_blank';el.rel='noopener noreferrer';el.className='source-chip external';el.textContent='补充 · '+ref.label+' ↗';}
      else{el=document.createElement('button');el.type='button';el.className='source-chip';el.textContent=ref.label;el.addEventListener('click',()=>showSource(imageRefs,imageRefs.findIndex(r=>r.image===ref.image)));}
      list.append(el);
    }
    const saved=data.bookmarks.includes(lesson.id), review=data.reviews[lesson.id];
    $('#bookmark-point').textContent=saved?'★ 已收藏':'☆ 收藏';$('#bookmark-point').classList.toggle('active',saved);
    $('#flag-point').textContent=review?.flagged?'✓ 已标疑问':'标记疑问';$('#flag-point').classList.toggle('active',!!review?.flagged);
    $('#review-editor').hidden=!review?.flagged&&!review?.text;$('#review-text').value=review?.text||'';$('#review-save-state').textContent='输入后保存在本机。';
  }
  function renderSource(){
    const ref=sourceItems[sourceIndex];if(!ref)return;
    $('#source-title').textContent=ref.label;$('#source-position').textContent=`${sourceIndex+1} / ${sourceItems.length}`;
    $('#source-image').src=ref.image;$('#source-image').alt=ref.label;$('#source-scroll').classList.remove('zoomed');$('#source-scroll').scrollTo(0,0);
    window.CourseUI.decorateSource(ref);
    $('#source-previous').disabled=sourceIndex===0;$('#source-next').disabled=sourceIndex===sourceItems.length-1;
  }
  function showSource(items,index=0){sourceItems=items;sourceIndex=index;renderSource();if(!$('#source-viewer').open)$('#source-viewer').showModal();}
  function renderReviewSummary(){
    const host=$('#review-summary');host.replaceChildren();
    const points=LESSONS.filter(l=>data.bookmarks.includes(l.id)||data.reviews[l.id]?.flagged||data.reviews[l.id]?.text);
    const text=document.createElement('p');text.textContent=`已学习 ${LESSONS.filter(l=>data.learned.includes(l.id)).length} / ${LESSONS.length} 条 · 收藏 ${LESSONS.filter(l=>data.bookmarks.includes(l.id)).length} 条 · 核对记录 ${points.length} 条`;host.append(text);
    if(points.length){const btn=document.createElement('button');btn.type='button';btn.className='review-list-link';btn.textContent='查看我的疑问与收藏 →';btn.addEventListener('click',()=>{state.filter='saved';state.search='';$('#knowledge-search').value='';updateFilterButtons();setPage('home');});host.append(btn);}
  }
  function updateFilterButtons(){$$('[data-filter]').forEach(b=>{b.classList.toggle('selected',b.dataset.filter===state.filter);b.setAttribute('aria-pressed',String(b.dataset.filter===state.filter));});}
  function exportBackup(){
    writeData();
    const payload={format:'memory-lab-course-backup',courseId:COURSE.id,courseVersion:COURSE.version,exportedAt:new Date().toISOString(),data,reviewItems:LESSONS.filter(l=>data.reviews[l.id]?.flagged||data.reviews[l.id]?.text).map(l=>({id:l.id,title:l.title,status:l.status,sourceLabels:l.refs.map(r=>r.label),...data.reviews[l.id]}))};
    const json=JSON.stringify(payload,null,2);
    if(window.AndroidBridge?.exportBackup){window.AndroidBridge.exportBackup(json);return;}
    const blob=new Blob([json],{type:'application/json;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=COURSE.id+'-学习备份.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);$('#backup-status').textContent='已生成导出文件，请检查下载位置。';
  }
  $('#knowledge-search').addEventListener('input',e=>{state.search=e.target.value.trim();renderHome();});
  $$('[data-filter]').forEach(btn=>btn.addEventListener('click',()=>{state.filter=btn.dataset.filter;updateFilterButtons();renderHome();}));
  $('#resume-session').addEventListener('click',()=>setPage('quiz'));
  $('#question-source').addEventListener('click',e=>openLesson(e.currentTarget.dataset.lessonId,true));
  $('#open-lesson-image').addEventListener('click',()=>{const l=currentLesson();if(l?.image)showSource([{label:l.image.caption,image:l.image.src}]);});
  $('#source-close').addEventListener('click',()=>$('#source-viewer').close());
  $('#source-image').addEventListener('click',()=>$('#source-scroll').classList.toggle('zoomed'));
  $('#source-previous').addEventListener('click',()=>{if(sourceIndex>0){sourceIndex--;renderSource();}});
  $('#source-next').addEventListener('click',()=>{if(sourceIndex<sourceItems.length-1){sourceIndex++;renderSource();}});
  $('#bookmark-point').addEventListener('click',()=>{const l=currentLesson();if(!l)return;data.bookmarks=data.bookmarks.includes(l.id)?data.bookmarks.filter(id=>id!==l.id):[...data.bookmarks,l.id];writeData();renderLessonEvidence(l);});
  $('#flag-point').addEventListener('click',()=>{const l=currentLesson();if(!l)return;const old=data.reviews[l.id]||{text:'',flagged:false};data.reviews[l.id]={...old,flagged:!old.flagged,updatedAt:new Date().toISOString()};writeData();renderLessonEvidence(l);if(data.reviews[l.id].flagged)$('#review-text').focus();});
  $('#review-text').addEventListener('input',e=>{const l=currentLesson();if(!l)return;data.reviews[l.id]={...data.reviews[l.id],text:e.target.value,updatedAt:new Date().toISOString()};writeData();$('#review-save-state').textContent=storageAvailable?'已保存到本机。':'本机保存失败，请导出备份。';});
  $('#export-review').addEventListener('click',exportBackup);
  $('#import-backup').addEventListener('change',async e=>{
    const file=e.target.files[0];if(!file)return;
    try{
      if(file.size>2000000)throw new Error('备份超过2MB，未导入。');
      const payload=JSON.parse(await file.text());if(payload.format!=='memory-lab-course-backup'||payload.courseId!==COURSE.id)throw new Error('请选择本课程导出的JSON备份。');
      const incoming=normalizeData(payload.data,true);
      if(!confirm(`将恢复 ${incoming.history.length} 轮练习、${incoming.learned.length} 条已学习标记及核对记录，并替换当前本机记录。继续吗？`))return;
      data=incoming;state.session=incoming.draft;state.mode=state.session?.mode||'choice';writeData();renderStats();$('#backup-status').textContent='本课程备份已恢复。';toast('备份已恢复。');
    }catch(err){$('#backup-status').textContent=err.message;}
    finally{e.target.value='';}
  });
  document.addEventListener('click',e=>{const link=e.target.closest?.('a.source-chip.external');if(link && window.AndroidBridge?.openExternal){e.preventDefault();window.AndroidBridge.openExternal(link.href);}});
  window.MemoryLab={back(){if($('#source-viewer').open){$('#source-viewer').close();return true;}if(state.page==='learn'){setPage(state.learningOrigin==='quiz'?'quiz':'home');return true;}if(state.page!=='home'){setPage('home');return true;}return false;},exportResult(success){$('#backup-status').textContent=success?'备份已保存。':'未保存备份，请重试或重新选择位置。';toast(success?'备份已保存。':'本次未保存。');}};
  document.title=COURSE.title+' · MEMORY / LAB';
  $('#course-title').textContent=COURSE.title;
  $('#course-description').textContent=COURSE.description;
  $('#course-notice').textContent=`${LESSONS.length} 条知识点 · ${QUESTIONS.filter(q=>q.type==='choice').length} 道客观题 · ${QUESTIONS.filter(q=>q.type==='essay').length} 道大题。`;
  $('#course-about').textContent=['内容版本 '+COURSE.version,COURSE.notice,COURSE.sourceInfo].filter(Boolean).join('。');
  if(window.COURSE_ERROR){$('#course-error').hidden=false;$('#course-error').textContent=window.COURSE_ERROR;}
  updateFilterButtons();

  renderHome();renderStats();setPage('home');
})();
