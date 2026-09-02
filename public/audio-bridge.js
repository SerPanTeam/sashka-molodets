(() => {
  const NativeAudio = window.Audio;
  if (!NativeAudio || window.__sashkaAudioBridgeInstalled) return;

  window.__sashkaAudioBridgeInstalled = true;

  // Keep one playback element so DE -> UA remains reliable on tablets.
  const shared = new NativeAudio();
  shared.preload = 'auto';

  // Warm every recorded voice clip into the browser/SW cache as soon as the
  // static content is available. This prevents first-tap network stalls that
  // can make short praise/question clips sound torn or startling.
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
          for (const kind of ['question', 'success', 'wrong', 'retry']) if (group[kind]) urls.push(group[kind]);
        }
      }
      // Small parallel batches: fast enough to warm the game without flooding
      // a tablet/Wi-Fi connection and competing with the first visible screen.
      for (let i = 0; i < urls.length; i += 8) {
        await Promise.all(urls.slice(i, i + 8).map(warmUrl));
      }
      window.dispatchEvent(new CustomEvent('sashka-audio-warmed', { detail: { count: warmed.size } }));
    } catch {}
  }

  function BridgedAudio(src) {
    if (src !== undefined && src !== null) {
      const value = String(src);
      // Start fetching immediately even if the global warm-up has not reached it yet.
      warmUrl(value);
      shared.src = value;
      shared.load();
    }
    return shared;
  }

  BridgedAudio.prototype = NativeAudio.prototype;
  try { Object.setPrototypeOf(BridgedAudio, NativeAudio); } catch {}
  window.Audio = BridgedAudio;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(warmContentAudio, 150), { once: true });
  } else {
    setTimeout(warmContentAudio, 150);
  }
})();
