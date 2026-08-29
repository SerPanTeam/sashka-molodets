(() => {
  const CHILD_NAME_DE = 'Olexander';

  try {
    const settingsKey = 'sashka.settings';
    const saved = JSON.parse(localStorage.getItem(settingsKey) || '{}');
    const oldCore = ['animals', 'vegetables', 'fruits'];
    const newCore = ['animals', 'vegetables', 'fruits', 'household', 'hygiene', 'transport'];
    const categories = Array.isArray(saved.categories) ? saved.categories : [];
    const looksLikeOldDefault = categories.length === 0 || (categories.length === 3 && oldCore.every(x => categories.includes(x)));
    const oldSettingsVersion = Number(saved.settingsVersion || 0);
    localStorage.setItem(settingsKey, JSON.stringify({
      ...saved,
      settingsVersion: 3,
      voiceMode: oldSettingsVersion < 3 ? 'dual' : (saved.voiceMode === 'de' ? 'de' : 'dual'),
      autoSpeak: saved.autoSpeak !== false,
      categories: looksLikeOldDefault ? newCore : categories
    }));
  } catch {}

  try {
    const NativeUtterance = window.SpeechSynthesisUtterance;
    if (NativeUtterance) {
      const PatchedUtterance = function(text = '') {
        return new NativeUtterance(String(text).replace(/\bAlexander\b/g, CHILD_NAME_DE));
      };
      PatchedUtterance.prototype = NativeUtterance.prototype;
      window.SpeechSynthesisUtterance = PatchedUtterance;
    }
  } catch {}

  const replaceLegacyName = root => {
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (node.nodeValue?.includes('Alexander')) node.nodeValue = node.nodeValue.replace(/\bAlexander\b/g, CHILD_NAME_DE);
    }
  };
  try {
    replaceLegacyName(document.body);
    new MutationObserver(records => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node.nodeType === Node.TEXT_NODE) {
            if (node.nodeValue?.includes('Alexander')) node.nodeValue = node.nodeValue.replace(/\bAlexander\b/g, CHILD_NAME_DE);
          } else replaceLegacyName(node);
        }
      }
    }).observe(document.body, { childList: true, subtree: true });
  } catch {}

  const nativeFetch = window.fetch.bind(window);

  const hasRequiredMetadata = item => {
    const de = item?.generatedAudioDe || {};
    const ua = item?.generatedAudioUa || {};
    return Boolean(
      item?.generatedImage &&
      de.question && de.success && de.wrong && de.retry &&
      ua.question && ua.success && ua.wrong && ua.retry
    );
  };

  // Optional production diagnostic. It deliberately does NOT run during app startup.
  // Build-time validation already checks all 60 production cards on every deploy.
  async function physicalAssetsExist(item) {
    const refs = [
      item?.generatedImage,
      item?.generatedAudioDe?.question,
      item?.generatedAudioDe?.success,
      item?.generatedAudioDe?.wrong,
      item?.generatedAudioDe?.retry,
      item?.generatedAudioUa?.question,
      item?.generatedAudioUa?.success,
      item?.generatedAudioUa?.wrong,
      item?.generatedAudioUa?.retry
    ].filter(Boolean);
    for (const ref of refs) {
      try {
        const response = await nativeFetch(ref, { method: 'HEAD', cache: 'no-store' });
        if (!response.ok) return false;
      } catch {
        return false;
      }
    }
    return refs.length === 9;
  }
  window.SashkaVerifyItemAssets = physicalAssetsExist;

  async function loadStaticContent() {
    const manifestResponse = await nativeFetch('./content/content.json', { cache: 'no-store' });
    if (!manifestResponse.ok) throw new Error('Static content manifest unavailable');
    const manifest = await manifestResponse.json();
    const categoryFiles = Array.isArray(manifest.categoryFiles) ? manifest.categoryFiles : [];
    const categories = await Promise.all(categoryFiles.map(async path => {
      const response = await nativeFetch(`./content/${path}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Content file unavailable: ${path}`);
      return response.json();
    }));
    const items = categories.flatMap(category => category.items || []).filter(hasRequiredMetadata);
    return {
      schemaVersion: manifest.schemaVersion || 1,
      languages: manifest.languages || ['de-DE', 'uk-UA'],
      items
    };
  }

  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input?.url;
    if (url === '/api/content') {
      const content = await loadStaticContent();
      return new Response(JSON.stringify(content), {
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      });
    }
    return nativeFetch(input, init);
  };

  if ('serviceWorker' in navigator && typeof navigator.serviceWorker.register === 'function') {
    const nativeRegister = navigator.serviceWorker.register.bind(navigator.serviceWorker);
    try {
      navigator.serviceWorker.register = (scriptURL, options) => nativeRegister(scriptURL === '/sw.js' ? './sw.js' : scriptURL, options);
    } catch {}
  }
})();
