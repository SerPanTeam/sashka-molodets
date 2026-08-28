import { expectOk } from "./utils.mjs";
function key() {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");
  return process.env.OPENAI_API_KEY;
}
export function status() {
  return {
    configured: Boolean(process.env.OPENAI_API_KEY),
    imageModel: process.env.OPENAI_IMAGE_MODEL || "gpt-image-2",
    ttsModel: process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts"
  };
}
export async function generateImage({ prompt, size = "1024x1024", quality = "medium", model = process.env.OPENAI_IMAGE_MODEL || "gpt-image-2" }) {
  if (!prompt) throw new Error("prompt is required");
  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { "Authorization": `Bearer ${key()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, prompt, size, quality, output_format: "png" })
  });
  await expectOk(response, "OpenAI image");
  const data = await response.json();
  const b64 = data?.data?.[0]?.b64_json;
  if (!b64) throw new Error("OpenAI image response did not contain b64_json");
  return { buffer: Buffer.from(b64, "base64"), mimeType: "image/png" };
}
export async function generateSpeech({ text, voice = process.env.OPENAI_TTS_VOICE || "coral", style = "Speak warmly, cheerfully, patiently, and clearly to a young child.", model = process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts" }) {
  if (!text) throw new Error("text is required");
  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { "Authorization": `Bearer ${key()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, voice, input: text, instructions: style, response_format: "mp3" })
  });
  await expectOk(response, "OpenAI TTS");
  return { buffer: Buffer.from(await response.arrayBuffer()), mimeType: "audio/mpeg" };
}
