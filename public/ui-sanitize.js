(() => {
  const pictographic = /^[\p{Extended_Pictographic}\uFE0F\u200D\s]+/u;
  function clean(){
    document.querySelectorAll('#categorySettings .cat-chip span').forEach(el=>{
      const t=el.textContent || '';
      const next=t.replace(pictographic,'').trimStart();
      if(next!==t) el.textContent=next;
    });
    const toast=document.getElementById('toast');
    if(toast && toast.textContent) toast.textContent=toast.textContent.replace(pictographic,'').trimStart();
  }
  const timer=setInterval(clean,150);
  clean();
  addEventListener('pagehide',()=>clearInterval(timer),{once:true});
})();