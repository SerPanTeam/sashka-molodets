(() => {
  const STORE = 'sashka.letters.v2';
  const main = document.getElementById('main');
  const items = [
    { letter:'A', word:'Apfel', ua:'яблуко', image:'./assets/generated/images/apple.png' },
    { letter:'E', word:'Elefant', ua:'слон', image:'./assets/generated/images/elephant.png' },
    { letter:'I', word:'Igel', ua:'їжак', image:null },
    { letter:'O', word:'Orange', ua:'апельсин', image:'./assets/generated/images/orange.png' },
    { letter:'U', word:'Uhu', ua:'пугач', image:null }
  ];
  let current = null;
  let locked = false;
  let nextTimer = 0;
  const progress = (() => { try { return JSON.parse(localStorage.getItem(STORE) || '{}'); } catch { return {}; } })();
  const save = () => localStorage.setItem(STORE, JSON.stringify(progress));
  const shuffle = a => { a=[...a]; for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; };
  const score = letter => progress[letter]?.correct || 0;
  const unlockedCount = () => Math.min(5, Math.max(2, items.filter(x => score(x.letter) >= 3).length + 2));
  const activePool = () => items.slice(0, unlockedCount());

  let activeAudio = null;
  function stopSpeech(){
    if(activeAudio){ activeAudio.pause(); activeAudio.currentTime=0; activeAudio=null; }
  }
  function audioPath(kind){
    const id=current?.letter?.toLowerCase();
    return id ? `./assets/generated/audio/letter-${id}.${kind}.de.wav` : '';
  }
  function playClip(kind){
    stopSpeech();
    const src=audioPath(kind);
    if(!src) return Promise.resolve(false);
    return new Promise(resolve=>{
      const a=new Audio(src); activeAudio=a; a.preload='auto'; a.volume=1;
      a.onended=()=>{ if(activeAudio===a) activeAudio=null; resolve(true); };
      a.onerror=()=>{ if(activeAudio===a) activeAudio=null; resolve(false); };
      a.play().catch(()=>resolve(false));
    });
  }

  function installEntry(){
    const strip = document.querySelector('.category-strip');
    if (!strip || strip.querySelector('.letters-entry')) return;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'category-button letters-entry';
    b.setAttribute('aria-label','Buchstaben A E I O U');
    b.innerHTML = '<span class="letters-entry-mark" aria-hidden="true"><b>A</b><b>E</b><b>I</b><b>O</b><b>U</b></span><span class="letters-entry-title">Buchstaben</span><span class="small">Букви · A E I O U</span>';
    b.onclick = mount;
    strip.appendChild(b);
  }

  function letterRail(){
    return items.map((x,i)=>{
      const open = i < unlockedCount();
      const mastered = score(x.letter) >= 3;
      const cls = mastered ? 'is-mastered' : open ? 'is-open' : 'is-locked';
      return `<span class="vowel-chip ${cls}">${x.letter}</span>`;
    }).join('');
  }

  function mount(){
    clearTimeout(nextTimer); stopSpeech();
    document.body.classList.add('letters-mode');
    const soundButton = document.getElementById('soundButton');
    if(soundButton) soundButton.style.visibility='hidden';
    main.innerHTML = `
      <section class="letters-game">
        <header class="letters-head">
          <button type="button" class="letters-back" aria-label="Zurück"><span></span></button>
          <div class="letters-title"><span>Deutsch lernen</span><h1>Vokale A E I O U</h1></div>
          <button type="button" class="letters-repeat">Noch einmal</button>
        </header>
        <div class="letters-rail" id="lettersRail">${letterRail()}</div>
        <section class="letters-task">
          <p class="letters-kicker">Hör gut zu</p>
          <h2 id="lettersPrompt">Finde A</h2>
          <p class="letters-help">Höre den Laut und tippe auf den passenden Buchstaben.</p>
        </section>
        <div id="lettersChoices" class="letters-choices"></div>
        <div id="lettersAnchor" class="letters-anchor" aria-live="polite"></div>
      </section>`;
    main.querySelector('.letters-back').onclick = goHome;
    main.querySelector('.letters-repeat').onclick = () => current && playClip('question');
    next();
  }

  function goHome(){
    clearTimeout(nextTimer); stopSpeech(); document.body.classList.remove('letters-mode');
    location.reload();
  }

  function pick(){
    const pool = activePool();
    const weighted = [];
    for(const x of pool){
      const n = Math.max(1, 4 - Math.min(3, score(x.letter)));
      for(let i=0;i<n;i++) weighted.push(x);
    }
    return weighted[Math.floor(Math.random()*weighted.length)];
  }

  function renderRail(){ const el=document.getElementById('lettersRail'); if(el) el.innerHTML=letterRail(); }

  function next(){
    locked = false; current = pick(); renderRail();
    const prompt = document.getElementById('lettersPrompt');
    const choices = document.getElementById('lettersChoices');
    const anchor = document.getElementById('lettersAnchor');
    if(!prompt || !choices || !anchor) return;
    prompt.textContent = `Finde ${current.letter}`;
    choices.innerHTML = '';
    anchor.innerHTML = '<div class="letters-anchor-placeholder"><span>Hören</span><i></i><span>Sehen</span><i></i><span>Merken</span></div>';
    for(const item of shuffle(activePool())){
      const b=document.createElement('button');
      b.type='button'; b.className='letter-choice'; b.textContent=item.letter;
      b.setAttribute('aria-label',`Buchstabe ${item.letter}`);
      b.onclick=()=>choose(item,b); choices.appendChild(b);
    }
    nextTimer=setTimeout(()=>playClip('question'),220);
  }

  function choose(item, button){
    if(locked) return;
    if(item.letter !== current.letter){
      const p=progress[current.letter] || {correct:0,wrong:0}; p.wrong=(p.wrong||0)+1; progress[current.letter]=p; save();
      button.classList.add('is-wrong');
      playClip('retry');
      setTimeout(()=>button.classList.remove('is-wrong'),600);
      return;
    }
    locked=true;
    const p=progress[current.letter] || {correct:0,wrong:0}; p.correct=(p.correct||0)+1; progress[current.letter]=p; save();
    button.classList.add('is-correct'); renderRail();
    const anchor=document.getElementById('lettersAnchor');
    const visual=current.image ? `<img src="${current.image}" alt="${current.word}">` : `<div class="letters-word-letter">${current.letter}</div>`;
    anchor.innerHTML=`<div class="letters-anchor-card"><div class="letters-anchor-visual">${visual}</div><div class="letters-anchor-copy"><span>Merkwort</span><strong>${current.letter} wie ${current.word}</strong><small>${current.word} · ${current.ua}</small></div></div>`;
    playClip('success');
    nextTimer=setTimeout(next,2400);
  }

  const timer=setInterval(installEntry,300);
  addEventListener('pagehide',()=>clearInterval(timer),{once:true});
  if(document.readyState==='loading') addEventListener('DOMContentLoaded',installEntry,{once:true}); else installEntry();
})();