(() => {
  const NativeAudio = window.Audio;
  if (!NativeAudio || window.__sashkaAudioBridgeInstalled) return;

  window.__sashkaAudioBridgeInstalled = true;

  // Reuse one HTMLAudioElement for all recorded voice clips. Browsers can
  // block a second freshly-created media element after the first clip ends,
  // which previously caused DE success audio to play while UA was skipped.
  const shared = new NativeAudio();
  shared.preload = 'auto';

  function BridgedAudio(src) {
    if (src !== undefined && src !== null) {
      shared.src = String(src);
    }
    return shared;
  }

  BridgedAudio.prototype = NativeAudio.prototype;
  try { Object.setPrototypeOf(BridgedAudio, NativeAudio); } catch {}
  window.Audio = BridgedAudio;
})();
