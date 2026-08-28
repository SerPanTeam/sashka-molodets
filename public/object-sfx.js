(() => {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const wait = ms => new Promise(r => setTimeout(r, ms));

  // Real, recognizable animal recordings. These are streamed from Wikimedia
  // Commons so we do not pretend that oscillator/noise synthesis is a real
  // animal voice. See animal-sound-sources.html for source/license details.
  const real = {
    dog: { file: 'Barking_of_a_dog.ogg', maxMs: 2400 },
    cat: { file: 'Meow.ogg', maxMs: 1300 },
    cow: { file: 'Single_Cow_Moo.ogg', maxMs: 2800 },
    horse: { file: 'Wiehern.ogg', maxMs: 2400 },
    pig: { file: 'Mudchute_pig_1.ogg', maxMs: 900 },
    sheep: { file: 'Sheep_bleating.ogg', maxMs: 2600 },
    lion: { file: 'Lion_raring-sound1TamilNadu178.ogg', maxMs: 2600 },
    elephant: { file: 'Elephant_voice_-_trumpeting.ogg', maxMs: 1900 },
    bear: { file: 'Bear_growl.ogg', maxMs: 2400 }
  };
  const commons = file => `https://commons.wikimedia.org/wiki/Special:Redirect/file/${encodeURIComponent(file)}`;

  async function playReal(id) {
    const spec = real[id];
    if (!spec || !window.Audio) return false;
    return new Promise(resolve => {
      let done = false;
      let started = false;
      const a = new Audio(commons(spec.file));
      a.preload = 'auto';
      a.volume = 0.92;
      const finish = ok => {
        if (done) return;
        done = true;
        clearTimeout(startWatch);
        clearTimeout(stopWatch);
        try { a.pause(); } catch {}
        a.onplaying = a.onended = a.onerror = null;
        resolve(ok);
      };
      a.onplaying = () => { started = true; };
      a.onended = () => finish(true);
      a.onerror = () => finish(false);
      const startWatch = setTimeout(() => { if (!started) finish(false); }, 3200);
      const stopWatch = setTimeout(() => finish(started), spec.maxMs);
      try {
        const p = a.play();
        p?.catch?.(() => finish(false));
      } catch {
        finish(false);
      }
    });
  }

  // Offline/network fallback. It is intentionally only a fallback: when the
  // real recording can be played, the child hears the real animal first.
  if (!Ctx) {
    window.SashkaSfx = {
      has: id => Boolean(real[id]),
      play: async id => playReal(id),
      isReal: id => Boolean(real[id])
    };
    return;
  }

  let ctx;
  const ac = () => {
    ctx ||= new Ctx();
    ctx.resume?.().catch(() => {});
    return ctx;
  };

  function tone(freq, dur, opts = {}) {
    const c = ac(), now = c.currentTime + (opts.delay || 0), o = c.createOscillator(), g = c.createGain();
    o.type = opts.type || 'sine';
    o.frequency.setValueAtTime(Math.max(20, freq), now);
    if (opts.to) o.frequency.exponentialRampToValueAtTime(Math.max(20, opts.to), now + dur);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(opts.gain || 0.18, now + Math.min(0.025, dur / 5));
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    o.connect(g); g.connect(c.destination); o.start(now); o.stop(now + dur + 0.03);
  }

  function noise(dur, opts = {}) {
    const c = ac(), start = c.currentTime + (opts.delay || 0), len = Math.max(1, Math.floor(c.sampleRate * dur));
    const b = c.createBuffer(1, len, c.sampleRate), data = b.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = b; f.type = opts.filter || 'bandpass'; f.frequency.value = opts.freq || 700; f.Q.value = opts.q || 0.8;
    g.gain.setValueAtTime(0.0001, start); g.gain.exponentialRampToValueAtTime(opts.gain || 0.16, start + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    s.connect(f); f.connect(g); g.connect(c.destination); s.start(start); s.stop(start + dur + 0.02);
  }

  function bark(delay = 0) { noise(.19,{delay,freq:650,gain:.28,q:.65}); tone(190,.17,{delay,to:105,type:'sawtooth',gain:.12}); }
  function meow(delay = 0) { tone(620,.58,{delay,to:920,type:'triangle',gain:.16}); tone(930,.32,{delay:delay+.34,to:470,type:'sine',gain:.12}); }
  function moo(delay = 0) { tone(165,.85,{delay,to:105,type:'sawtooth',gain:.16}); tone(82,.82,{delay,to:68,type:'sine',gain:.11}); }
  function neigh(delay = 0) { tone(520,.28,{delay,to:900,type:'triangle',gain:.15}); tone(880,.5,{delay:delay+.22,to:330,type:'sawtooth',gain:.12}); }
  function oink(delay = 0) { tone(230,.18,{delay,to:145,type:'square',gain:.11}); noise(.12,{delay,freq:380,gain:.12}); }
  function baa(delay = 0) { for(let i=0;i<5;i++) tone(430+i%2*55,.12,{delay:delay+i*.105,to:360,type:'triangle',gain:.1}); }
  function roar(delay = 0) { noise(.75,{delay,freq:230,gain:.22,q:.5}); tone(95,.72,{delay,to:72,type:'sawtooth',gain:.11}); }
  function trumpet(delay = 0) { tone(320,.22,{delay,to:620,type:'sawtooth',gain:.15}); tone(610,.55,{delay:delay+.16,to:430,type:'square',gain:.11}); }
  function engine(delay = 0, freq = 70, dur = .9) { tone(freq,dur,{delay,to:freq*1.35,type:'sawtooth',gain:.11}); tone(freq*2.04,dur,{delay,to:freq*2.35,type:'square',gain:.035}); }
  function bell(delay = 0) { tone(1450,.55,{delay,type:'sine',gain:.13}); tone(2180,.42,{delay,type:'sine',gain:.07}); }
  function horn(delay = 0, freq = 155, dur = .7) { tone(freq,dur,{delay,type:'sawtooth',gain:.13}); tone(freq*1.5,dur,{delay,type:'sine',gain:.07}); }

  const animalFallback = {
    dog: () => { bark(); bark(.34); return 720; },
    cat: () => { meow(); return 850; },
    cow: () => { moo(); return 1000; },
    horse: () => { neigh(); return 900; },
    pig: () => { oink(); oink(.28); return 600; },
    sheep: () => { baa(); return 760; },
    lion: () => { roar(); return 900; },
    elephant: () => { trumpet(); return 900; },
    bear: () => { roar(); return 900; }
  };

  const mechanical = {
    car: () => { engine(0,75,1); return 1100; },
    bus: () => { engine(0,58,.8); noise(.32,{delay:.62,freq:1800,gain:.1}); return 1100; },
    train: () => { for(let i=0;i<6;i++){noise(.05,{delay:i*.13,freq:1100,gain:.11}); noise(.04,{delay:i*.13+.06,freq:850,gain:.09});} horn(.18,220,.55); return 1150; },
    bicycle: () => { bell(); bell(.48); return 1150; },
    airplane: () => { noise(1.2,{freq:950,gain:.13,q:.45}); tone(115,1.2,{to:88,type:'sawtooth',gain:.055}); return 1300; },
    ship: () => { horn(0,92,1.05); return 1200; },
    truck: () => { engine(0,54,1.05); return 1150; },
    tractor: () => { for(let i=0;i<8;i++) tone(48,.11,{delay:i*.13,to:62,type:'square',gain:.07}); return 1150; },
    tram: () => { for(let i=0;i<7;i++) noise(.045,{delay:i*.12,freq:1250,gain:.08}); bell(.16); return 1000; },
    helicopter: () => { for(let i=0;i<10;i++) noise(.07,{delay:i*.1,freq:210,gain:.12,q:.55}); tone(72,1.05,{type:'sawtooth',gain:.05}); return 1150; },
    fridge: () => { tone(58,.9,{type:'sine',gain:.075}); tone(116,.9,{type:'sine',gain:.025}); return 1000; }
  };

  window.SashkaSfx = {
    has: id => Boolean(real[id] || mechanical[id]),
    isReal: id => Boolean(real[id]),
    play: async id => {
      if (real[id]) {
        try {
          if (await playReal(id)) return true;
        } catch {}
        const fallback = animalFallback[id];
        if (!fallback) return false;
        try { const ms = fallback(); await wait(ms); return true; } catch { return false; }
      }
      const fn = mechanical[id];
      if (!fn) return false;
      try { const ms = fn(); await wait(ms); return true; } catch { return false; }
    }
  };
})();
