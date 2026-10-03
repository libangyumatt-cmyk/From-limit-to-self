'use strict';
const $ = id => document.getElementById(id);
const canvas = $('field'), ctx = canvas.getContext('2d');
const labels = ['活动', '探索', '界限', '轮廓', '创造', '视角'];
const MARK_HOLD = 3000, MARK_LIFE = 12000, OUTLINE_DISCOVERY_DISTANCE = .12;
const SEARCH_DISTANCE = .28, SEARCH_TIME = 1.4;
const COPY_FADE = 1350;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let W=0, H=0, dpr=1, stage=0, flow='', path=[], ink=[], stroke=[], trail=[];
let down=false, activeId=null, split=.5;
let pointer={x:.5,y:.4}, travel=0, lastTime=0, noticeUntil=0;
let camera={x:0,y:0,zoom:1}, cameraTween=null, draggingOutline=false;
let outlinePan=0, outlineDiscovered=false, gridOpacity=0, emptyPulse=null;
let storyClock=0, storyTasks=[], copyBlend=null;
let search={phase:'first',distance:0,time:0,touched:false};
let unfolding=null, seamAt=null, namesAt=null;
let limitUnlocked=false;

const stamped = p => ({...p,t:performance.now()});
const opacity = (p,t) => Math.max(0,Math.min(1,(MARK_LIFE-(t-p.t))/(MARK_LIFE-MARK_HOLD)));
const drawBox = () => ({x:W*.13,y:Math.max(135,H*.20),w:W*.74,h:Math.max(150,H*.38)});
const dist = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
const measure = p => p.reduce((s,v,i)=>i?s+dist(v,p[i-1]):0,0);
const area = p => Math.abs(p.reduce((s,v,i)=>{const n=p[(i+1)%p.length];return s+v.x*n.y-n.x*v.y},0)/2);
const clean = p => ({x:p.x,y:p.y});
const smooth = v => {v=Math.max(0,Math.min(1,v));return v*v*(3-2*v)};
function inside(p,poly=path){
  let c=false;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++){
    const a=poly[i],b=poly[j];
    if(((a.y>p.y)!=(b.y>p.y))&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)c=!c;
  }
  return c;
}
function bounds(points=path){
  const xs=points.map(p=>p.x),ys=points.map(p=>p.y);
  return {minX:Math.min(...xs),maxX:Math.max(...xs),minY:Math.min(...ys),maxY:Math.max(...ys)};
}
function segDistance(p,a,b){
  const dx=b.x-a.x,dy=b.y-a.y;
  const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));
  return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);
}
function wallDistance(p){
  return Math.min(...path.map((a,i)=>segDistance(p,a,path[(i+1)%path.length])));
}
function center(){
  const b=bounds();let best={...path[0]},score=-1;
  for(let x=b.minX+.01;x<b.maxX;x+=.012)for(let y=b.minY+.01;y<b.maxY;y+=.012){
    const p={x,y};
    if(inside(p)){const d=wallDistance(p);if(d>score){score=d;best=p}}
  }
  return clean(best);
}
function say(text){
  $('notice').textContent=text;noticeUntil=performance.now()+3800;
}
function later(ms,action){storyTasks.push({at:storyClock+ms,action})}
function clearStory(){storyTasks=[]}
function narrative(title,eyebrow='',hint='',animate=true){
  const copy=$('copy'),ghost=$('copy-ghost');
  if(animate&&!reducedMotion.matches){
    const clones=Array.from(copy.children).map(el=>{
      const clone=el.cloneNode(true);clone.removeAttribute('id');return clone;
    });
    ghost.replaceChildren(...clones);
    ghost.style.opacity='1';copy.style.opacity='0';
    copyBlend={at:storyClock};
  }else{
    ghost.replaceChildren();ghost.style.opacity='0';copy.style.opacity='1';copyBlend=null;
  }
  $('title').textContent=title;
  $('eyebrow').textContent=eyebrow;$('eyebrow').hidden=!eyebrow;
  $('hint').textContent=hint;$('hint').hidden=!hint;
}
function showRoute(){
  $('chapter').textContent=limitUnlocked?'《先验观念论体系》 · 限定':'《先验观念论体系》 · 交互序章';
  document.querySelectorAll('[data-route="limitation"]').forEach(node=>{
    node.disabled=!limitUnlocked;node.textContent=limitUnlocked?'限定':'？';
    node.classList.toggle('is-locked',!limitUnlocked);
    node.classList.toggle('is-current',limitUnlocked);
    node.setAttribute('aria-current',limitUnlocked?'page':'false');
  });
  $('route-marker').textContent=limitUnlocked?'↑ 本章已完成，可以重新进入':'限定将在两个观看位置显现后解锁';
  $('route-status').textContent=limitUnlocked?'点击“限定”从头重走这一章节。':'这一章仍在展开。';
}
function unlockLimitation(){limitUnlocked=true;showRoute()}
document.querySelectorAll('[data-route="limitation"]').forEach(node=>node.addEventListener('click',()=>{
  if(!limitUnlocked)return;
  $('info').close();reset();
}));
function releasePointer(){
  if(activeId!==null&&canvas.hasPointerCapture(activeId))canvas.releasePointerCapture(activeId);
  activeId=null;down=false;draggingOutline=false;stroke=[];
}
function setStage(s,preserveGesture=false){
  clearStory();if(!preserveGesture)releasePointer();stage=s;flow='';emptyPulse=null;
  unfolding=null;seamAt=null;namesAt=null;
  $('game').dataset.stage=String(s);$('primary').hidden=true;$('undo').hidden=true;
  $('phase').textContent=String(s+1).padStart(2,'0')+' · '+labels[s];
  if(s===0)showRoute();
  $('notice').textContent='';noticeUntil=0;
  if(s===0)narrative('先动起来。','还没有一个形状替你作答','移动鼠标，或用手指划过空白。',false);
  if(s===1){
    search={phase:'first',distance:0,time:0,touched:false};
    narrative('一个点。','一次停留，留下了一处','从这里继续探索。拖动到画面边缘，看看空白是否有尽头。',false);
  }
  if(s===2){
    flow='discovery';
    narrative('这里没有现成的边缘。');
    later(COPY_FADE+1800,()=>{
      flow='boundary';path=down?[stamped(pointer)]:[];
      narrative('如果需要一个边缘，就只能由你来画。','','画出一条线，回到起点，把它闭合。线条会随时间消散。');
    });
    $('undo').hidden=false;
  }
  if(s===3){
    flow='claim';outlinePan=0;outlineDiscovered=false;pointer=center();
    $('undo').hidden=false;
    narrative('这就是你。');
    later(COPY_FADE+1600,()=>{
      flow='move';canvas.style.cursor='grab';
      narrative('……或者，只是你所能看见的你？','','这个轮廓能去哪里？');
    });
  }
  if(s===4){
    flow='drawing';pointer=center();$('undo').hidden=false;canvas.style.cursor='crosshair';
    narrative('给这个界限一个位置。','','在里面画一个点、符号或人。可以分几笔；完成后，选择“保留这个形象”。');
  }
  if(s===5){
    flow='opening';canvas.style.cursor='default';
    const duration=reducedMotion.matches?900:6200;
    unfolding={at:storyClock,duration,reduced:reducedMotion.matches};
    $('reflection').hidden=false;$('help').hidden=true;
    $('views').hidden=true;$('seam').hidden=true;
    $('views').style.opacity='0';$('seam').style.opacity='0';
    narrative('');
    later(duration,()=>{
      flow='watcher';seamAt=storyClock;$('seam').hidden=false;unlockLimitation();
      later(1000,()=>{
        narrative('而你正在看着它。');
        later(COPY_FADE+2000,()=>{
          namesAt=storyClock;$('views').hidden=false;
          later(2600,()=>{
            flow='views';narrative('你正在看。');
            button('回看刚才发生了什么',()=>$('info').showModal());
          });
        });
      });
    });
  }
  if(s<3)canvas.style.cursor='crosshair';
}
function revealEmptyInterior(){
  flow='unbounded';canvas.style.cursor='default';
  narrative('它仍可以继续移动。','','轮廓有了，画面之外却仍是空白。');
  later(COPY_FADE+1700,()=>{
    const b=bounds();
    cameraTween={at:storyClock,from:{...camera},to:{x:(b.minX+b.maxX)/2-.5,y:(b.minY+b.maxY)/2-.5,zoom:1}};
    flow='exists';pointer=center();
    narrative('界限已经存在。');
    later(COPY_FADE+1400,()=>{
      flow='empty';canvas.style.cursor='pointer';
      narrative('但什么被限定了？','界限已经存在。');
    });
  });
}
function finishCreation(){
  if(stage!==4||flow!=='drawing'||down||!ink.length)return;
  flow='object';canvas.style.cursor='default';$('primary').hidden=true;
  narrative('现在，有某物处在界限之内。');
  later(COPY_FADE+2400,()=>setStage(5));
}
function tickStory(dt){
  storyClock+=dt*1000;
  // The reading pauses also pause while the tab is hidden or the help dialog is open.
  while(true){
    storyTasks.sort((a,b)=>a.at-b.at);
    if(!storyTasks.length||storyTasks[0].at>storyClock)break;
    storyTasks.shift().action();
  }
  if(copyBlend){
    const elapsed=storyClock-copyBlend.at;
    $('copy-ghost').style.opacity=String(1-smooth(elapsed/520));
    $('copy').style.opacity=String(smooth((elapsed-620)/730));
    if(elapsed>=COPY_FADE){
      copyBlend=null;$('copy-ghost').replaceChildren();$('copy').style.opacity='1';
    }
  }
  if(cameraTween){
    const t=reducedMotion.matches?1:smooth((storyClock-cameraTween.at)/900);
    const {from,to}=cameraTween;
    camera={x:from.x+(to.x-from.x)*t,y:from.y+(to.y-from.y)*t,zoom:from.zoom+(to.zoom-from.zoom)*t};
    if(t>=1)cameraTween=null;
  }
  if(seamAt!==null)$('seam').style.opacity=String(smooth((storyClock-seamAt)/1400));
  if(namesAt!==null)$('views').style.opacity=String(smooth((storyClock-namesAt)/1800));
}
function button(text,fn){$('primary').textContent=text;$('primary').hidden=false;$('primary').onclick=fn}
function resize(){
  W=canvas.clientWidth;H=canvas.clientHeight;dpr=Math.min(devicePixelRatio||1,2);
  canvas.width=W*dpr;canvas.height=H*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);
}
function pos(e){
  const r=canvas.getBoundingClientRect(),b=drawBox();
  return {x:((e.clientX-r.left)-b.x)/(b.w*camera.zoom)+camera.x,y:((e.clientY-r.top)-b.y)/(b.h*camera.zoom)+camera.y};
}
function project(p){
  const b=drawBox();
  return {x:b.x+(p.x-camera.x)*b.w*camera.zoom,y:b.y+(p.y-camera.y)*b.h*camera.zoom};
}
function expireMarks(t){
  if(stage<1||stage>2)return;
  const hadMarks=path.length>0;
  while(path.length&&t-path[0].t>=MARK_LIFE)path.shift();
  if(!path.length){
    stroke=[];
    if(down)path.push(stamped(pointer));
    else if(hadMarks&&stage===2&&flow==='boundary')say('刚才的界限已消散。从这里重新画一条界限。');
  }
  if(stage===2){
    if(flow==='boundary'&&path.length>4&&!down)button('连接起点，闭合轮廓',closePath);
    else $('primary').hidden=true;
  }
}
function start(p){
  expireMarks(performance.now());pointer=clean(p);
  if(stage===0){setStage(1);path=[stamped(pointer)]}
  else if(stage===1||stage===2){
    if(!path.length||dist(path[path.length-1],pointer)>.004)path.push(stamped(pointer));
  }else if(stage===3){
    if(flow==='move'){
      if(!inside(pointer)&&wallDistance(pointer)>.035)return;
      draggingOutline=true;canvas.style.cursor='grabbing';
    }else if(flow==='empty'){
      if(!inside(pointer))return;
      // This tap finds empty space. It is deliberately not the first mark of the next stage.
      flow='empty-tap';emptyPulse={...pointer,at:storyClock};
      later(1900,()=>setStage(4));return;
    }else return;
  }else if(stage===4&&flow==='drawing'){
    if(!inside(pointer)){say('把这一点或这一笔留在界限之内。');return}
    $('primary').hidden=true;stroke=[pointer];
  }else return;
  down=true;
}
function move(p){
  p=clean(p);const previous=pointer;
  travel+=dist(previous,p);pointer=p;
  if(stage<3)trail.push({...p,t:performance.now()});
  if(stage===0&&travel>.7)$('hint').textContent='痕迹正在消散。试着点下一处，再继续向外画。';
  if(!down)return;
  if(stage===1||stage===2){
    if(!path.length||dist(path[path.length-1],p)>.004)path.push(stamped(p));
  }else if(stage===3&&draggingOutline){
    const dx=p.x-previous.x,dy=p.y-previous.y;
    path=path.map(v=>({...v,x:v.x+dx,y:v.y+dy}));
  }else if(stage===4&&flow==='drawing'){
    if(inside(p)){
      if(!stroke.length)stroke=[p];
      else if(dist(stroke[stroke.length-1],p)>.004){
        // Do not bridge a concave gap by connecting two interior points across the outside.
        const last=stroke[stroke.length-1];
        const steps=Math.max(1,Math.ceil(dist(last,p)/.006));
        let contained=true;
        for(let i=1;i<steps;i++)if(!inside({x:last.x+(p.x-last.x)*i/steps,y:last.y+(p.y-last.y)*i/steps})){contained=false;break}
        if(!contained){ink.push(stroke);stroke=[p]}else stroke.push(p);
      }
    }else if(stroke.length){ink.push(stroke);stroke=[]}
  }
}
function panAtEdge(dt){
  if(!down||$('info').open||document.hidden||!(stage<3||(stage===3&&draggingOutline)))return;
  const p=project(pointer),b=drawBox(),margin=Math.min(90,W*.14,H*.14);
  // A second search needs a deliberate return: release, or move back into the
  // interior before approaching an edge again. Holding one edge never counts twice.
  if(stage===1&&search.phase==='between'&&p.x>margin+24&&p.x<W-margin-24&&p.y>margin+24&&p.y<H-margin-24){
    search.phase='second';search.distance=0;search.time=0;
  }
  const speed=(v,size)=>v<margin?-Math.min(1,(margin-v)/margin):v>size-margin?Math.min(1,(v-size+margin)/margin):0;
  const dx=speed(p.x,W)*360*dt/(b.w*camera.zoom),dy=speed(p.y,H)*360*dt/(b.h*camera.zoom);
  if(!dx&&!dy)return;
  camera.x+=dx;camera.y+=dy;move({x:pointer.x+dx,y:pointer.y+dy});
  if(stage===1){
    if(!search.touched){search.touched=true;narrative('')}
    if(search.phase==='first'||search.phase==='second'){
      // Viewport-relative distance makes vertical, horizontal and mobile searches comparable.
      search.distance+=Math.hypot(dx*b.w*camera.zoom/W,dy*b.h*camera.zoom/H);
      search.time+=dt;
      if(search.distance>=SEARCH_DISTANCE&&search.time>=SEARCH_TIME){
        if(search.phase==='first')search.phase='between';
        else {search.phase='done';setStage(2,true)}
      }
    }
  }else if(stage===3&&draggingOutline){
    outlinePan+=Math.hypot(dx,dy);
    if(outlinePan>=OUTLINE_DISCOVERY_DISTANCE&&!outlineDiscovered){
      outlineDiscovered=true;
    }
  }
}
function finish(){
  if(!down)return;
  down=false;expireMarks(performance.now());
  if(stage===1&&search.phase==='between'){
    search.phase='second';search.distance=0;search.time=0;
  }else if(stage===2&&flow==='boundary'){
    $('undo').hidden=false;
    if(path.length>5&&measure(path)>.6&&dist(path[0],path[path.length-1])<.09)closePath();
    else if(path.length>4)button('连接起点，闭合轮廓',closePath);
  }else if(stage===3&&draggingOutline){
    draggingOutline=false;canvas.style.cursor='grab';
    if(outlineDiscovered)revealEmptyInterior();
  }else if(stage===4&&flow==='drawing'){
    if(stroke.length)ink.push(stroke);stroke=[];
    if(ink.length)button('保留这个形象',finishCreation);
  }else stroke=[];
}
function closePath(){
  if(stage===2&&flow!=='boundary')return;
  expireMarks(performance.now());
  if(stage!==2||path.length<4||area(path)<.035){say('轮廓已经消散，或还太小。继续画，围出一个区域。');return}
  const b=bounds(),size=Math.max(b.maxX-b.minX,b.maxY-b.minY);
  path=path.map(p=>({...p,x:.5+(p.x-(b.minX+b.maxX)/2)*.85/size,y:.5+(p.y-(b.minY+b.maxY)/2)*.85/size}));
  camera={x:0,y:0,zoom:1};trail=[];stroke=[];setStage(3);
}
canvas.addEventListener('pointerdown',e=>{
  if(stage===5)return;
  if(activeId!==null)return;
  canvas.focus({preventScroll:true});
  start(pos(e));
  activeId=e.pointerId;canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove',e=>{
  if(activeId!==null&&activeId!==e.pointerId)return;
  if(stage!==5)move(pos(e));
});
canvas.addEventListener('pointerup',e=>{
  if(activeId!==e.pointerId)return;
  finish();releasePointer();
});
function cancelGesture(){
  releasePointer();
  if(stage===4&&flow==='drawing'&&ink.length)button('保留这个形象',finishCreation);
}
canvas.addEventListener('pointercancel',cancelGesture);
canvas.addEventListener('lostpointercapture',()=>{
  // Natural releases have already been finished; interruption discards only the active stroke.
  if(down)cancelGesture();
});
$('undo').onclick=()=>{
  if(stage===4){ink=[];stroke=[];setStage(4)}
  else if(stage===2||stage===3){
    path=[];stroke=[];ink=[];trail=[];cameraTween=null;
    if(stage===3)camera={x:0,y:0,zoom:1};
    setStage(2);
  }
};
function reset(){
  clearStory();releasePointer();camera={x:0,y:0,zoom:1};cameraTween=null;
  path=[];stroke=[];ink=[];trail=[];travel=0;
  pointer={x:.5,y:.4};split=.5;gridOpacity=0;outlinePan=0;outlineDiscovered=false;
  search={phase:'first',distance:0,time:0,touched:false};
  document.body.classList.remove('split');
  ['views','seam','reflection'].forEach(id=>$(id).hidden=true);
  seamHeld=false;
  $('seam').style.left='50%';$('seam').setAttribute('aria-valuenow','50');
  $('views').style.gridTemplateColumns='1fr 1fr';$('help').hidden=false;setStage(0);
}
$('restart').onclick=reset;
$('chapter').onclick=()=>$('info').showModal();
$('menu').onclick=()=>{cancelGesture();showRoute();$('info').showModal()};
$('close').onclick=()=>$('info').close();
$('info').addEventListener('click',e=>{
  if(e.target===$('info')){
    const r=$('info').getBoundingClientRect();
    if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('info').close();
  }
});
function setSplit(x){
  split=Math.max(.25,Math.min(.75,x));$('seam').style.left=split*100+'%';
  $('seam').setAttribute('aria-valuenow',Math.round(split*100));
  $('views').style.gridTemplateColumns=split+'fr '+(1-split)+'fr';
}
let seamHeld=false;
$('seam').addEventListener('pointerdown',e=>{seamHeld=true;$('seam').setPointerCapture(e.pointerId)});
$('seam').addEventListener('pointermove',e=>{if(seamHeld)setSplit(e.clientX/W)});
['pointerup','pointercancel'].forEach(type=>$('seam').addEventListener(type,()=>seamHeld=false));
$('seam').addEventListener('keydown',e=>{
  if(e.key==='ArrowLeft'||e.key==='ArrowRight'){
    e.preventDefault();e.stopPropagation();setSplit(split+(e.key==='ArrowLeft'?-.025:.025));
  }
});
window.addEventListener('keydown',e=>{
  if($('info').open||e.target.tagName==='BUTTON'||e.target===$('seam'))return;
  if(stage===5||!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' ','Enter'].includes(e.key))return;
  e.preventDefault();
  if(e.key===' '){
    if(down)finish();else start(pointer);
  }else if(e.key==='Enter'){
    // Completing a boundary must not also skip the freshly entered narrative.
    const before=stage, wasDown=down;finish();
    if(before===2&&stage===2)closePath();
    else if(before===4&&stage===4&&!wasDown)finishCreation();
  }else{
    move({x:pointer.x+(e.key==='ArrowRight'?.025:0)-(e.key==='ArrowLeft'?.025:0),
      y:pointer.y+(e.key==='ArrowDown'?.025:0)-(e.key==='ArrowUp'?.025:0)});
  }
});
window.addEventListener('blur',cancelGesture);
document.addEventListener('visibilitychange',()=>{cancelGesture();lastTime=0});
function line(points,projector=project,closed=false,fill=false){
  if(!points.length)return;
  ctx.beginPath();points.forEach((p,i)=>{const q=projector(p);i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y)});
  if(closed)ctx.closePath();if(fill)ctx.fill();ctx.stroke();
}
function dot(p,r=4){ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);ctx.fill()}
function drawMark(points,projector=project){
  if(points.length===1){ctx.fillStyle=ctx.strokeStyle;dot(projector(points[0]),3.2)}
  else line(points,projector);
}
// The very same drawing moves right; no second avatar or camera-world is created.
function sceneProject(p,progress=1){
  const b=bounds(),lo=project({x:b.minX,y:b.minY}),hi=project({x:b.maxX,y:b.maxY});
  const width=Math.max(1,hi.x-lo.x),height=Math.max(1,hi.y-lo.y);
  const scale=Math.min(1,Math.max(20,W*(1-split)-44)/width,drawBox().h/height);
  const mid={x:(lo.x+hi.x)/2,y:(lo.y+hi.y)/2};
  const q=project(p),target={x:W*(split+(1-split)/2)+(q.x-mid.x)*scale,y:mid.y+(q.y-mid.y)*scale};
  return {x:q.x+(target.x-q.x)*progress,y:q.y+(target.y-q.y)*progress};
}
function drawScene(projector){
  ctx.strokeStyle='#3b717c';ctx.fillStyle='#f1f7f8';ctx.lineWidth=2;
  line(path,projector,true,true);
  ctx.strokeStyle='#293f44';ink.forEach(s=>drawMark(s,projector));
}
function renderViews(){
  const t=unfolding?smooth((storyClock-unfolding.at)/unfolding.duration):1;
  if(unfolding?.reduced&&t<1){
    ctx.save();ctx.globalAlpha=1-t;drawScene(project);
    ctx.globalAlpha=t;drawScene(p=>sceneProject(p));ctx.restore();
  }else drawScene(p=>sceneProject(p,t));
}
function renderInterior(){
  if(stage!==3||!(flow==='empty'||flow==='empty-tap'))return;
  ctx.save();
  ctx.beginPath();path.forEach((p,i)=>{const q=project(p);i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y)});
  ctx.closePath();ctx.clip();
  if(flow==='empty'){
    const breath=reducedMotion.matches?.035:.018+.025*(1+Math.sin(storyClock/1400))/2;
    ctx.fillStyle='rgba(100,137,145,'+breath+')';ctx.fillRect(0,0,W,H);
  }
  if(emptyPulse){
    const age=storyClock-emptyPulse.at,life=Math.min(1,age/1200),p=project(emptyPulse);
    ctx.strokeStyle='rgba(100,137,145,'+(.22*(1-life)*(1-life))+')';ctx.lineWidth=1;
    ctx.beginPath();ctx.arc(p.x,p.y,reducedMotion.matches?24:8+age*.045,0,Math.PI*2);ctx.stroke();
  }
  ctx.restore();
}
function renderGrid(){
  if(gridOpacity<.005)return;
  const origin=project({x:0,y:0}),spacing=76;
  ctx.save();ctx.globalAlpha=gridOpacity;ctx.fillStyle='#97b1b6';
  for(let x=((origin.x%spacing)+spacing)%spacing;x<W;x+=spacing)
    for(let y=((origin.y%spacing)+spacing)%spacing;y<H;y+=spacing)dot({x,y},.8);
  ctx.restore();
}
function frame(t){
  const elapsed=lastTime?(t-lastTime)/1000:0;
  const dt=Math.min(elapsed,.04);lastTime=t;
  if(!document.hidden&&!$('info').open){
    tickStory(elapsed);expireMarks(t);panAtEdge(dt);
  }
  ctx.clearRect(0,0,W,H);ctx.lineCap='round';ctx.lineJoin='round';
  const gridTarget=stage===3&&(flow==='move'||flow==='unbounded')?.35:0;
  gridOpacity+=(gridTarget-gridOpacity)*Math.min(1,dt*3);
  if(stage===5)renderViews();
  else{
    renderGrid();
    trail=trail.filter(p=>t-p.t<1200);
    trail.forEach(p=>{ctx.fillStyle='rgba(110,150,160,'+(.2*(1-(t-p.t)/1200))+')';dot(project(p),2)});
    ctx.strokeStyle='#3b717c';ctx.lineWidth=2;ctx.fillStyle='#f1f7f8';
    if(stage>=3)line(path,project,true,true);
    else{
      for(let i=1;i<path.length;i++){ctx.globalAlpha=opacity(path[i-1],t);line([path[i-1],path[i]])}
      ctx.globalAlpha=1;
    }
    if(stage>=1&&stage<3&&path.length){
      ctx.globalAlpha=opacity(path[0],t);ctx.fillStyle='#315e68';dot(project(path[0]),4);
      ctx.strokeStyle='#adc4c9';ctx.lineWidth=1;ctx.beginPath();const p=project(path[0]);
      ctx.arc(p.x,p.y,14,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1;
    }
    renderInterior();
    ctx.strokeStyle='#3b717c';ctx.lineWidth=2;drawMark(stroke);
    ctx.strokeStyle='#293f44';ink.forEach(s=>drawMark(s));
    if(down&&stage<3){ctx.fillStyle='#315e68';dot(project(pointer),2)}
  }
  if(noticeUntil&&t>noticeUntil){$('notice').textContent='';noticeUntil=0}
  requestAnimationFrame(frame);
}
window.addEventListener('resize',resize);resize();setStage(0);requestAnimationFrame(frame);
if(document.modelContext?.registerTool){
  try{
    Promise.resolve(document.modelContext.registerTool({
      name:'read_game_stage',description:'Read the current stage of the first-limitation game without changing it.',
      inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},
      execute:()=>({stage:labels[stage],moment:flow,boundaryClosed:stage>=3,figureDrawn:ink.length>0,splitView:stage===5})
    })).catch(()=>{});
  }catch{}
}
