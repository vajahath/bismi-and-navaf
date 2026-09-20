// World coordinates and fixed-step physics are shared by the throw, flight and catch.
// Images, obstacle artwork and collision masks are cached; the frame loop only draws.
const $ = selector => document.querySelector(selector);
const canvas = $('#world');
const ctx = canvas.getContext('2d', { alpha: false });
const jungle = new Image(); jungle.src = 'assets/jungle.png';
const couple = new Image(); couple.src = 'assets/couple-sprites.png';
const backdrop = document.createElement('canvas');
const bg = backdrop.getContext('2d', { alpha: false });
let forestTileWidth = 1;

function cacheForest() {
  // The central clearing has canopy and ground, without the enclosing side walls.
  // Mirrored neighbours share identical edge pixels, so the forest loops cleanly.
  const cropWidth = jungle.naturalWidth * .44;
  forestTileWidth = cropWidth / jungle.naturalHeight * H;
  backdrop.width = Math.round(cropWidth) * 2;
  backdrop.height = jungle.naturalHeight;
  const half = backdrop.width / 2;
  bg.drawImage(jungle, (jungle.naturalWidth-cropWidth)/2, 0, cropWidth, jungle.naturalHeight, 0, 0, half, backdrop.height);
  bg.save();bg.translate(backdrop.width,0);bg.scale(-1,1);
  bg.drawImage(backdrop,0,0,half,backdrop.height,0,0,half,backdrop.height);bg.restore();
}
function drawForestGround() {
  if (!jungle.naturalWidth) {ctx.fillStyle='#799b48';ctx.fillRect(0,0,W,H);return;}
  const period=forestTileWidth*2;
  const offset=((camera*.55+(forestTileWidth-W)/2)%period+period)%period;
  for(let x=-offset;x<W;x+=period)ctx.drawImage(backdrop,x,0,period,H);
}
const STEP = 1 / 120, H = 720, SPEED = 123, GRAVITY = 410, LIFT = -215;
const RELEASE = 1.05, END = 3700, CHARACTER_HEIGHT = 310, CHARACTER_BOTTOM = 575;
const ROSE_WIDTH = 48, ROSE_HEIGHT = 62, OBSTACLE_WIDTH = 144;
/** @typedef {'menu'|'throw'|'flight'|'arrival'|'crash'|'gameover'|'paused'|'finish'} Mode */
/** @type {Mode} */ let mode = 'menu';
/** @type {Mode} */ let previousMode = 'flight';
let W = 400, selected = 'groom', elapsed = 0, age = 0, camera = 0;
let rose = { x: 0, y: 360, vy: 0 }, launchX = 0, launchRoseX = 0, arrivalStart = null;
let gates = [], particles = [], cleared = 0, last = 0, accumulator = 0, raf = 0;
let forestTime=0;
let photoHintShown=false;
let soundEnabled = true, audio = null, hintUntil = 0, progressPercent = -1, queuedTap = false;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v, low, high) => Math.max(low, Math.min(high, v));
const ease = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const anchorX = () => Math.max(87, Math.min(W * .29, 310));
const otherPerson = () => selected === 'groom' ? 'bride' : 'groom';

function resize() {
  const scale = canvas.clientHeight / H, dpr = Math.min(devicePixelRatio || 1, 2);
  W = canvas.clientWidth / scale;
  canvas.width = Math.round(canvas.clientWidth * dpr);
  canvas.height = Math.round(canvas.clientHeight * dpr);
  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
  if (mode === 'flight') camera = rose.x - anchorX();
  render();
}
function setMode(next) {
  mode = next;ForestAudio.sync(soundEnabled&&!document.hidden&&next!=='paused');
  $('#menu').hidden = next !== 'menu';
  $('#hud').hidden = !['throw', 'flight', 'arrival', 'crash', 'paused'].includes(next);
  $('#pause-screen').hidden = next !== 'paused';
  $('#finish').hidden = next !== 'finish';
  $('#gameover').hidden = next !== 'gameover';
  $('#footer').hidden = next !== 'menu';
  document.body.classList.toggle('playing', next !== 'menu');
}
function selectCharacter(value) {
  if (!['groom', 'bride'].includes(value)) throw new Error('Choose bride or groom.');
  selected = value;
  document.querySelectorAll('[data-character]').forEach(button => {
    const active = button.dataset.character === selected;
    button.classList.toggle('selected', active); button.setAttribute('aria-pressed', String(active));
  });
}
function tone(note = 440, duration = .12, volume = .035) {
  if (!soundEnabled || !audio) return;
  const oscillator = audio.createOscillator(), gain = audio.createGain();
  oscillator.type = 'sine'; oscillator.frequency.value = note;
  gain.gain.setValueAtTime(0, audio.currentTime);
  gain.gain.linearRampToValueAtTime(volume, audio.currentTime + .015);
  gain.gain.exponentialRampToValueAtTime(.001, audio.currentTime + duration);
  oscillator.connect(gain); gain.connect(audio.destination); oscillator.start(); oscillator.stop(audio.currentTime + duration);
}
function showHint(message, seconds = 3) { $('#hint').textContent = message; hintUntil = age + seconds; }

// Arm pivots and hand points live in the same coordinates as the illustration.
// The rose uses this exact hand transform until release, then retains that position.
const arms = {
  groom: { pivot: [486, 270], hand: [567, 575], sleeve: '#315a3b' },
  bride: { pivot: [439, 352], hand: [531, 570], sleeve: '#b64f36' }
};
function armAngle(time) {
  if (time < .45) return .32 * ease(time / .45);
  if (time < RELEASE) return .32 - 1.67 * ease((time - .45) / (RELEASE - .45));
  return -1.35 * (1 - ease((time - RELEASE) / .65));
}
function handOffset(kind, angle) {
  const arm = arms[kind], dx = arm.hand[0] - arm.pivot[0], dy = arm.hand[1] - arm.pivot[1];
  const s = CHARACTER_HEIGHT / 1024;
  return { x: (arm.pivot[0] + dx * Math.cos(angle) - dy * Math.sin(angle) - 384) * s,
    y: CHARACTER_BOTTOM + (arm.pivot[1] + dx * Math.sin(angle) + dy * Math.cos(angle) - 1024) * s - 27 };
}
function heldRose(time) { const hand = handOffset(selected, armAngle(time)); return { x: launchX + hand.x, y: hand.y }; }
function character(kind, x, bottom, height, angle = 0, flip = false, rigged = false) {
  if (!couple.complete || !couple.naturalWidth) return;
  ctx.save(); ctx.translate(x, bottom); if (flip) ctx.scale(-1, 1);
  ctx.scale(height / 1024, height / 1024); ctx.translate(-384, -1024);
  const sourceX = kind === 'groom' ? 0 : 768, arm = arms[kind];
  const draw = () => ctx.drawImage(couple, sourceX, 0, 768, 1024, 0, 0, 768, 1024);
  const cut = kind === 'groom' ? [[465,235],[546,250],[610,510],[622,636],[525,636],[504,555],[476,432],[454,310]] : [[426,322],[490,338],[541,435],[570,550],[562,620],[508,623],[480,555],[443,462],[415,395]];
  const cutPath = () => { ctx.moveTo(...cut[0]); for (const point of cut.slice(1)) ctx.lineTo(...point); ctx.closePath(); };
  if (!rigged) draw();
  else {
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, 768, 1024); cutPath(); ctx.clip('evenodd'); draw(); ctx.restore();
    // Overlapping, rounded shoulder and cuff keep the silhouette connected.
    ctx.fillStyle=arm.sleeve;ctx.beginPath();ctx.ellipse(arm.pivot[0]-8,arm.pivot[1]+5,39,43,0,0,Math.PI*2);ctx.fill();
    ctx.save();ctx.translate(...arm.pivot);ctx.rotate(angle);
    const dx=arm.hand[0]-arm.pivot[0],dy=arm.hand[1]-arm.pivot[1],length=Math.hypot(dx,dy);
    ctx.rotate(-Math.atan2(dx,dy));
    ctx.strokeStyle='#253026';ctx.lineWidth=3.5;ctx.lineJoin='round';ctx.lineCap='round';
    // A tapered wrist, thumb and relaxed fingers, rather than a detached oval.
    ctx.fillStyle='#ffc17f';ctx.beginPath();
    ctx.moveTo(-13,length-40);ctx.bezierCurveTo(-15,length-27,-19,length-15,-17,length+3);
    ctx.bezierCurveTo(-17,length+15,-12,length+29,-7,length+30);
    ctx.quadraticCurveTo(-3,length+31,-3,length+24);
    ctx.quadraticCurveTo(2,length+34,7,length+27);
    ctx.quadraticCurveTo(13,length+31,15,length+22);
    ctx.bezierCurveTo(20,length+18,17,length+2,16,length-7);
    ctx.bezierCurveTo(24,length+6,29,length+1,25,length-9);
    ctx.quadraticCurveTo(22,length-23,13,length-28);ctx.lineTo(13,length-40);ctx.closePath();ctx.fill();ctx.stroke();
    ctx.lineWidth=2;for(const x of [-5,3,10]){ctx.beginPath();ctx.moveTo(x,length+3);ctx.quadraticCurveTo(x+2,length+14,x+2,length+23);ctx.stroke();}
    ctx.fillStyle=arm.sleeve;ctx.lineWidth=4;ctx.beginPath();
    ctx.moveTo(-32,-13);ctx.bezierCurveTo(-45,13,-31,length*.37,-25,length*.58);
    ctx.quadraticCurveTo(-23,length*.78,-19,length-22);ctx.quadraticCurveTo(0,length-16,20,length-23);
    ctx.bezierCurveTo(21,length*.70,29,length*.48,29,length*.31);
    ctx.bezierCurveTo(33,15,40,-16,19,-28);ctx.quadraticCurveTo(-9,-44,-32,-13);ctx.closePath();ctx.fill();ctx.stroke();
    ctx.strokeStyle='rgba(15,32,23,.24)';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(19,35);ctx.quadraticCurveTo(10,length*.42,16,length*.59);ctx.stroke();
    ctx.beginPath();ctx.moveTo(-18,length-34);ctx.quadraticCurveTo(0,length-29,19,length-34);ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

function makeRose() {
  const art = document.createElement('canvas'); art.width = ROSE_WIDTH; art.height = ROSE_HEIGHT;
  const c = art.getContext('2d'); c.translate(24, 22); c.lineCap = 'round';
  c.strokeStyle = '#19382a'; c.lineWidth = 5; c.beginPath(); c.moveTo(0, 8); c.quadraticCurveTo(-4, 23, 4, 35); c.stroke();
  c.fillStyle = '#296b42'; c.lineWidth = 1.5;
  for (const side of [-1, 1]) { c.beginPath(); c.moveTo(0, 22); c.quadraticCurveTo(side*20, 23, side*15, 11); c.quadraticCurveTo(side*4, 11, 0, 22); c.fill(); c.stroke(); }
  c.strokeStyle = '#64162c'; c.lineWidth = 2;
  const petals = [[-9,-1,10,12,-.5,'#ed4160'],[9,-2,10,13,.5,'#d72349'],[-4,-9,12,10,-.2,'#f05c72'],[5,-10,11,10,.4,'#cb1b43'],[0,4,13,10,0,'#e63255']];
  for (const [x,y,rx,ry,r,color] of petals) { c.fillStyle=color;c.beginPath();c.ellipse(x,y,rx,ry,r,0,Math.PI*2);c.fill();c.stroke(); }
  c.fillStyle='#ab173b';c.beginPath();c.ellipse(0,-4,7,8,.4,0,Math.PI*2);c.fill();
  c.strokeStyle='#ff9cac';c.lineWidth=2;c.beginPath();c.moveTo(-5,-8);c.bezierCurveTo(7,-12,9,0,-1,1);c.bezierCurveTo(-7,1,-3,-7,2,-5);c.stroke();
  const pixels = art.getContext('2d').getImageData(0,0,ROSE_WIDTH,ROSE_HEIGHT).data, solid=[];
  for(let y=0;y<ROSE_HEIGHT;y++)for(let x=0;x<ROSE_WIDTH;x++)if(pixels[(y*ROSE_WIDTH+x)*4+3]>100)solid.push([x,y]);
  return {art,solid};
}
const roseSprite = makeRose();
function drawRose(x, y) { ctx.drawImage(roseSprite.art, x-24, y-22); }

// Distinct forest silhouettes, cached with alpha masks so collisions match the artwork.
function leaf(c,x,y,length,angle,color) {
  c.save();c.translate(x,y);c.rotate(angle);c.fillStyle=color;c.strokeStyle='#193d2b';c.lineWidth=2;
  c.beginPath();c.moveTo(0,0);c.bezierCurveTo(-length*.5,-length*.3,-length*.4,-length*.75,0,-length);
  c.bezierCurveTo(length*.4,-length*.7,length*.5,-length*.3,0,0);c.fill();c.stroke();
  c.beginPath();c.moveTo(0,0);c.lineTo(0,-length*.85);c.stroke();c.restore();
}
function vines(c, edge) {
  for (const [x,offset] of [[51,17],[83,0]]) {
    c.strokeStyle='#26482c';c.lineWidth=7;c.beginPath();c.moveTo(x,0);c.bezierCurveTo(x-13,edge*.4,x+12,edge*.65,x,edge-offset);c.stroke();
    for(let y=15;y<edge-offset-13;y+=29){leaf(c,x,y,33,-.9,'#417445');leaf(c,x,y+9,31,.9,'#728f43');}
  }
}
function bamboo(c, edge) {
  for(const [x,tip] of [[45,edge+40],[70,edge],[94,edge+55]]) {
    c.fillStyle=x===70?'#87a74c':'#568647';c.strokeStyle='#244730';c.lineWidth=3;
    c.beginPath();c.roundRect(x-10,tip,20,H-tip+10,8);c.fill();c.stroke();
    for(let y=tip+25;y<H;y+=45){c.strokeStyle='#d0cc73';c.lineWidth=3;c.beginPath();c.moveTo(x-9,y);c.lineTo(x+9,y);c.stroke();}
    leaf(c,x,tip+28,38,-.9,'#417a43');leaf(c,x,tip+38,38,.9,'#62934b');
  }
}
function rocks(c, edge) {
  for(let y=H+12,i=0;y>edge+24;y-=42,i++) {
    const x=72+(i%2?12:-8),top=Math.max(edge,y-70);
    c.fillStyle=i%2?'#7b8271':'#95917a';c.strokeStyle='#39493a';c.lineWidth=3;
    c.beginPath();c.moveTo(x-52,y);c.lineTo(x-43,top+17);c.lineTo(x-17,top);c.lineTo(x+24,top+3);c.lineTo(x+49,top+30);c.lineTo(x+54,y);c.closePath();c.fill();c.stroke();
    c.strokeStyle='#b9b89a';c.lineWidth=2;c.beginPath();c.moveTo(x-29,top+20);c.lineTo(x-7,top+12);c.lineTo(x+16,top+17);c.stroke();
    c.fillStyle='#5b7b41';c.beginPath();c.ellipse(x-8,top+7,26,8,0,0,7);c.fill();
  }
}
function trunk(c, edge) {
  c.fillStyle='#806043';c.strokeStyle='#3d3928';c.lineWidth=3;
  c.beginPath();c.moveTo(36,H);c.lineTo(44,edge+14);c.lineTo(67,edge);c.lineTo(88,edge+12);c.lineTo(99,H);c.closePath();c.fill();c.stroke();
  c.fillStyle='#c6a66a';c.beginPath();c.ellipse(67,edge+13,23,11,.1,0,7);c.fill();c.stroke();
  for(let x=52;x<90;x+=13){c.beginPath();c.moveTo(x,edge+40);c.bezierCurveTo(x-8,edge+95,x+8,H-70,x,H);c.stroke();}
  for(let y=edge+55;y<H-10;y+=70){leaf(c,48,y,38,-1,'#547941');leaf(c,90,y+25,32,1,'#738b45');}
  c.fillStyle='#d37a49';for(let y=edge+65;y<H;y+=107){c.beginPath();c.ellipse(93,y,18,8,-.2,0,Math.PI*2);c.fill();c.stroke();}
}
function branch(c, edge) {
  c.fillStyle='#73553b';c.strokeStyle='#3d3928';c.lineWidth=3;
  c.beginPath();c.moveTo(41,0);c.lineTo(92,0);c.lineTo(85,edge-38);c.lineTo(104,edge-8);c.lineTo(88,edge);c.lineTo(61,edge-29);c.lineTo(47,edge-4);c.lineTo(34,edge-17);c.lineTo(53,edge-58);c.closePath();c.fill();c.stroke();
  for(let y=25;y<edge-15;y+=39){leaf(c,52,y,34,-1.2,'#3a7147');leaf(c,83,y+10,35,1.15,'#728a42');}
}
const COURSE = [
  {x:500,side:'bottom',edge:410,kind:'bamboo'},
  {x:900,side:'top',edge:300,kind:'vines'},
  {x:1370,side:'top',edge:325,photo:6},
  {x:1780,side:'bottom',edge:390,kind:'rocks'},
  {x:2200,side:'bottom',edge:420,kind:'trunk'},
  {x:2580,side:'top',edge:335,photo:11},
  {x:3000,side:'bottom',edge:405,kind:'bamboo'},
  {x:3370,side:'top',edge:295,kind:'branch'}
];
function makeObstacle(definition) {
  const art=document.createElement('canvas');art.width=OBSTACLE_WIDTH;art.height=H;
  const c=art.getContext('2d');
  if(definition.photo)MemoryGallery.hanging(c,definition.photo,definition.edge);
  else ({bamboo,rocks,trunk,vines,branch})[definition.kind](c,definition.edge);
  const pixels=c.getImageData(0,0,OBSTACLE_WIDTH,H).data,mask=new Uint8Array(OBSTACLE_WIDTH*H);
  for(let i=0;i<mask.length;i++)mask[i]=pixels[i*4+3]>100?1:0;
  return {...definition,center:definition.side==='top'?465:275,art,mask,passed:false};
}
function touches(gate) {
  const left=Math.round(rose.x-24-(launchRoseX+gate.x-OBSTACLE_WIDTH/2));
  if(left>=OBSTACLE_WIDTH||left+ROSE_WIDTH<=0)return false;
  const top=Math.round(rose.y-22);
  for(const [px,py] of roseSprite.solid){const x=left+px,y=top+py;if(x>=0&&x<OBSTACLE_WIDTH&&y>=0&&y<H&&gate.mask[y*OBSTACLE_WIDTH+x])return true;}
  return false;
}
function burst(x,y,count,color) {
  for(let i=0;i<count&&particles.length<90;i++)particles.push({x,y,vx:(Math.random()-.5)*100,vy:(Math.random()-.6)*100,life:.7+Math.random()*.4,color});
}
function unlockAudio() {
  if (!soundEnabled) return;
  const Audio = window.AudioContext || window.webkitAudioContext;
  if (!Audio) return;
  try { audio ??= new Audio(); ForestAudio.attach(audio);ForestAudio.sync(soundEnabled&&!document.hidden&&mode!=='paused');if(audio.state==='suspended') audio.resume().catch(()=>{}); } catch {}
}
function updateSoundButton() {
  $('#sound').innerHTML=soundEnabled?'♫':'♫<span class="sound-off"> /</span>';
  const label=soundEnabled?'Turn sound off':'Turn sound on';
  $('#sound').setAttribute('aria-label',label);$('#sound').title=label;
}
async function start() {
  unlockAudio();
  if(!assetsReady)return;
  elapsed=0;age=0;camera=0;cleared=0;photoHintShown=false;gamePace=targetPace();queuedTap=false;particles=[];progressPercent=-1;
  const releaseHand=handOffset(selected,-1.35);
  launchX=Math.max(72,anchorX()-80);launchRoseX=launchX+releaseHand.x;
  const held=heldRose(0);rose={x:held.x,y:held.y,vy:0};
  gates=COURSE.map(makeObstacle);MemoryGallery.arrange(COURSE);
  $('#progress').style.width='0%';$('#progress-flower').style.left='0%';$('#gate-count').textContent=`0 / ${gates.length} passages`;
  $('#from-label').textContent=selected==='groom'?'HIM':'HER';$('#to-label').textContent=selected==='groom'?'HER':'HIM';
  setMode('throw');resize();showHint('Get ready. Tap to keep your rose in the air.',5);canvas.focus({preventScroll:true});wake();
}
function flap() {
  if(mode==='throw'){queuedTap=true;return;}
  if(mode!=='flight')return;
  rose.vy=LIFT;ForestAudio.flutter();burst(rose.x-camera,rose.y+22,3,'#ed8190');
}
function lose(reason) {
  if(mode!=='flight')return;
  setMode('crash');elapsed=0;$('#loss-copy').textContent=reason;
  $('#loss-progress').textContent=`${cleared} of ${gates.length} passages cleared`;
  burst(rose.x-camera,rose.y,22,'#ee6781');tone(190,.25,.035);
}
function pause(){if(['throw','flight','arrival'].includes(mode)){previousMode=mode;setMode('paused');$('#resume').focus();}}
function resume(){if(mode!=='paused')return;setMode(previousMode);last=0;accumulator=0;canvas.focus({preventScroll:true});wake();}
function home(){setMode('menu');particles=[];render();$('#start').focus();}
// Scale the complete simulation together: slower scenery must not require
// faster tapping. Resizing changes pace gradually rather than jolting the rose.
let gamePace=.55;
function targetPace(){return .55+.25*clamp((canvas.clientWidth-480)/720,0,1);}
function step(dt) {
  if(['menu','paused','gameover','finish'].includes(mode))return;
  if(mode==='flight'){gamePace+=(targetPace()-gamePace)*Math.min(1,dt*3);dt*=gamePace;}
  age+=dt;elapsed+=dt;
  if(mode==='throw') {
    const held=heldRose(Math.min(elapsed,RELEASE));rose.x=held.x;rose.y=held.y;
    if(elapsed>=RELEASE){setMode('flight');rose.vy=queuedTap?LIFT:-155;queuedTap=false;elapsed=0;showHint('Tap to lift · avoid every obstacle',5);}
  } else if(mode==='flight') {
    rose.x+=SPEED*dt;rose.vy=Math.min(320,rose.vy+GRAVITY*dt);rose.y+=rose.vy*dt;
    camera=rose.x-launchRoseX+(launchRoseX-anchorX())*ease(elapsed/.9);
    if(rose.y-20<=65||rose.y+36>=H-39){lose('Keep your rose away from the canopy and forest floor.');return;}
    for(const gate of gates) {
      if(touches(gate)){lose('Your rose touched an obstacle. A fresh flight awaits.');return;}
      if(!gate.passed&&rose.x-24>launchRoseX+gate.x+OBSTACLE_WIDTH/2){gate.passed=true;cleared++;$('#gate-count').textContent=`${cleared} / ${gates.length} passages`;ForestAudio.bird(true);if(cleared===2)showHint('Keep going. More memories are waiting.',3);if(cleared===6)showHint('Nearly there. Your person is waiting.',3);}
    }
    const distance=rose.x-launchRoseX,pct=Math.min(100,Math.floor(distance/END*100));
    if(pct!==progressPercent){progressPercent=pct;$('#progress').style.width=pct+'%';$('#progress-flower').style.left=pct+'%';}
    if(age>hintUntil)$('#hint').textContent='';
    if(!photoHintShown&&rose.x-launchRoseX>1050){photoHintShown=true;showHint('Thorny wooden frames are obstacles · fly below',4);}
    if(distance>=END){arrivalStart={x:rose.x,y:rose.y};setMode('arrival');elapsed=0;showHint('Right where it belongs.',5);}
  } else if(mode==='arrival') {
    const t=ease(elapsed/1.65);rose.x=arrivalStart.x+87*t;rose.y=arrivalStart.y+(402-arrivalStart.y)*t;
    if(elapsed>=2.15){setMode('finish');$('#finish-copy').textContent='Eight little challenges. One beautiful beginning.';[523,659,784].forEach((note,i)=>setTimeout(()=>tone(note,.5,.03),i*150));$('#again').focus();}
  } else if(mode==='crash'&&elapsed>=.45){setMode('gameover');$('#retry').focus();}
  for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=40*dt;p.life-=dt;if(p.life<=0)particles.splice(i,1);}
}
function render() {
  drawForestGround();
  Forest.back(ctx,camera,W,forestTime,reducedMotion);
  if(mode==='menu')return;
  ctx.fillStyle='#e4eabb18';ctx.fillRect(0,0,W,H);
  MemoryGallery.draw(ctx,camera,launchRoseX,W);
  const scene=mode==='paused'?previousMode:mode;
  // Branches and roots at the edge make the out-of-bounds region readable.
  ctx.fillStyle='#163e303d';ctx.fillRect(0,0,W,65);ctx.fillRect(0,H-39,W,39);
  for(let i=0;i<10;i++){const x=((i*179-camera*.12)%(W+80)+W+80)%(W+80)-40,y=160+(i*83)%410+(reducedMotion?0:Math.sin(age*.8+i)*10);ctx.globalAlpha=.3;ctx.fillStyle='#fff5ab';ctx.beginPath();ctx.arc(x,y,2,0,7);ctx.fill();}ctx.globalAlpha=1;
  for(const gate of gates){const x=launchRoseX+gate.x-camera-OBSTACLE_WIDTH/2;if(x>-OBSTACLE_WIDTH&&x<W)ctx.drawImage(gate.art,x,0);}
  if(launchX-camera>-180)character(selected,launchX-camera,CHARACTER_BOTTOM,CHARACTER_HEIGHT,armAngle(age),false,true);
  const receiverX=launchRoseX+END+130-camera;
  if(receiverX<W+170)character(otherPerson(),receiverX,CHARACTER_BOTTOM,CHARACTER_HEIGHT,0,true);
  if(scene==='finish'){character('groom',W/2-95,H*.87,350);character('bride',W/2+95,H*.87,350);}
  else drawRose(rose.x-camera,rose.y);
  Forest.front(ctx,camera,W,forestTime,reducedMotion);
  for(const p of particles){ctx.globalAlpha=Math.min(1,p.life);ctx.fillStyle=p.color;ctx.beginPath();ctx.ellipse(p.x,p.y,3,5,p.life*3,0,7);ctx.fill();}ctx.globalAlpha=1;
}
function frame(now) {
  raf=0;if(document.hidden){last=0;return;}
  const ambientDelta=last?Math.min((now-last)/1000,.05):0;forestTime+=ambientDelta;
  if(['menu','paused','gameover','finish'].includes(mode)){render();last=now;if(!reducedMotion&&mode!=='paused')raf=requestAnimationFrame(frame);return;}
  if(!last)last=now;accumulator+=Math.min((now-last)/1000,.05);last=now;
  while(accumulator>=STEP){step(STEP);accumulator-=STEP;}
  render();raf=requestAnimationFrame(frame);
}
function wake(){if(!raf){last=0;accumulator=0;raf=requestAnimationFrame(frame);}}

$('#sound').addEventListener('click',()=>{soundEnabled=!soundEnabled;unlockAudio();ForestAudio.sync(soundEnabled&&!document.hidden&&mode!=='paused');updateSoundButton();if(soundEnabled)ForestAudio.bird();});
document.addEventListener('pointerdown',unlockAudio,{capture:true});
document.addEventListener('keydown',unlockAudio,{capture:true});
updateSoundButton();
document.querySelectorAll('[data-character]').forEach(button=>button.addEventListener('click',()=>selectCharacter(button.dataset.character)));
for(const id of ['#start','#again','#retry'])$(id).addEventListener('click',start);
$('#pause').addEventListener('click',pause);$('#resume').addEventListener('click',resume);
document.querySelectorAll('.back').forEach(button=>button.addEventListener('click',home));
canvas.addEventListener('pointerdown',event=>{if(['throw','flight'].includes(mode)){event.preventDefault();flap();}});
addEventListener('keydown',event=>{if(event.code==='Escape'){mode==='paused'?resume():pause();return;}if(['Space','ArrowUp'].includes(event.code)&&['throw','flight'].includes(mode)){event.preventDefault();if(!event.repeat)flap();}});
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();ForestAudio.sync(soundEnabled&&!document.hidden&&mode!=='paused');if(!document.hidden)wake();});
jungle.onload=()=>{cacheForest();resize();};couple.onload=render;addEventListener('resize',resize);resize();wake();
if(document.modelContext?.registerTool){try{Promise.resolve(document.modelContext.registerTool({name:'start_flower_journey',description:'Select the bride or groom and start a new rose flight.',inputSchema:{type:'object',properties:{character:{type:'string',enum:['bride','groom']}},required:['character'],additionalProperties:false},annotations:{readOnlyHint:false},async execute(input){selectCharacter(input?.character);await start();return{character:selected,state:mode};}})).catch(()=>{});}catch{}}

let assetsReady=false, loadingAssets=false;
async function prepareGame(retry=false){
  if(loadingAssets)return;
  loadingAssets=true;
  $('#load-retry').hidden=true;
  $('#load-message').textContent='Gathering flowers and memories…';
  try {
    if(retry){jungle.src='assets/jungle.png?retry='+Date.now();couple.src='assets/couple-sprites.png?retry='+Date.now();}
    await Promise.all([jungle.decode(),couple.decode(),MemoryGallery.ready]);
    cacheForest();resize();assetsReady=true;
    $('#loading').hidden=true;$('#app').inert=false;$('#start').disabled=false;
  } catch {
    $('#load-message').textContent='The forest couldn’t load. Check your connection and try again.';
    $('#load-retry').hidden=false;
  } finally {loadingAssets=false;}
}
$('#load-retry').addEventListener('click',()=>prepareGame(true));
prepareGame();
