// Cached scenery: all decorative layers stay separate from collision artwork.
const Forest = (() => {
  const tree=document.createElement('canvas');tree.width=360;tree.height=720;
  const c=tree.getContext('2d');c.fillStyle='#244a38';
  c.beginPath();c.moveTo(145,720);c.bezierCurveTo(180,450,160,240,143,0);c.lineTo(184,0);c.bezierCurveTo(180,350,194,520,220,720);c.fill();
  c.lineCap='round';c.strokeStyle='#244a38';c.lineWidth=17;
  for(const [x,y,side] of [[170,180,-1],[180,300,1],[180,420,-1]]){c.beginPath();c.moveTo(x,y+90);c.quadraticCurveTo(x+side*55,y,x+side*145,y-80);c.stroke();}
  for(let i=0;i<18;i++){c.beginPath();c.ellipse(30+(i*79)%310,(i*67)%430,68,26,(i%3)-1,0,Math.PI*2);c.fill();}
  const fringe=document.createElement('canvas');fringe.width=260;fringe.height=75;
  const f=fringe.getContext('2d');f.fillStyle='#153e2f';f.strokeStyle='#0f3025';f.lineWidth=2;
  for(let i=0;i<12;i++){f.save();f.translate(i*25,80);f.rotate((i%3-1)*.35);f.beginPath();f.moveTo(0,0);f.bezierCurveTo(-28,-20,-23,-55,0,-72);f.bezierCurveTo(22,-48,22,-20,0,0);f.fill();f.stroke();f.restore();}
  const wrap=(value,period)=>((value%period)+period)%period;
  function back(ctx,camera,width,time,still){
    for(const layer of [{speed:.12,spacing:650,alpha:.10,scale:1},{speed:.29,spacing:920,alpha:.14,scale:.83}]){
      ctx.globalAlpha=layer.alpha;
      const offset=wrap(camera*layer.speed,layer.spacing);
      for(let x=-offset-360;x<width+360;x+=layer.spacing)ctx.drawImage(tree,x,720*(1-layer.scale),360*layer.scale,720*layer.scale);
    }
    ctx.globalAlpha=1;if(still)return;
    // Small distant birds, well behind the rose and obstacle silhouettes.
    for(let i=0;i<3;i++){
      const x=width+60-wrap(time*(18+i*3)+camera*.2+i*430,width+140),y=120+i*49+Math.sin(time*.8+i)*14;
      const wing=Math.sin(time*7+i)*6;ctx.strokeStyle='#40634cc0';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x-10,y+wing);ctx.quadraticCurveTo(x-5,y-6,x,y);ctx.quadraticCurveTo(x+5,y-6,x+10,y+wing);ctx.stroke();
    }
  }
  function front(ctx,camera,width,time,still){
    // Fast foreground stays at the margins; it never conceals the playable lane.
    ctx.globalAlpha=.83;const offset=wrap(camera*1.65,260);
    for(let x=-offset-260;x<width+260;x+=260){ctx.drawImage(fringe,x,686,260,75);ctx.save();ctx.translate(x+260,28);ctx.rotate(Math.PI);ctx.drawImage(fringe,0,0,260,75);ctx.restore();}
    ctx.globalAlpha=1;if(still)return;
    for(let i=0;i<6;i++){
      const x=width+40-wrap(camera*.8+time*(14+i)+i*211,width+80),y=135+(i*89)%480+Math.sin(time*.9+i)*22;
      ctx.save();ctx.translate(x,y);ctx.rotate(time*.4+i);ctx.fillStyle=i%2?'#b7a54b99':'#74934b99';ctx.beginPath();ctx.ellipse(0,0,3,8,.4,0,Math.PI*2);ctx.fill();ctx.restore();
    }
    for(let i=0;i<2;i++){
      const x=wrap(time*13+camera*.36+i*401,width+100)-50,y=215+i*265+Math.sin(time*.7+i)*25,wing=2+Math.abs(Math.sin(time*8))*4;
      ctx.fillStyle=i?'#c89860a6':'#d6c778a6';for(const side of [-1,1]){ctx.beginPath();ctx.ellipse(x+side*4,y,wing,5,side*.5,0,Math.PI*2);ctx.fill();}
    }
  }
  return {back,front};
})();

// Quiet, procedurally generated wind and irregular bird phrases. One reusable
// audio graph; the mute control and tab visibility govern every ambient sound.
const ForestAudio = (() => {
  let context,master,wind,timer,enabled=false;
  function bird(celebrate=false){
    if(!enabled||!context||context.state!=='running')return;
    const now=context.currentTime,base=(celebrate?1600:2200)+Math.random()*650;
    const count=celebrate?3:2;
    for(let i=0;i<count;i++){
      const start=now+i*(.13+Math.random()*.05),duration=.10+Math.random()*.06;
      const osc=context.createOscillator(),gain=context.createGain();osc.type='sine';
      osc.frequency.setValueAtTime(base*(i%2?1.12:1),start);osc.frequency.exponentialRampToValueAtTime(base*1.38,start+duration*.35);osc.frequency.exponentialRampToValueAtTime(base*.9,start+duration);
      gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(celebrate?.047:.017,start+.018);gain.gain.exponentialRampToValueAtTime(.0001,start+duration);
      osc.connect(gain);gain.connect(master);osc.start(start);osc.stop(start+duration+.01);
    }
  }
  function schedule(){clearTimeout(timer);if(!enabled)return;timer=setTimeout(()=>{bird();schedule();},3400+Math.random()*4800);}
  function attach(audio){
    if(context)return;context=audio;master=context.createGain();master.gain.value=0;master.connect(context.destination);
    const buffer=context.createBuffer(2,context.sampleRate*5,context.sampleRate);
    for(let channel=0;channel<2;channel++){const data=buffer.getChannelData(channel);let smooth=0;for(let i=0;i<data.length;i++){smooth=smooth*.985+(Math.random()*2-1)*.015;data[i]=smooth*3;}}
    wind=context.createBufferSource();wind.buffer=buffer;wind.loop=true;
    const filter=context.createBiquadFilter();filter.type='lowpass';filter.frequency.value=1300;
    const gain=context.createGain();gain.gain.value=.17;wind.connect(filter);filter.connect(gain);gain.connect(master);wind.start();
    const sway=context.createOscillator(),amount=context.createGain();sway.frequency.value=.11;amount.gain.value=.045;sway.connect(amount);amount.connect(gain.gain);sway.start();
  }
  function sync(on){const changed=enabled!==on;enabled=on;if(master){master.gain.cancelScheduledValues(context.currentTime);master.gain.setTargetAtTime(on?.65:0,context.currentTime,.12);}if(changed){clearTimeout(timer);if(on)schedule();}}
  function flutter(){if(!enabled||!context)return;const now=context.currentTime,source=context.createBufferSource(),gain=context.createGain(),filter=context.createBiquadFilter();source.buffer=wind.buffer;filter.type='highpass';filter.frequency.value=950;gain.gain.setValueAtTime(.07,now);gain.gain.exponentialRampToValueAtTime(.001,now+.09);source.connect(filter);filter.connect(gain);gain.connect(master);source.start(now,Math.random()*4);source.stop(now+.1);}
  return {attach,sync,bird,flutter};
})();
