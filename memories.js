const MemoryGallery = (() => {
  const images = new Map(), cards = new Map();
  const ready = Promise.all(MEMORY_PHOTOS.filter(photo=>photo.src).map(async photo=>{
    const image = new Image();image.src=photo.src;
    try {await image.decode();images.set(photo.id,image);} catch { /* Keep the placeholder. */ }
  }));
  function card(id,solid=false) {
    const key=`${id}-${solid}`;if(cards.has(key))return cards.get(key);
    const photo=MEMORY_PHOTOS.find(photo=>photo.id===id);
    const image=images.get(id);
    const scale=image?Math.min(194/image.naturalWidth,260/image.naturalHeight):1;
    const imageWidth=image?image.naturalWidth*scale:194,imageHeight=image?image.naturalHeight*scale:192;
    const art=document.createElement('canvas');art.width=Math.ceil(imageWidth+26);art.height=Math.ceil(imageHeight+66);
    const c=art.getContext('2d');
    c.fillStyle=solid?'#bb6340':'#f6edcc';c.strokeStyle=solid?'#542e22':'#596447';c.lineWidth=5;
    c.beginPath();c.roundRect(3,3,art.width-6,art.height-6,5);c.fill();c.stroke();
    if(image)c.drawImage(image,13,13,imageWidth,imageHeight);
    else {
      const hues=[['#bdc688','#607d5b'],['#e5b783','#b46850'],['#9cbbb0','#4e7a6d']][(id-1)%3];
      const gradient=c.createLinearGradient(0,13,194,205);gradient.addColorStop(0,hues[0]);gradient.addColorStop(1,hues[1]);c.fillStyle=gradient;c.fillRect(13,13,194,192);
      c.strokeStyle='#fff4d3';c.lineWidth=3;c.beginPath();c.moveTo(110,106);c.bezierCurveTo(77,73, 70,118,110,139);c.bezierCurveTo(150,118,143,73,110,106);c.stroke();
      c.fillStyle='#fff5d9';c.font='15px Georgia';c.textAlign='center';c.fillText('Your photo here',110,178);
    }
    c.fillStyle=solid?'#fff2ce':'#46523b';c.font='18px Georgia';c.textAlign='center';c.fillText(photo.caption,art.width/2,art.height-26,art.width-30);
    if(solid){c.fillStyle='#f9db94';for(let x=12;x<art.width-10;x+=22){c.beginPath();c.moveTo(x,art.height-9);c.lineTo(x+8,art.height-20);c.lineTo(x+16,art.height-20);c.lineTo(x+8,art.height-9);c.fill();}}
    cards.set(key,art);return art;
  }
  const scenicIds=MEMORY_PHOTOS.map(p=>p.id).filter(id=>id!==6&&id!==11);
  // Permanent positions in the forest. Nothing is timed, faded or removed
  // to meet a visibility quota; frames leave only beyond the viewport edge.
  const scenery=scenicIds.map((id,index)=>({id,at:120+index*275,depth:index%3===0?.62:index%3===1?1.05:.82,baseWidth:index%3===0?164:index%3===1?90:126,width:164,y:104,angle:(index%2?1:-1)*.025}));
  function arrange(course) {
    // Choose clearings opposite nearby hazards once per run, not while moving.
    // Match the flight lane first, then adjust spacing to avoid occlusion.
    // A memory keeps this position for the whole run; it never swaps sides.
    for(const item of scenery){
      const art=card(item.id);
      const size=Math.min(item.baseWidth/art.width,200/art.height);
      item.width=art.width*size;item.height=art.height*size;
      let best=null;
      for(const shift of (item.id===1?[0,45,90]:[-90,-45,0,45,90])){
        const at=(item.id===1?260:120+scenicIds.indexOf(item.id)*275)+shift,height=item.height;
        // At this world position, the closest passage determines where eyes go.
        const guide=course.reduce((nearest,gate)=>Math.abs(gate.x-at)<Math.abs(nearest.x-at)?gate:nearest);
        // Keep the full caption above foreground foliage and the bottom HUD.
        const lowerY=Math.min(462,620-height-Math.abs(Math.sin(item.angle))*item.width/2);
        const y=guide.side==='top'?lowerY:102;
        let score=0;
        for(let travel=0;travel<=3700;travel+=15){
          const x=100+(at-travel)*item.depth;
          if(x+item.width/2<0||x-item.width/2>380)continue;
          for(const gate of course){
            const gx=100+gate.x-travel;
            const overlap=Math.max(0,Math.min(x+item.width/2,gx+72)-Math.max(x-item.width/2,gx-72));
            const vertical=gate.side==='top'?Math.max(0,Math.min(y+height,gate.edge)-y):Math.max(0,y+height-Math.max(y,gate.edge));
            score+=overlap*vertical;
          }
        }
        score+=Math.abs(shift)*8;
        if(!best||score<best.score)best={score,at,y,guideX:guide.x};
      }
      item.at=best.at;item.y=best.y;item.guideX=best.guideX;
    }
  }
  function layout(camera,anchor,width) {
    return scenery.map(item=>({...item,x:anchor+(item.at-camera)*item.depth}))
      .filter(item=>item.x+item.width*.6>0&&item.x-item.width*.6<width);
  }
  function draw(c,camera,anchor,width) {
    for(const item of layout(camera,anchor,width)){
      const height=item.height;
      c.save();c.translate(item.x,item.y);c.rotate(item.angle);
      // Two suspension vines connect every memory to the canopy, even low ones.
      c.strokeStyle=item.depth<.7?'#66764b':'#354e31';c.lineWidth=item.depth<.7?2:2.5;
      for(const side of [-1,1]){const x=side*item.width*.31;c.beginPath();c.moveTo(x,-item.y-30);c.lineTo(x,8);c.stroke();}
      c.drawImage(card(item.id),-item.width/2,0,item.width,height);
      c.fillStyle='#bd9255';for(const side of [-1,1])c.fillRect(side*item.width*.31-3,-5,6,15);
      c.restore();
    }
  }
  function hanging(c,id,bottom) {
    const art=card(id,true),scale=Math.min(112/art.width,160/art.height);
    const width=art.width*scale,height=art.height*scale,y=bottom-height,left=72-width/2;
    c.strokeStyle='#453f27';c.lineWidth=4;c.beginPath();c.moveTo(left+width*.2,0);c.lineTo(left+width*.2,y+4);c.moveTo(left+width*.8,0);c.lineTo(left+width*.8,y+4);c.stroke();
    c.drawImage(art,left,y,width,height);
    // A heavy thorn cage is a physical hazard, unlike the light memory prints.
    c.strokeStyle='#37291f';c.lineWidth=12;c.strokeRect(left-3,y-3,width+6,height+3);
    c.strokeStyle='#835333';c.lineWidth=7;c.strokeRect(left-3,y-3,width+6,height+3);
    c.fillStyle='#563f27';c.strokeStyle='#2e3020';c.lineWidth=2;
    for(let yy=y+13;yy<bottom-8;yy+=25)for(const side of [-1,1]){const x=side<0?left-4:left+width+4;c.beginPath();c.moveTo(x,yy);c.lineTo(x+side*10,yy+9);c.lineTo(x,yy+17);c.fill();c.stroke();}
    // The warning plaque sits inside the existing hazard height.
    c.fillStyle='#412d20';c.fillRect(left,bottom-22,width,18);c.fillStyle='#ffe4a2';c.font='bold 11px sans-serif';c.textAlign='center';c.fillText('! FLY BELOW !',72,bottom-9,width-4);

  }
  return {ready,draw,hanging,scenery,layout,arrange};
})();
