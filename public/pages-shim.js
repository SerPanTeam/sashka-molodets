(() => {
  // Migrate older saved settings without overwriting an intentional custom category choice.
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
      // v3 fixes stale clients that remained locked in German-only mode from
      // an older build. Migrate once to DE → UA, then preserve future choices.
      voiceMode: oldSettingsVersion < 3 ? 'dual' : (saved.voiceMode === 'de' ? 'de' : 'dual'),
      autoSpeak: saved.autoSpeak !== false,
      categories: looksLikeOldDefault ? newCore : categories
    }));
  } catch {}

  const nativeFetch = window.fetch.bind(window);

  const isProductionReady = item => {
    const de = item?.generatedAudioDe || {};
    const ua = item?.generatedAudioUa || {};
    return Boolean(
      item?.generatedImage &&
      de.question && de.success &&
      ua.question && ua.success
    );
  };

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
    const allItems = categories.flatMap(category => category.items || []);
    const readyItems = allItems.filter(isProductionReady);
    return {
      schemaVersion: manifest.schemaVersion || 1,
      languages: manifest.languages || ['de-DE', 'uk-UA'],
      items: readyItems
    };
  }

  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input?.url;
    if (url === '/api/content') {
      // GitHub Pages has no API backend. Always build fresh content from the
      // deployed static JSON and expose only cards with image + DE + UA audio.
      const content = await loadStaticContent();
      return new Response(JSON.stringify(content), { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
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
