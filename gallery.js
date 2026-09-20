const gallery=document.querySelector('#gallery'),viewer=document.querySelector('#viewer');
let current=0,lastTrigger=null;
function photoContent(photo){
  const placeholder=()=>{const div=document.createElement('div');div.className='placeholder';const heart=document.createElement('span');heart.textContent='♡';div.append(heart,document.createTextNode('A memory waiting to bloom'));return div;};
  if(!photo.src)return placeholder();
  const image=new Image();image.alt=photo.caption;image.src=photo.src;image.loading='lazy';image.onerror=()=>image.replaceWith(placeholder());return image;
}
MEMORY_PHOTOS.forEach((photo,index)=>{const figure=document.createElement('figure');figure.className='memory';const button=document.createElement('button');button.setAttribute('aria-label','View '+photo.caption);button.append(photoContent(photo));button.onclick=()=>{lastTrigger=button;current=index;showPhoto();viewer.showModal();};const caption=document.createElement('figcaption');caption.textContent=photo.caption;figure.append(button,caption);gallery.append(figure);});
function zoomPhoto(){const value=Number(document.querySelector('#zoom').value),full=document.querySelector('#full-photo');full.style.width=value+'%';full.classList.toggle('zoomed',value>100);document.querySelector('#zoom-value').textContent=value+'%';}
function showPhoto(){const photo=MEMORY_PHOTOS[current];document.querySelector('#full-photo').replaceChildren(photoContent(photo));document.querySelector('#caption').textContent=photo.caption;document.querySelector('#position').textContent=(current+1)+' / '+MEMORY_PHOTOS.length;document.querySelector('#zoom').value=100;zoomPhoto();document.querySelector('#photo-stage').scrollTo(0,0);document.querySelector('#previous').disabled=current===0;document.querySelector('#next').disabled=current===MEMORY_PHOTOS.length-1;}
document.querySelector('#zoom').oninput=zoomPhoto;
document.querySelector('#previous').onclick=()=>{if(current>0){current--;showPhoto();}};
document.querySelector('#next').onclick=()=>{if(current<MEMORY_PHOTOS.length-1){current++;showPhoto();}};
document.querySelector('#close').onclick=()=>viewer.close();
viewer.addEventListener('close',()=>lastTrigger?.focus());
viewer.addEventListener('keydown',event=>{if(event.target.matches('input'))return;if(event.key==='ArrowRight')document.querySelector('#next').click();if(event.key==='ArrowLeft')document.querySelector('#previous').click();});
