(() => {
  const cubeEl = document.getElementById('cube');
  const rig = document.getElementById('cubeRig');
  const scene = document.getElementById('scene');
  const movesEl = document.getElementById('moves');
  const timerEl = document.getElementById('timer');
  const statusEl = document.getElementById('status');
  const modal = document.getElementById('winModal');

  const colors = {U:'#f1f0ed',D:'#f5c845',F:'#54b96a',B:'#48a7df',R:'#ef5d64',L:'#ec8b39'};
  let cubies = [], history = [], moveCount = 0, seconds = 0, timerId = null, started = false, shuffled = false, soundOn = true;

  const rot = (p, axis, dir) => {
    let [x,y,z]=p;
    if(axis==='x') return dir>0 ? [x,-z,y] : [x,z,-y];
    if(axis==='y') return dir>0 ? [z,y,-x] : [-z,y,x];
    return dir>0 ? [-y,x,z] : [y,-x,z];
  };
  const key = p => p.join(',');
  const clone = () => cubies.map(c => ({p:[...c.p], stickers:{...c.stickers}}));

  function spacing(){ return window.matchMedia('(max-height:700px)').matches ? 39 : 46; }
  function faceName(face){ return face.toLowerCase(); }

  function build(){
    cubeEl.innerHTML=''; cubies=[];
    for(let x=-1;x<=1;x+=2) for(let y=-1;y<=1;y+=2) for(let z=-1;z<=1;z+=2){
      const stickers={};
      if(y===-1) stickers.U='U'; if(y===1) stickers.D='D';
      if(z===1) stickers.F='F'; if(z===-1) stickers.B='B';
      if(x===1) stickers.R='R'; if(x===-1) stickers.L='L';
      const c={p:[x,y,z], stickers}; cubies.push(c);
      const el=document.createElement('div'); el.className='cubie'; el.dataset.key=key(c.p);
      c.el=el;
      for(const face of ['U','D','F','B','R','L']){
        const s=document.createElement('div'); s.className=`sticker ${faceName(face)}`; s.dataset.face=face;
        s.style.background=colors[stickers[face] || 'B'];
        if(!stickers[face]) s.style.visibility='hidden';
        el.appendChild(s);
      }
      cubeEl.appendChild(el);
    }
    render(false);
  }

  function render(animate=true){
    const s=spacing();
    cubeEl.querySelectorAll('.cubie').forEach(el=>{
      el.style.transformOrigin='center';
      el.style.width=`${s*2}px`; el.style.height=`${s*2}px`;
      el.querySelectorAll('.sticker').forEach(st=>{st.style.width=`${s*2}px`;st.style.height=`${s*2}px`;});
      const c=cubies.find(v=>v.el===el);
      if(!c) return;
      el.style.transition=animate?'transform .28s cubic-bezier(.2,.7,.25,1)':'none';
      el.style.transform=`translate3d(${c.p[0]*s}px,${c.p[1]*s}px,${c.p[2]*s}px)`;
      el.querySelectorAll('.sticker').forEach(st=>{
        const color= c.stickers[st.dataset.face];
        st.style.background=colors[color] || '#252937';
        st.style.visibility=color?'visible':'hidden';
      });
    });
  }

  function turn(move, count=true, animate=true){
    if(!move) return;
    const prime=move.includes("'"); const face=move[0];
    let axis, dir;
    if(face==='R'){axis='x';dir=prime?-1:1} if(face==='L'){axis='x';dir=prime?1:-1}
    if(face==='U'){axis='y';dir=prime?1:-1} if(face==='D'){axis='y';dir=prime?-1:1}
    if(face==='F'){axis='z';dir=prime?-1:1} if(face==='B'){axis='z';dir=prime?1:-1}
    if(count){ history.push(clone()); if(history.length>100) history.shift(); }

    const check = face==='R'?1:face==='L'?-1:face==='U'?-1:face==='D'?1:face==='F'?1:-1;
    cubies.forEach(c=>{
      if(axis==='x' && c.p[0]!==check) return;
      if(axis==='y' && c.p[1]!==check) return;
      if(axis==='z' && c.p[2]!==check) return;
      c.p=rot(c.p,axis,dir);
      const newS={};
      for(const [f,color] of Object.entries(c.stickers)){
        const vec={U:[0,-1,0],D:[0,1,0],F:[0,0,1],B:[0,0,-1],R:[1,0,0],L:[-1,0,0]}[f];
        const rp=rot(vec,axis,dir);
        const nf=Object.entries({U:[0,-1,0],D:[0,1,0],F:[0,0,1],B:[0,0,-1],R:[1,0,0],L:[-1,0,0]}).find(([,v])=>v.join(',')===rp.join(','))[0];
        newS[nf]=color;
      }
      c.stickers=newS;
    });
    render(animate);
    if(count){ moveCount++; movesEl.textContent=moveCount; startTimer(); }
    if(count && shuffled) setTimeout(checkSolved,300);
  }

  function startTimer(){
    if(started) return; started=true;
    timerId=setInterval(()=>{seconds++;timerEl.textContent=format(seconds)},1000);
  }
  function format(s){return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`}

  function isSolved(){
    return ['U','D','F','B','R','L'].every(face=>{
      const vec={U:[0,-1,0],D:[0,1,0],F:[0,0,1],B:[0,0,-1],R:[1,0,0],L:[-1,0,0]}[face];
      const cs=cubies.filter(c=>c.p.join(',')!=='' && c.p[0]*vec[0]+c.p[1]*vec[1]+c.p[2]*vec[2]>1);
      if(!cs.length)return true;
      const target=cubies.find(c=>c.p.join(',')===c.p.join(',' ) && c.stickers[face]);
      const sample=cs.map(c=>c.stickers[face]).filter(Boolean);
      return sample.length===4 && sample.every(v=>v===sample[0]);
    });
  }

  function checkSolved(){
    if(!shuffled || moveCount===0) return;
    if(isSolved()){
      clearInterval(timerId); timerId=null; shuffled=false;
      document.getElementById('winMoves').textContent=moveCount;
      document.getElementById('winTime').textContent=format(seconds);
      modal.classList.add('show'); modal.setAttribute('aria-hidden','false');
    }
  }

  function shuffle(){
    clearInterval(timerId); timerId=null; seconds=0;started=false;moveCount=0;history=[];
    timerEl.textContent='00:00';movesEl.textContent='0';modal.classList.remove('show');modal.setAttribute('aria-hidden','true');
    build();
    const seq=['U','D','F','B','R','L']; let last='';
    for(let i=0;i<14;i++){let f=seq[Math.floor(Math.random()*seq.length)];if(f===last) i--;else{last=f;turn(f+(Math.random()<.5?"'":''),false,false)}}
    shuffled=true; statusEl.textContent='المكعب جاهز — ابدأ الحل!';
  }

  function undo(){
    if(!history.length)return;
    const old=history.pop(); cubies=old.map(c=>({p:[...c.p], stickers:{...c.stickers}}));
    moveCount=Math.max(0,moveCount-1);movesEl.textContent=moveCount;render(true);statusEl.textContent='تم التراجع عن الحركة';
  }

  build();
  document.querySelectorAll('.face-btn').forEach(b=>b.addEventListener('click',e=>{e.preventDefault();turn(b.dataset.move)}));
  document.getElementById('shuffleBtn').addEventListener('click',shuffle);
  document.getElementById('undoBtn').addEventListener('click',undo);
  document.getElementById('resetViewBtn').addEventListener('click',()=>{rig.style.transform='rotateX(-23deg) rotateY(-32deg)'});
  document.getElementById('againBtn').addEventListener('click',shuffle);
  document.getElementById('soundBtn').addEventListener('click',e=>{soundOn=!soundOn;e.currentTarget.classList.toggle('muted',!soundOn)});

  let dragging=false, lx=0, ly=0, rx=-23, ry=-32;
  scene.addEventListener('pointerdown',e=>{dragging=true;lx=e.clientX;ly=e.clientY;scene.classList.add('dragging');scene.setPointerCapture(e.pointerId)});
  scene.addEventListener('pointermove',e=>{if(!dragging)return;const dx=e.clientX-lx,dy=e.clientY-ly;lx=e.clientX;ly=e.clientY;ry+=dx*.45;rx-=dy*.45;rig.classList.remove('snap');rig.style.transform=`rotateX(${rx}deg) rotateY(${ry}deg)`});
  scene.addEventListener('pointerup',()=>{dragging=false;scene.classList.remove('dragging')});
  scene.addEventListener('pointercancel',()=>{dragging=false;scene.classList.remove('dragging')});
})();
