'use strict';
const $=id=>document.getElementById(id), canvas=$('field'),ctx=canvas.getContext('2d');
const labels=['活动','点','线','闭合','形象','视角'];
let W=0,H=0,dpr=1,stage=0,path=[],ink=[],stroke=[],trail=[],down=false,activeId=null,split=.5,player={x:.5,y:.4,a:-Math.PI/2},pointer={x:.5,y:.4},travel=0,lastTime=0,held=new Set(),noticeUntil=0;
const MARK_HOLD=3000, MARK_LIFE=12000, DISCOVERY_DISTANCE=.12;
let camera={x:0,y:0,zoom:1};
const stamped=p=>({...p,t:performance.now()});
const opacity=(p,t)=>Math.max(0,Math.min(1,(MARK_LIFE-(t-p.t))/(MARK_LIFE-MARK_HOLD)));
let drawBox=()=>({x:W*.13,y:Math.max(135,H*.20),w:W*.74,h:Math.max(150,H*.38)});
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const measure=p=>p.reduce((s,v,i)=>i?s+dist(v,p[i-1]):0,0);
const area=p=>Math.abs(p.reduce((s,v,i)=>{let n=p[(i+1)%p.length];return s+v.x*n.y-n.x*v.y},0)/2);
function inside(p,poly=path){let c=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){let a=poly[i],b=poly[j];if(((a.y>p.y)!=(b.y>p.y))&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)c=!c}return c}
function center(){let minX=Math.min(...path.map(p=>p.x)),maxX=Math.max(...path.map(p=>p.x)),minY=Math.min(...path.map(p=>p.y)),maxY=Math.max(...path.map(p=>p.y));let best={x:path[0].x,y:path[0].y},score=-1;for(let x=minX+.01;x<maxX;x+=.012)for(let y=minY+.01;y<maxY;y+=.012){let p={x,y};if(inside(p)){let d=Math.min(...path.map((a,i)=>segDistance(p,a,path[(i+1)%path.length])));if(d>score){score=d;best=p}}}return best}
function segDistance(p,a,b){let dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy)}
function say(t){$('notice').textContent=t;noticeUntil=performance.now()+4400}
function setStage(s){stage=s;$('phase').textContent=`0${s+1} · ${labels[s]}`;$('primary').hidden=true;$('undo').hidden=true;const texts=[['还没有一个形状替你作答','先动起来。','移动鼠标，或用手指划过空白。'],['一次停留，留下了一处','一个点。','从这里继续探索。拖动到画面边缘，看看空白是否有尽头。'],['你已经走到画面之外','这里没有现成的边缘。','现在试着亲手画出一个界限；回到起点，把它闭合。线条会随时间消散。'],['边界留下了一个有限的形态','这就是你。','更准确地说，这是你第一次给自己留下的轮廓。'],['现在，让自己成为可见的形象','在里面，画出自己。','一个人形，或任何代表你的记号。可以分几笔画。'],['','你在其中，也在看它。','左边从你的位置看；右边看见处在边界内的你。']][s];['eyebrow','title','hint'].forEach((id,i)=>$(id).textContent=texts[i]);if(s===3){button('进入这个轮廓',()=>setStage(4));$('undo').hidden=false}if(s===4){$('undo').hidden=false}if(s===5){document.body.classList.add('split');$('views').hidden=false;$('seam').hidden=false;$('movement').hidden=false;$('reflection').hidden=false;$('help').hidden=true;button('回看刚才发生了什么',()=> $('info').showModal());player={...center(),a:-Math.PI/2};say('试着向前走。也可以拖动两个视角之间的界限。')}}
function button(t,fn){$('primary').textContent=t;$('primary').hidden=false;$('primary').onclick=fn}
function resize(){W=canvas.clientWidth;H=canvas.clientHeight;dpr=Math.min(devicePixelRatio||1,2);canvas.width=W*dpr;canvas.height=H*dpr;ctx.setTransform(dpr,0,0,dpr,0,0)}
function pos(e){const r=canvas.getBoundingClientRect();let b=drawBox();return{x:((e.clientX-r.left)-b.x)/(b.w*camera.zoom)+camera.x,y:((e.clientY-r.top)-b.y)/(b.h*camera.zoom)+camera.y}}
function project(p){let b=drawBox();return{x:b.x+(p.x-camera.x)*b.w*camera.zoom,y:b.y+(p.y-camera.y)*b.h*camera.zoom}}
function clean(p){return{x:p.x,y:p.y}}
function expireMarks(t){
 if(stage<1||stage>2)return;
 while(path.length&&t-path[0].t>=MARK_LIFE)path.shift();
 if(!path.length&&stage===2){path=[stamped(pointer)];stroke=[];say('刚才的界限已消散。从这里重新画一条界限。')}
 else if(!path.length&&stage===1)stroke=[];
 if(stage===2){if(path.length>4&&!down)button('连接起点，闭合轮廓',closePath);else $('primary').hidden=true}
}
function start(p){
 expireMarks(performance.now());pointer=clean(p);
 if(stage===0){path=[stamped(pointer)];setStage(1)}
 else if(stage===1||stage===2){if(!path.length)path.push(stamped(pointer));else if(dist(path[path.length-1],pointer)>.004)path.push(stamped(pointer))}
 else if(stage===4){if(!inside(pointer)){say('把形象画在你刚刚围出的区域里。');return}stroke=[pointer]}
 down=true;
}
function move(p){
 p=clean(p);travel+=dist(pointer,p);pointer=p;trail.push({...p,t:performance.now()});
 if(stage===0&&travel>.7)$('hint').textContent='痕迹正在消散。试着点下一处，再继续向外画。';
 if(!down)return;
 if(stage===0){path=[stamped(p)];setStage(1)}
 else if(stage===1||stage===2){if(!path.length)path.push(stamped(p));else if(dist(path[path.length-1],p)>.004)path.push(stamped(p))}
 else if(stage===4&&inside(p)&&stroke.length){if(dist(stroke[stroke.length-1],p)>.004)stroke.push(p)}
}
function panAtEdge(dt){
 if(!down||stage>2||$('info').open||document.hidden)return;
 const p=project(pointer), b=drawBox(), margin=Math.min(90,W*.14,H*.14);
 const speed=(v,size)=>v<margin?-Math.min(1,(margin-v)/margin):v>size-margin?Math.min(1,(v-size+margin)/margin):0;
 const dx=speed(p.x,W)*360*dt/(b.w*camera.zoom),dy=speed(p.y,H)*360*dt/(b.h*camera.zoom);
 if(dx||dy){camera.x+=dx;camera.y+=dy;move({x:pointer.x+dx,y:pointer.y+dy});if(stage===1&&Math.hypot(camera.x,camera.y)>=DISCOVERY_DISTANCE){path=[stamped(pointer)];stroke=[];setStage(2)}}
}
function finish(){
 if(!down)return;down=false;expireMarks(performance.now());
 if(stage===2){$('undo').hidden=false;if(path.length>5&&measure(path)>.6&&dist(path[0],path[path.length-1])<.09)closePath();else if(path.length>4)button('连接起点，闭合轮廓',closePath)}
 else if(stage===4){if(stroke.length>1)ink.push(stroke);stroke=[];if(ink.length)button('这就是我的形象',()=>setStage(5))}
 else stroke=[];
}
function closePath(){
 expireMarks(performance.now());
 if(stage!==2||path.length<4||area(path)<.035){say('轮廓已经消散，或还太小。继续画，围出一个区域。');return}
 // Once a limit is formed, fit it into view and keep it for the following stage.
 let minX=Math.min(...path.map(p=>p.x)),maxX=Math.max(...path.map(p=>p.x)),minY=Math.min(...path.map(p=>p.y)),maxY=Math.max(...path.map(p=>p.y));
 let size=Math.max(maxX-minX,maxY-minY);
 path=path.map(p=>({...p,x:.5+(p.x-(minX+maxX)/2)*.85/size,y:.5+(p.y-(minY+maxY)/2)*.85/size}));
 camera={x:0,y:0,zoom:1};trail=[];setStage(3);stroke=[];
}
canvas.addEventListener('pointerdown',e=>{if(activeId!==null)return;activeId=e.pointerId;canvas.setPointerCapture(e.pointerId);canvas.focus({preventScroll:true});if(stage!==5)start(pos(e));else pointer={x:e.clientX,y:e.clientY}});
canvas.addEventListener('pointermove',e=>{if(activeId!==null&&activeId!==e.pointerId)return;if(stage!==5)move(pos(e));else if(activeId!==null){player.a+=(e.clientX-pointer.x)*.007;let dy=e.clientY-pointer.y;if(Math.abs(dy)>1)walk(-dy*.0008);pointer={x:e.clientX,y:e.clientY}}});
canvas.addEventListener('pointerup',e=>{if(activeId!==e.pointerId)return;finish();activeId=null});canvas.addEventListener('pointercancel',()=>{down=false;stroke=[];activeId=null});
$('undo').onclick=()=>{if(stage===4){ink=[];stroke=[];$('primary').hidden=true}else{path=[];stroke=[];trail=[];camera={x:0,y:0,zoom:1};setStage(0)}};
function reset(){camera={x:0,y:0,zoom:1};path=[];stroke=[];ink=[];trail=[];down=false;activeId=null;held.clear();travel=0;pointer={x:.5,y:.4};split=.5;document.body.classList.remove('split');['views','seam','movement','reflection'].forEach(id=>$(id).hidden=true);$('seam').style.left='50%';$('seam').setAttribute('aria-valuenow','50');$('views').style.gridTemplateColumns='1fr 1fr';$('help').hidden=false;$('notice').textContent='';setStage(0)}
$('restart').onclick=reset;$('menu').onclick=()=> $('info').showModal();$('close').onclick=()=> $('info').close();$('info').addEventListener('click',e=>{if(e.target===$('info')){let r=$('info').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('info').close()}});
function setSplit(x){split=Math.max(.25,Math.min(.75,x));$('seam').style.left=split*100+'%';$('seam').setAttribute('aria-valuenow',Math.round(split*100));$('views').style.gridTemplateColumns=`${split}fr ${1-split}fr`}
let seamHeld=false;$('seam').addEventListener('pointerdown',e=>{seamHeld=true;$('seam').setPointerCapture(e.pointerId)});$('seam').addEventListener('pointermove',e=>{if(seamHeld)setSplit(e.clientX/W)});['pointerup','pointercancel'].forEach(type=>$('seam').addEventListener(type,()=>seamHeld=false));$('seam').addEventListener('keydown',e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();e.stopPropagation();setSplit(split+(e.key==='ArrowLeft'?-.025:.025))}});
function walk(amount){let p={x:player.x+Math.cos(player.a)*amount,y:player.y+Math.sin(player.a)*amount};if(inside(p)&&Math.min(...path.map((a,i)=>segDistance(p,a,path[(i+1)%path.length])))>.012){player.x=p.x;player.y=p.y}else if(Math.abs(amount)>.00001&&performance.now()>noticeUntil)say('活动没有消失，却在这里遇到了限制。')}
const keys={ArrowUp:'forward',w:'forward',ArrowDown:'back',s:'back',ArrowLeft:'left',a:'left',ArrowRight:'right',d:'right'};
window.addEventListener('keydown',e=>{if($('info').open||e.target.tagName==='BUTTON'||e.target===$('seam'))return;if(stage===5&&keys[e.key]){e.preventDefault();held.add(keys[e.key]);return}if(stage<5&&['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' ','Enter'].includes(e.key)){e.preventDefault();if(e.key===' '){if(stage===3)setStage(4);else if(down)finish();else start(pointer)}else if(e.key==='Enter'){finish();if(stage===2)closePath();else if(stage===3)setStage(4);else if(stage===4&&ink.length)setStage(5)}else{let p={...pointer};p.x+=(e.key==='ArrowRight'?.025:0)-(e.key==='ArrowLeft'?.025:0);p.y+=(e.key==='ArrowDown'?.025:0)-(e.key==='ArrowUp'?.025:0);move(p)}}});window.addEventListener('keyup',e=>held.delete(keys[e.key]));window.addEventListener('blur',()=>{held.clear();down=false;activeId=null});document.addEventListener('visibilitychange',()=>{held.clear();down=false;activeId=null;lastTime=0});
document.querySelectorAll('[data-move]').forEach(b=>{b.addEventListener('pointerdown',e=>{e.preventDefault();held.add(b.dataset.move);b.setPointerCapture(e.pointerId)});['pointerup','pointercancel','lostpointercapture'].forEach(t=>b.addEventListener(t,()=>held.delete(b.dataset.move)));b.addEventListener('keydown',e=>{if(e.key===' '||e.key==='Enter')held.add(b.dataset.move)});b.addEventListener('keyup',()=>held.delete(b.dataset.move))});
function line(points,projector=project,closed=false,fill=false){if(!points.length)return;ctx.beginPath();points.forEach((p,i)=>{let q=projector(p);i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y)});if(closed)ctx.closePath();if(fill)ctx.fill();ctx.stroke()}
function dot(p,r=4){ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);ctx.fill()}
function ray(angle){let r={x:Math.cos(angle),y:Math.sin(angle)},nearest=5;for(let i=0;i<path.length;i++){let a=path[i],b=path[(i+1)%path.length],s={x:b.x-a.x,y:b.y-a.y},q={x:a.x-player.x,y:a.y-player.y},cross=r.x*s.y-r.y*s.x;if(Math.abs(cross)<1e-8)continue;let t=(q.x*s.y-q.y*s.x)/cross,u=(q.x*r.y-q.y*r.x)/cross;if(t>0&&u>=0&&u<=1)nearest=Math.min(nearest,t)}return nearest}
function renderViews(){let edge=W*split,top=145,bottom=H-(W<600?290:245),height=Math.max(100,bottom-top),horizon=top+height*.5;ctx.save();ctx.beginPath();ctx.rect(16,top,Math.max(1,edge-32),height);ctx.clip();ctx.fillStyle='#fafcfc';ctx.fillRect(0,horizon,edge,height);for(let x=16;x<edge-16;x+=3){let angle=((x-16)/(edge-32)-.5)*1.2,d=ray(player.a+angle)*Math.cos(angle),wall=Math.min(height*.9,height*.12/Math.max(.02,d)),shade=Math.round(251-Math.min(1,1/(d*3+1))*18);ctx.fillStyle=`rgb(${shade-3},${shade},${shade+1})`;ctx.fillRect(x,horizon-wall/2,3,wall);ctx.fillStyle='#c1d1d3';ctx.fillRect(x,horizon+wall/2,3,1)}ctx.restore();let xs=path.map(p=>p.x),ys=path.map(p=>p.y),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys),scale=Math.min((W-edge-48)/(maxX-minX),(height-30)/(maxY-minY)),mx=(minX+maxX)/2,my=(minY+maxY)/2;let map=p=>({x:edge+(W-edge)/2+(p.x-mx)*scale,y:top+height/2+(p.y-my)*scale});ctx.strokeStyle='#839fa4';ctx.fillStyle='#f6f9f9';ctx.lineWidth=1.6;line(path,map,true,true);let p=map(player);ctx.fillStyle='#2d6771';dot(p,3);ctx.strokeStyle='#8bacb2';ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x+Math.cos(player.a)*28,p.y+Math.sin(player.a)*28);ctx.stroke();const all=ink.flat(),ix=(Math.min(...all.map(p=>p.x))+Math.max(...all.map(p=>p.x)))/2,iy=(Math.min(...all.map(p=>p.y))+Math.max(...all.map(p=>p.y)))/2,extent=Math.max(...all.map(p=>Math.max(Math.abs(p.x-ix),Math.abs(p.y-iy))),.05),factor=Math.min(36,scale*.12)/(extent*2);ctx.strokeStyle='#315f67';ctx.lineWidth=1.7;ink.forEach(s=>line(s,v=>({x:p.x+(v.x-ix)*factor,y:p.y+(v.y-iy)*factor})));}
function frame(t){let dt=lastTime?Math.min((t-lastTime)/1000,.04):0;lastTime=t;expireMarks(t);panAtEdge(dt);if(stage===5&&!$('info').open){if(held.has('left'))player.a-=dt*1.8;if(held.has('right'))player.a+=dt*1.8;if(held.has('forward'))walk(dt*.17);if(held.has('back'))walk(-dt*.13)}ctx.clearRect(0,0,W,H);ctx.lineCap='round';ctx.lineJoin='round';if(stage===5)renderViews();else{trail=trail.filter(p=>t-p.t<1200);trail.forEach(p=>{ctx.fillStyle=`rgba(110,150,160,${.2*(1-(t-p.t)/1200)})`;dot(project(p),2)});ctx.strokeStyle='#3b717c';ctx.lineWidth=2;ctx.fillStyle='#f1f7f8';if(stage>=3)line(path,project,true,true);else{for(let i=1;i<path.length;i++){ctx.globalAlpha=opacity(path[i-1],t);line([path[i-1],path[i]])}ctx.globalAlpha=1;}if(stage>=1&&stage<3&&path.length){ctx.globalAlpha=opacity(path[0],t);ctx.fillStyle='#315e68';dot(project(path[0]),4);ctx.strokeStyle='#adc4c9';ctx.lineWidth=1;ctx.beginPath();let p=project(path[0]);ctx.arc(p.x,p.y,14,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1}ctx.strokeStyle='#3b717c';ctx.lineWidth=2;line(stroke);ctx.strokeStyle='#293f44';ink.forEach(s=>line(s));if(down){ctx.fillStyle='#315e68';dot(project(pointer),2)}}if(noticeUntil&&t>noticeUntil){$('notice').textContent='';noticeUntil=0}requestAnimationFrame(frame)}
window.addEventListener('resize',resize);resize();setStage(0);requestAnimationFrame(frame);
if(document.modelContext?.registerTool){try{Promise.resolve(document.modelContext.registerTool({name:'read_game_stage',description:'Read the current stage of the first-limitation game without changing it.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:()=>({stage:labels[stage],boundaryClosed:stage>=3,figureDrawn:ink.length>0,splitView:stage===5})})).catch(()=>{})}catch{}}
