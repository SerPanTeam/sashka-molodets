import { expectOk, findBase64Payload, pcm16Mono24kToWav } from "./utils.mjs";

const endpoint = "https://generativelanguage.googleapis.com/v1beta/interactions";
function key() {
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not configured");
  return process.env.GEMINI_API_KEY;
}
export function status() {
  return {
    configured: Boolean(process.env.GEMINI_API_KEY),
    imageModel: process.env.GOOGLE_IMAGE_MODEL || "gemini-3.1-flash-image",
    ttsModel: process.env.GOOGLE_TTS_MODEL || "gemini-3.1-flash-tts-preview"
  };
}
export async function generateImage({ prompt, aspectRatio = "1:1", imageSize = "1K", model = process.env.GOOGLE_IMAGE_MODEL || "gemini-3.1-flash-image" }) {
  if (!prompt) throw new Error("prompt is required");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "x-goog-api-key": key(), "Content-Type": "application/json" },
    body: JSON.stringify({ model, input: prompt, response_format: { type: "image", mime_type: "image/png", aspect_ratio: aspectRatio, image_size: imageSize } })
  });
  await expectOk(response, "Google Gemini image");
  const data = await response.json();
  const payload = findBase64Payload(data, "image");
  if (!payload) throw new Error("Google image response did not contain image data");
  return { buffer: Buffer.from(payload.data, "base64"), mimeType: payload.mimeType || "image/png" };
}
export async function generateSpeech({ text, voice = process.env.GOOGLE_TTS_VOICE || "Kore", language, style = "warm, cheerful, patient teacher speaking clearly to a young child", model = process.env.GOOGLE_TTS_MODEL || "gemini-3.1-flash-tts-preview" }) {
  if (!text) throw new Error("text is required");
  const languageHint = language ? ` Language/locale: ${language}.` : "";
  const input = `Synthesize speech only. Do not read these directions aloud. Voice direction: ${style}.${languageHint}\nTRANSCRIPT:\n${text}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "x-goog-api-key": key(), "Content-Type": "application/json" },
    body: JSON.stringify({ model, input, response_format: { type: "audio" }, generation_config: { speech_config: [{ voice }] } })
  });
  await expectOk(response, "Google Gemini TTS");
  const data = await response.json();
  const payload = findBase64Payload(data, "audio");
  if (!payload) throw new Error("Google TTS response did not contain audio data");
  const raw = Buffer.from(payload.data, "base64");
  const mime = String(payload.mimeType || "").toLowerCase();
  if (mime.includes("wav")) return { buffer: raw, mimeType: "audio/wav" };
  return { buffer: pcm16Mono24kToWav(raw), mimeType: "audio/wav" };
}
