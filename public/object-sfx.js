(() => {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const real = {
    dog:{file:'Barking_of_a_dog.ogg',maxMs:2400},cat:{file:'Meow.ogg',maxMs:1300},cow:{file:'Single_Cow_Moo.ogg',maxMs:2800},horse:{file:'Wiehern.ogg',maxMs:2400},pig:{file:'Mudchute_pig_1.ogg',maxMs:900},sheep:{file:'Sheep_bleating.ogg',maxMs:2600},lion:{file:'Lion_raring-sound1TamilNadu178.ogg',maxMs:2600},elephant:{file:'Elephant_voice_-_trumpeting.ogg',maxMs:1900},bear:{file:'Bear_growl.ogg',maxMs:2400}
  };
  const commons=file=>`https://commons.wikimedia.org/wiki/Special:Redirect/file/${encodeURIComponent(file)}`;
  async function playReal(id){const spec=real[id];if(!spec||!window.Audio)return false;return new Promise(resolve=>{let done=false,started=false;const a=new Audio(commons(spec.file));a.preload='auto';a.volume=.92;const finish=ok=>{if(done)return;done=true;clearTimeout(startWatch);clearTimeout(stopWatch);try{a.pause()}catch{}a.onplaying=a.onended=a.onerror=null;resolve(ok)};a.onplaying=()=>{started=true};a.onended=()=>finish(true);a.onerror=()=>finish(false);const startWatch=setTimeout(()=>{if(!started)finish(false)},3200),stopWatch=setTimeout(()=>finish(started),spec.maxMs);try{a.play()?.catch?.(()=>finish(false))}catch{finish(false)}})}
  if(!Ctx){window.SashkaSfx={has:id=>Boolean(real[id]),play:async id=>playReal(id),isReal:id=>Boolean(real[id])};return}
  let ctx;
  const ac=()=>{ctx ||= new Ctx();ctx.resume?.().catch(()=>{});return ctx};
  const unlock=()=>{try{const c=ac();if(c.state==='suspended')c.resume?.().catch(()=>{})}catch{}};
  document.addEventListener('pointerdown',unlock,{capture:true,passive:true});
  document.addEventListener('touchstart',unlock,{capture:true,passive:true});
  document.addEventListener('click',unlock,{capture:true,passive:true});
  function tone(freq,dur,o={}){const c=ac(),now=c.currentTime+(o.delay||0),osc=c.createOscillator(),g=c.createGain();osc.type=o.type||'sine';osc.frequency.setValueAtTime(Math.max(20,freq),now);if(o.to)osc.frequency.exponentialRampToValueAtTime(Math.max(20,o.to),now+dur);g.gain.setValueAtTime(.0001,now);g.gain.exponentialRampToValueAtTime(o.gain||.18,now+Math.min(.025,dur/5));g.gain.exponentialRampToValueAtTime(.0001,now+dur);osc.connect(g);g.connect(c.destination);osc.start(now);osc.stop(now+dur+.03)}
  function noise(dur,o={}){const c=ac(),start=c.currentTime+(o.delay||0),len=Math.max(1,Math.floor(c.sampleRate*dur)),b=c.createBuffer(1,len,c.sampleRate),data=b.getChannelData(0);for(let i=0;i<len;i++)data[i]=(Math.random()*2-1)*(1-i/len);const s=c.createBufferSource(),f=c.createBiquadFilter(),g=c.createGain();s.buffer=b;f.type=o.filter||'bandpass';f.frequency.value=o.freq||700;f.Q.value=o.q||.8;g.gain.setValueAtTime(.0001,start);g.gain.exponentialRampToValueAtTime(o.gain||.16,start+.015);g.gain.exponentialRampToValueAtTime(.0001,start+dur);s.connect(f);f.connect(g);g.connect(c.destination);s.start(start);s.stop(start+dur+.02)}
  const engine=(d=0,f=70,dur=.9)=>{tone(f,dur,{delay:d,to:f*1.35,type:'sawtooth',gain:.18});tone(f*2.04,dur,{delay:d,to:f*2.35,type:'square',gain:.06})};
  const bell=(d=0)=>{tone(1450,.55,{delay:d,gain:.2});tone(2180,.42,{delay:d,gain:.1})};
  const horn=(d=0,f=155,dur=.7)=>{tone(f,dur,{delay:d,type:'sawtooth',gain:.2});tone(f*1.5,dur,{delay:d,gain:.1})};
  const mechanical={
    car:()=>{engine(0,75,1);return 1100},bus:()=>{engine(0,58,.8);noise(.32,{delay:.62,freq:1800,gain:.15});return 1100},train:()=>{for(let i=0;i<6;i++){noise(.05,{delay:i*.13,freq:1100,gain:.15});noise(.04,{delay:i*.13+.06,freq:850,gain:.12})}horn(.18,220,.55);return 1150},bicycle:()=>{bell();bell(.48);return 1150},airplane:()=>{noise(1.2,{freq:950,gain:.18,q:.45});tone(115,1.2,{to:88,type:'sawtooth',gain:.08});return 1300},ship:()=>{horn(0,92,1.05);return 1200},truck:()=>{engine(0,54,1.05);return 1150},tractor:()=>{for(let i=0;i<8;i++)tone(48,.11,{delay:i*.13,to:62,type:'square',gain:.11});return 1150},tram:()=>{for(let i=0;i<7;i++)noise(.045,{delay:i*.12,freq:1250,gain:.12});bell(.16);return 1000},helicopter:()=>{for(let i=0;i<10;i++)noise(.07,{delay:i*.1,freq:210,gain:.17,q:.55});tone(72,1.05,{type:'sawtooth',gain:.08});return 1150},fridge:()=>{tone(58,.9,{gain:.1});tone(116,.9,{gain:.035});return 1000}
  };
  window.SashkaSfx={has:id=>Boolean(real[id]||mechanical[id]),isReal:id=>Boolean(real[id]),unlock,play:async id=>{if(real[id]){try{if(await playReal(id))return true}catch{}return false}const fn=mechanical[id];if(!fn)return false;try{unlock();const ms=fn();await wait(ms);return true}catch{return false}}};
})();
