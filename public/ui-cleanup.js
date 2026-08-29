const stripDecorativeEmoji = (text='') => text
  .replace(/[✨🐶🥕🍎☕🪥🚂🎨🔢🔷👕🖐️🏠⭐🌟🏆🔊🇩🇪🇺🇦]/gu, '')
  .replace(/\s{2,}/g, ' ')
  .trim();

function cleanRuntimeUi(){
  const voice=document.querySelector('#voiceModeButton');
  if(voice){
    const de=voice.getAttribute('aria-pressed')==='true';
    voice.textContent=de?'DE':'DE + UA';
  }
  const play=document.querySelector('.big-play');
  if(play) play.textContent=stripDecorativeEmoji(play.textContent);
  const now=document.querySelector('#categoryNow');
  if(now) now.textContent=stripDecorativeEmoji(now.textContent);
  document.querySelectorAll('.category-button .icon,.choice-emoji,.mascot').forEach(el=>el.remove());
}

const observer=new MutationObserver(()=>queueMicrotask(cleanRuntimeUi));
observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['aria-pressed']});
window.addEventListener('DOMContentLoaded',cleanRuntimeUi);
setTimeout(cleanRuntimeUi,0);
