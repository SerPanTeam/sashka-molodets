(() => {
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const animal={dog:'Barking_of_a_dog.ogg',cat:'Meow.ogg',cow:'Single_Cow_Moo.ogg',horse:'Wiehern.ogg',pig:'Mudchute_pig_1.ogg',sheep:'Sheep_bleating.ogg',lion:'Lion_raring-sound1TamilNadu178.ogg',elephant:'Elephant_voice_-_trumpeting.ogg',bear:'Bear_growl.ogg'};
  const transport=new Set(['car','bus','train','bicycle','airplane','ship','truck','tractor','tram','helicopter']);
  const commons=file=>`https://commons.wikimedia.org/wiki/Special:Redirect/file/${encodeURIComponent(file)}`;
  const local=id=>new URL(`./assets/sfx/transport/${id}.ogg`,document.baseURI).href;
  async function playUrl(url,maxMs=2600){return new Promise(resolve=>{let done=false,started=false;const a=new Audio(url);a.preload='auto';a.volume=.9;const finish=ok=>{if(done)return;done=true;clearTimeout(startWatch);clearTimeout(stopWatch);try{a.pause()}catch{}resolve(ok)};a.onplaying=()=>started=true;a.onended=()=>finish(true);a.onerror=()=>finish(false);const startWatch=setTimeout(()=>{if(!started)finish(false)},3000),stopWatch=setTimeout(()=>finish(started),maxMs);try{a.play()?.catch?.(()=>finish(false))}catch{finish(false)}})}
  const unlock=()=>{try{const a=new Audio();a.muted=true;a.play()?.catch?.(()=>{})}catch{}};
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
