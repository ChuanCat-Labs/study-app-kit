/* Safe teaching presentation. Course strings are escaped before mathematical markup. */
(() => {
  'use strict';
  const $=s=>document.querySelector(s);
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const subscript={'₀':'0','₁':'1','₂':'2','₃':'3','₄':'4','₅':'5','₆':'6','₇':'7','₈':'8','₉':'9','₋':'−','ₛ':'s','ₖ':'k'};
  const superscript={'⁰':'0','¹':'1','²':'2','³':'3','⁴':'4','⁵':'5','⁶':'6','⁷':'7','⁸':'8','⁹':'9','⁻':'−'};
  function rich(value){
    let text=String(value??'');
    const tokens=[];
    const put=html=>{const key='\uE000'+tokens.length+'\uE001';tokens.push(html);return key;};
    // Replace mathematical entities first; do not let the Unicode fallback font
    // decide whether a particular subscript letter sits on the baseline.
    const indexed=(base,index)=>put('<span class="math-symbol"><span class="symbol-base">'+escape(base)+'</span><sub>'+escape(index)+'</sub></span>');
    text=text.replace(/([A-Za-zΑ-ω])(?:_\{([^{}]+)\}|_([A-Za-z]+|[−-]?\d+)|([₀-₉₋ₛₖ]+))/g,(_,base,braced,ascii,unicode)=>indexed(base,braced||ascii||[...unicode].map(c=>subscript[c]||c).join('')));
    text=text.replace(/([A-Za-z0-9℃])([⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+)/g,(_,base,index)=>put(escape(base)+'<sup>'+escape([...index].map(c=>superscript[c]||c).join(''))+'</sup>'));
    return escape(text).replace(/\uE000(\d+)\uE001/g,(_,n)=>tokens[Number(n)]).replace(/\n/g,'<br>');
  }
  function setRich(el,text){el.classList.add('rich');el.innerHTML=rich(text);}
  function safeMath(value){
    const ns='http://www.w3.org/1998/Math/MathML',doc=new DOMParser().parseFromString('<math xmlns="'+ns+'" display="block">'+String(value||'')+'</math>','application/xml');
    const tags=new Set(['math','mrow','mi','mn','mo','mtext','msub','msup','msubsup','mfrac','msqrt','mroot','mfenced','mover','munder','munderover','mtable','mtr','mtd','mspace']);
    const attributes=new Set(['xmlns','display','mathvariant','stretchy','fence','separator','linethickness','open','close','separators','columnalign','rowalign','columnspacing','rowspacing','accent','accentunder','width','height','depth']);
    const nodes=[doc.documentElement,...doc.documentElement.querySelectorAll('*')];
    const valid=!doc.querySelector('parsererror')&&nodes.every(n=>n.namespaceURI===ns&&tags.has(n.localName)&&[...n.attributes].every(a=>attributes.has(a.name)));
    if(valid)return document.importNode(doc.documentElement,true);
    const fallback=document.createElement('span');fallback.textContent='公式格式不可用';return fallback;
  }
  function mathCard(item,focus=false){
    const box=document.createElement('div');box.className='formula-card'+(focus?' focus-content':'');
    if(item.label){const title=document.createElement('div');title.className='formula-label';title.textContent=item.label;box.append(title);}
    const equation=document.createElement('div');equation.className='formula-equation';
    equation.append(safeMath(item.math));box.append(equation);
    if(item.meaning){const meaning=document.createElement('p');meaning.className='formula-meaning';setRich(meaning,item.meaning);box.append(meaning);}
    return box;
  }
  const annotations=()=>window.COURSE.highlights||{};
  function highlightInfo(ref){return annotations()[ref.highlightKey]||null;}
  function drawOverlay(svg,info){
    svg.replaceChildren();svg.toggleAttribute('hidden',!info?.rects?.length);
    if(!info)return;
    svg.setAttribute('viewBox',`0 0 ${info.width} ${info.height}`);
    svg.setAttribute('preserveAspectRatio','none');
    for(const row of info.rects){const rectangle=document.createElementNS('http://www.w3.org/2000/svg','rect');for(const k of ['x','y','width','height'])rectangle.setAttribute(k,row[k]);svg.append(rectangle);}
  }
  function sourceRef(lesson,ref){return {...ref,highlightKey:ref.highlightKey||lesson.id+':'+(ref.id||ref.pdfPage)};}
  function decorateSource(ref){
    const info=highlightInfo(ref),sheet=$('#source-sheet'),image=$('#source-image'),toggle=$('#toggle-highlights');
    sheet.style.setProperty('--page-native-width',(info?.width||image.naturalWidth||1200)+'px');
    image.onload=()=>sheet.style.setProperty('--page-native-width',(info?.width||image.naturalWidth||1200)+'px');
    drawOverlay($('#source-highlights'),info);
    toggle.hidden=!info?.rects?.length;toggle.textContent='隐藏荧光标记';
    toggle.onclick=()=>{const overlay=$('#source-highlights');overlay.toggleAttribute('hidden');toggle.textContent=overlay.hasAttribute('hidden')?'显示荧光标记':'隐藏荧光标记';};
  }
  function renderSources(lesson,openSource){
    const host=$('#source-preview');host.replaceChildren();
    const refs=lesson.refs.filter(r=>r.image&&r.preview!==false);
    if(!refs.length)return;
    const ref=refs.find(r=>r.id===lesson.primarySource)||refs.find(r=>highlightInfo(sourceRef(lesson,r))?.rects?.length)||refs[0];
    const info=highlightInfo(sourceRef(lesson,ref));
    const figure=document.createElement('figure');figure.className='source-preview';
    const button=document.createElement('button');button.type='button';button.setAttribute('aria-label','放大资料原页和荧光标记');
    const sheet=document.createElement('div');sheet.className='source-sheet';
    const img=document.createElement('img');img.src=ref.image;img.alt=ref.label;img.loading='lazy';
    const overlay=document.createElementNS('http://www.w3.org/2000/svg','svg');overlay.setAttribute('aria-hidden','true');drawOverlay(overlay,info);
    sheet.append(img,overlay);button.append(sheet);button.addEventListener('click',()=>openSource(lesson.refs.filter(r=>r.image).map(r=>sourceRef(lesson,r)),lesson.refs.filter(r=>r.image).indexOf(ref)));
    const caption=document.createElement('figcaption');caption.textContent=ref.label+(info?.rects.length?' · 黄色为本知识点相关原文，点图放大。':' · 点图查看原文。');figure.append(button,caption);host.append(figure);
  }
  function renderLesson(lesson,openSource){
    const focus=new Set(lesson.focusFields||[]);
    const formulaHost=$('#lesson-formula');$('#lesson-explanation').parentElement.append(formulaHost);
    for(const [selector,field] of [['#lesson-concept','concept'],['#lesson-explanation','explain'],['#lesson-warning','warning']]){
      setRich($(selector),lesson[field]);$(selector).classList.toggle('focus-content',focus.has(field));
    }
    $('#lesson-index').textContent=(lesson.displayNumber||String(window.COURSE.lessons.indexOf(lesson)+1).padStart(2,'0'))+'.';
    $('#lesson-metrics').querySelectorAll('.lesson-metric').forEach((el,i)=>{
      setRich(el.querySelector('small'),lesson.metrics[i][0]);setRich(el.querySelector('strong'),lesson.metrics[i][1]);el.classList.toggle('focus-content',focus.has('metrics'));
    });
    const formula=$('#lesson-formula');formula.replaceChildren();formula.hidden=!(lesson.formulas?.length||lesson.formula);
    if(lesson.formulas?.length)for(const item of lesson.formulas)formula.append(mathCard(item,focus.has('formula')));
    else if(lesson.formula)setRich(formula,lesson.formula);
    const preventive=$('#lesson-prevention');preventive.replaceChildren();preventive.hidden=!lesson.prevention;
    if(lesson.prevention){const title=document.createElement('h3');title.textContent=lesson.preventionTitle||'预防措施';preventive.append(title);let next=1;lesson.prevention.forEach((group)=>{
      const block=document.createElement('div');block.className='prevention-group';const title=document.createElement('h4');title.textContent=group.title;const list=document.createElement('ol');list.start=next;
      for(const value of group.items){const li=document.createElement('li');setRich(li,value);list.append(li);next++;}block.append(title,list);preventive.append(block);
    });}
    renderOutline(lesson);
    renderProcess(lesson,openSource);
    const gallery=$('#lesson-diagrams');gallery.replaceChildren();gallery.hidden=!(lesson.figures.length||lesson.sourceFigure);
    if(lesson.figures.length){const title=document.createElement('h3');title.textContent='看图理解';gallery.append(title);
      for(const item of lesson.figures){const figure=document.createElement('figure');figure.className='diagram-card';const h=document.createElement('h4');h.textContent=item.title||'示意图';const button=document.createElement('button');button.type='button';const img=document.createElement('img');img.src=item.image;img.alt=item.title||'示意图';button.append(img);button.onclick=()=>openSource([{label:item.title||'示意图',image:item.image}]);const caption=document.createElement('figcaption');setRich(caption,item.caption||'');figure.append(h,button,caption);gallery.append(figure);}
    }
    if(lesson.sourceFigure){
      const item=lesson.sourceFigure,crop=item.crop,figure=document.createElement('figure');figure.className='diagram-card source-recognition';
      const heading=document.createElement('h3');heading.textContent=item.title;
      const button=document.createElement('button');button.type='button';button.className='source-crop';button.style.aspectRatio=`${crop.width} / ${crop.height}`;button.setAttribute('aria-label','放大图片所在原页');
      const img=document.createElement('img');img.src=item.image;img.alt=item.title||'资料图片';
      img.style.width=`${100*item.nativeWidth/crop.width}%`;img.style.left=`${-100*crop.x/crop.width}%`;img.style.top=`${-100*crop.y/crop.height}%`;
      button.append(img);button.onclick=()=>openSource([{label:item.caption,image:item.image}]);
      const caption=document.createElement('figcaption');caption.textContent=item.caption;figure.append(heading,button,caption);gallery.append(figure);
    }
    if(lesson.diagramFirst)gallery.append(formulaHost);
    const example=$('#lesson-example');example.replaceChildren();example.hidden=!lesson.workedExample;
    if(lesson.workedExample){const item=lesson.workedExample,h=document.createElement('h3');h.textContent=item.title;const question=document.createElement('p');question.className='example-question';setRich(question,item.question);example.append(h,question);
      for(const [i,step] of item.steps.entries()){const box=document.createElement('div');box.className='example-step';const title=document.createElement('h4');title.textContent=`${i+1}. ${step.title}`;box.append(title,mathCard(step.formula));example.append(box);}
      const result=document.createElement('p');result.className='example-result';setRich(result,item.result);example.append(result);
    }
    // Keep the original textbook crop as an additional check, after the redraw.
    renderSources(lesson,openSource);
    $('#lesson-concept').parentElement.hidden=!lesson.concept||lesson.layout==='process';
    $('#lesson-metrics').parentElement.hidden=!lesson.metrics.length||!!lesson.hideMetrics||lesson.layout==='process';
    $('#lesson-explanation').parentElement.hidden=lesson.layout==='process'||!(lesson.explain||(!lesson.diagramFirst&&(lesson.formula||lesson.formulas?.length)));
    $('#lesson-warning').parentElement.hidden=!lesson.warning||lesson.layout==='process';
    $('#lesson-calibration').hidden=!lesson.calibrationNote;$('#lesson-calibration').open=false;setRich($('#calibration-text'),lesson.calibrationNote||'');
    $('.source-details').open=false;
  }
  function renderOutline(lesson){
    const host=$('#lesson-outline');host.replaceChildren();host.hidden=!lesson.numberedSections?.length;
    for(const group of lesson.numberedSections||[]){
      const block=document.createElement('section');block.className='numbered-group'+(group.focus?' focus-content':'');
      const title=document.createElement('h3');setRich(title,group.title);const list=document.createElement('ol');
      for(const value of group.items){const item=typeof value==='string'?{text:value}:value;const li=document.createElement('li');li.classList.toggle('focus-content',!!item.focus);li.classList.toggle('priority-item',!!item.priority);
        if(item.title){const title=document.createElement('strong');title.textContent=item.title;li.append(title);}
        if(item.text){const text=document.createElement('div');setRich(text,item.text);for(const term of item.emphasis||[])text.innerHTML=text.innerHTML.replaceAll(escape(term),'<span class="note-highlight">'+escape(term)+'</span>');li.append(text);}
        if(item.formula)li.append(mathCard(item.formula,!!group.focus));list.append(li);
      }
      block.append(title,list);host.append(block);
    }
  }
  function renderProcess(lesson,openSource){
    const host=$('#lesson-process');host.replaceChildren();host.hidden=!lesson.process?.length;
    for(const [i,item] of (lesson.process||[]).entries()){
      const block=document.createElement('section');block.className='process-step focus-content';const heading=document.createElement('h3');heading.textContent=`${i+1}. ${item.title}`;block.append(heading);
      if(item.image){const button=document.createElement('button');button.type='button';button.className='process-figure';const img=document.createElement('img');img.src=item.image;img.alt=item.title;button.append(img);button.onclick=()=>openSource([{label:item.title+' · 过程示意',image:item.image}]);block.append(button);}
      if(item.formula)block.append(mathCard(item.formula,true));const body=document.createElement('p');setRich(body,item.text);block.append(body);host.append(block);
    }
  }
  function presentQuiz(question,session){
    let figure=$('#quiz-source-figure');
    if(!figure){figure=document.createElement('figure');figure.id='quiz-source-figure';figure.className='quiz-source-figure';$('#question-description').after(figure);}
    figure.replaceChildren();figure.hidden=!question?.sourceFigure;
    if(question?.sourceFigure){
      const item=question.sourceFigure,crop=item.crop,viewport=document.createElement('div');viewport.className='source-crop';viewport.style.aspectRatio=`${crop.width} / ${crop.height}`;
      const img=document.createElement('img');img.src=item.image;img.alt='用于本题识别的图片';
      img.style.width=`${100*item.nativeWidth/crop.width}%`;img.style.left=`${-100*crop.x/crop.width}%`;img.style.top=`${-100*crop.y/crop.height}%`;
      viewport.append(img);const caption=document.createElement('figcaption');caption.textContent='观察图片后作答';figure.append(viewport,caption);
    }
    if(!question){$('#fill-block').hidden=true;if(session?.answers?.length&&session.pool.every(id=>!window.COURSE.questions.some(q=>q.id===id)))$('#quiz-helper').textContent='本轮题目已合并或移出新版范围，可以结束并保留已答记录。';return;}
    for(const selector of ['#question-text','#answer-result','#essay-reference'])setRich($(selector),$(selector).textContent);
    $('#choice-options').querySelectorAll('.choice span').forEach(el=>setRich(el,el.textContent));
    const fill=question.type==='choice'&&question.format==='fill';$('#fill-block').hidden=!fill;
    if(fill){$('#choice-options').hidden=true;const pending=session.pending;$('#fill-answer').disabled=!!pending;$('#submit-fill').hidden=!!pending;$('#fill-answer').value=pending?.selectedOption??session.fillDrafts?.[question.id]??'';$('#submit-fill').disabled=false;}
    const kind=question.type==='essay'?'大题 · 对照要点后自评':question.format==='fill'?'填空题 · 输入后自动判分':question.format==='judgment'?'判断题 · 选择正确或错误':'选择题 · 请选择一个正确答案';
    $('#question-description').textContent=(question.desc||'自编复习题 · '+kind)+(window.COURSE.lessons.find(l=>l.id===question.lessonId)?.focusScope?'；课堂范围：'+window.COURSE.lessons.find(l=>l.id===question.lessonId).focusScope:'');
  }
  window.CourseUI={rich,setRich,renderLesson,decorateSource,sourceRef,presentQuiz};
})();
