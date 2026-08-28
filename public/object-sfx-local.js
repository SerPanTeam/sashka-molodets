(() => {
  const previous = window.SashkaSfx;
  const animalFiles = {
    dog: './assets/sfx/animals/dog.ogg',
    cat: './assets/sfx/animals/cat.ogg',
    cow: './assets/sfx/animals/cow.ogg',
    horse: './assets/sfx/animals/horse.ogg',
    pig: './assets/sfx/animals/pig.ogg',
    sheep: './assets/sfx/animals/sheep.ogg',
    lion: './assets/sfx/animals/lion.ogg',
    elephant: './assets/sfx/animals/elephant.ogg',
    bear: './assets/sfx/animals/bear.ogg'
  };
  const animalIds = new Set([...Object.keys(animalFiles), 'rabbit']);
  const maxMs = { dog: 2600, cat: 1200, cow: 3000, horse: 2400, pig: 900, sheep: 3000, lion: 3000, elephant: 2200, bear: 2800 };
  let player;

  function nativePlayer() {
    if (!player) {
      player = document.createElement('audio');
      player.preload = 'auto';
      player.volume = 0.95;
    }
    return player;
  }

  async function playAnimal(id) {
    const src = animalFiles[id];
    if (!src) return false;
    const a = nativePlayer();
    try { a.pause(); } catch {}
    a.currentTime = 0;
    a.src = new URL(src, document.baseURI).href;
    return new Promise(resolve => {
      let done = false;
      let started = false;
      const finish = ok => {
        if (done) return;
        done = true;
        clearTimeout(startTimer);
        clearTimeout(stopTimer);
        a.onplaying = a.onended = a.onerror = null;
        try { a.pause(); } catch {}
        resolve(ok);
      };
      a.onplaying = () => { started = true; };
      a.onended = () => finish(true);
      a.onerror = () => finish(false);
      const startTimer = setTimeout(() => finish(false), 2200);
      const stopTimer = setTimeout(() => finish(started), maxMs[id] || 2600);
      try {
        const p = a.play();
        if (p?.catch) p.catch(() => finish(false));
      } catch {
        finish(false);
      }
    });
  }

  window.SashkaSfx = {
    has(id) {
      if (id === 'rabbit') return false;
      if (animalFiles[id]) return true;
      return Boolean(previous?.has?.(id));
    },
    async play(id) {
      if (animalFiles[id]) {
        const ok = await playAnimal(id);
        if (ok) return true;
        return Boolean(await previous?.play?.(id));
      }
      if (animalIds.has(id)) return false;
      return Boolean(await previous?.play?.(id));
    }
  };
})();
