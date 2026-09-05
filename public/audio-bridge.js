(() => {
  if (window.__sashkaAudioWarmInstalled) return;
  window.__sashkaAudioWarmInstalled = true;

  // IMPORTANT: never override window.Audio. Android/Chrome expects each
  // playback to use a real native HTMLAudioElement. Sharing one global audio
  // element caused voice, applause and object sounds to cancel/mute each other.
  const warmed = new Set();

  async function warmUrl(src) {
    if (!src || warmed.has(src)) return;
    warmed.add(src);
    try {
      const response = await fetch(src, { cache: 'force-cache' });
      if (!response.ok) throw new Error(String(response.status));
      await response.blob();
    } catch {
      warmed.delete(src);
    }
  }

  async function warmContentAudio() {
    try {
      const response = await fetch('/api/content');
      if (!response.ok) return;
      const content = await response.json();
      const urls = [];
      for (const item of content.items || []) {
        for (const group of [item.generatedAudioDe, item.generatedAudioUa]) {
          if (!group) continue;
          for (const kind of ['question', 'success', 'wrong', 'retry']) {
            if (group[kind]) urls.push(group[kind]);
          }
        }
      }
      for (let i = 0; i < urls.length; i += 8) {
        await Promise.all(urls.slice(i, i + 8).map(warmUrl));
      }
      window.dispatchEvent(new CustomEvent('sashka-audio-warmed', {
        detail: { count: warmed.size }
      }));
    } catch {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(warmContentAudio, 150), { once: true });
  } else {
    setTimeout(warmContentAudio, 150);
  }
})();
