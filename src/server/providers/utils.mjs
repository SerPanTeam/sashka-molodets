export async function expectOk(response, provider) {
  if (response.ok) return response;
  const text = await response.text().catch(() => "");
  throw new Error(`${provider} request failed (${response.status}): ${text.slice(0, 800)}`);
}

export function findBase64Payload(value, wantedType) {
  const seen = new Set();
  function walk(node) {
    if (!node || typeof node !== "object" || seen.has(node)) return null;
    seen.add(node);
    const type = String(node.type || node.mime_type || node.mimeType || "").toLowerCase();
    const mime = String(node.mime_type || node.mimeType || "").toLowerCase();
    const likely = type.includes(wantedType) || mime.startsWith(`${wantedType}/`);
    if (likely && typeof node.data === "string" && node.data.length > 100) {
      return { data: node.data, mimeType: mime || (wantedType === "audio" ? "audio/pcm" : "image/png") };
    }
    if (wantedType === "image" && typeof node.b64_json === "string") return { data: node.b64_json, mimeType: "image/png" };
    for (const child of Object.values(node)) {
      if (child && typeof child === "object") {
        const result = walk(child);
        if (result) return result;
      }
    }
    return null;
  }
  return walk(value);
}

export function pcm16Mono24kToWav(pcm) {
  const sampleRate = 24000, channels = 1, bitsPerSample = 16;
  const blockAlign = channels * bitsPerSample / 8;
  const byteRate = sampleRate * blockAlign;
  const out = Buffer.alloc(44 + pcm.length);
  out.write("RIFF", 0); out.writeUInt32LE(36 + pcm.length, 4); out.write("WAVE", 8);
  out.write("fmt ", 12); out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(channels, 22);
  out.writeUInt32LE(sampleRate, 24); out.writeUInt32LE(byteRate, 28); out.writeUInt16LE(blockAlign, 32); out.writeUInt16LE(bitsPerSample, 34);
  out.write("data", 36); out.writeUInt32LE(pcm.length, 40); pcm.copy(out, 44);
  return out;
}

export function normalizeProvider(name) {
  return String(name || process.env.AI_DEFAULT_PROVIDER || "google").toLowerCase();
}
