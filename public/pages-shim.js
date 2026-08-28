(() => {
  // Bilingual mode is a product rule: every prompt/feedback is spoken
  // first in German and then in Ukrainian. Keep auto speech enabled by default.
  try {
    const settingsKey = 'sashka.settings';
    const saved = JSON.parse(localStorage.getItem(settingsKey) || '{}');
    localStorage.setItem(settingsKey, JSON.stringify({
      ...saved,
      languageMode: 'dual',
      autoSpeak: true
    }));
  } catch {}

  const nativeFetch = window.fetch.bind(window);

  async function loadStaticContent() {
    const manifestResponse = await nativeFetch('./content/content.json', { cache: 'no-store' });
    if (!manifestResponse.ok) throw new Error('Static content manifest unavailable');
    const manifest = await manifestResponse.json();
    const categoryFiles = Array.isArray(manifest.categoryFiles) ? manifest.categoryFiles : [];
    const categories = await Promise.all(
      categoryFiles.map(async path => {
        const response = await nativeFetch(`./content/${path}`);
        if (!response.ok) throw new Error(`Content file unavailable: ${path}`);
        return response.json();
      })
    );
    return {
      schemaVersion: manifest.schemaVersion || 1,
      languages: manifest.languages || ['de-DE', 'uk-UA'],
      items: categories.flatMap(category => category.items || [])
    };
  }

  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input?.url;
    if (url === '/api/content') {
      try {
        const response = await nativeFetch(input, init);
        if (response.ok && (response.headers.get('content-type') || '').includes('application/json')) {
          return response;
        }
      } catch {}
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
      navigator.serviceWorker.register = (scriptURL, options) =>
        nativeRegister(scriptURL === '/sw.js' ? './sw.js' : scriptURL, options);
    } catch {}
  }
})();
