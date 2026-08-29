import * as google from "./google.mjs";
import * as googleCloud from "./google-cloud.mjs";
import * as openai from "./openai.mjs";
import { normalizeProvider } from "./utils.mjs";

const providers = { google, "google-cloud": googleCloud, googlecloud: googleCloud, vertex: googleCloud, openai };

function get(name) {
  const normalized = normalizeProvider(name);
  const provider = providers[normalized];
  if (!provider) throw new Error(`Unknown provider: ${normalized}`);
  return provider;
}

export function getProviderStatus() {
  return { default: normalizeProvider(), google: google.status(), googleCloud: googleCloud.status(), openai: openai.status() };
}

export async function generateImage(options = {}) {
  return get(options.provider).generateImage(options);
}

export async function generateSpeech(options = {}) {
  return get(options.provider).generateSpeech(options);
}

export async function reviewImage(options = {}) {
  const provider = get(options.provider);
  if (typeof provider.reviewImage !== "function") return { pass: true, text: "QA unavailable for provider" };
  return provider.reviewImage(options);
}
