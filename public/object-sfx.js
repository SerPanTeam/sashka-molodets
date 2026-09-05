(() => {
  const animal={dog:'Barking_of_a_dog.ogg',cat:'Meow.ogg',cow:'Single_Cow_Moo.ogg',horse:'Wiehern.ogg',pig:'Mudchute_pig_1.ogg',sheep:'Sheep_bleating.ogg',lion:'Lion_raring-sound1TamilNadu178.ogg',elephant:'Elephant_voice_-_trumpeting.ogg',bear:'Bear_growl.ogg'};
  const transport=new Set(['car','bus','train','bicycle','airplane','ship','truck','tractor','tram','helicopter']);
  const commons=file=>`https://commons.wikimedia.org/wiki/Special:Redirect/file/${encodeURIComponent(file)}`;
  const local=id=>new URL(`./assets/sfx/transport/${id}.ogg`,document.baseURI).href;
  async function playUrl(url,maxMs=2600){return new Promise(resolve=>{let done=false,started=false;const a=new Audio(url);a.preload='auto';a.muted=false;a.volume=.9;const finish=ok=>{if(done)return;done=true;clearTimeout(startWatch);clearTimeout(stopWatch);try{a.pause()}catch{}resolve(ok)};a.onplaying=()=>started=true;a.onended=()=>finish(true);a.onerror=()=>finish(false);const startWatch=setTimeout(()=>{if(!started)finish(false)},3000),stopWatch=setTimeout(()=>finish(started),maxMs);try{a.play()?.catch?.(()=>finish(false))}catch{finish(false)}})}

  // Tiny silent WAV used only during a real pointer gesture to unlock media
  // playback on Android tablets. It uses a native Audio element and never
  // touches the production voice/SFX players.
  const SILENT='data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
  let unlocked=false;
  const unlock=()=>{
    if(unlocked)return;
    try{
      const a=new Audio(SILENT);
      a.preload='auto';
      a.muted=false;
      a.volume=.01;
      const p=a.play();
      if(p?.then)p.then(()=>{unlocked=true;try{a.pause()}catch{}}).catch(()=>{});
    }catch{}
  };
  document.addEventListener('pointerdown',unlock,{capture:true,passive:true});

  window.SashkaSfx={
    has:id=>Boolean(animal[id]||transport.has(id)),
    isReal:id=>Boolean(animal[id]||transport.has(id)),
    unlock,
    play:async id=>{
      if(transport.has(id))return playUrl(local(id),2400);
      if(animal[id])return playUrl(commons(animal[id]),2800);
      return false;
    }
  };
})();
