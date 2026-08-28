import { expectOk, findBase64Payload, pcm16Mono24kToWav } from "./utils.mjs";

const endpoint = "https://generativelanguage.googleapis.com/v1beta/interactions";
const vertexExpressBase = "https://aiplatform.googleapis.com/v1/publishers/google/models";

const headers = () => ({
  "x-goog-api-key": key(),
  "Content-Type": "application/json",
  "Api-Revision": "2026-05-20",
});

function key() {
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not configured");
  return process.env.GEMINI_API_KEY;
}

function vertexExpressKey() {
  return process.env.VERTEX_API_KEY || process.env.GOOGLE_CLOUD_API_KEY || "";
}

function findText(value) {
  if (!value || typeof value !== "object") return "";
  if (value.type === "text" && typeof value.text === "string") return value.text;
  for (const child of Object.values(value)) {
    if (child && typeof child === "object") {
      const found = findText(child);
      if (found) return found;
    }
  }
  return "";
}

async function generateImageViaVertexExpress({ prompt, aspectRatio, imageSize, model }) {
  const apiKey = vertexExpressKey();
  if (!apiKey) throw new Error("VERTEX_API_KEY is not configured");
  const response = await fetch(`${vertexExpressBase}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "USER", parts: [{ text: prompt }] }],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"],
        imageConfig: {
          aspectRatio,
          imageSize,
        },
      },
    }),
  });
  await expectOk(response, "Google Vertex Express image");
  const data = await response.json();
  const payload = findBase64Payload(data, "image");
  if (!payload) throw new Error("Vertex Express image response did not contain image data");
  return { buffer: Buffer.from(payload.data, "base64"), mimeType: payload.mimeType || "image/png", source: "vertex-express" };
}

export function status() {
  return {
    configured: Boolean(process.env.GEMINI_API_KEY),
    vertexExpressConfigured: Boolean(vertexExpressKey()),
    imageModel: process.env.GOOGLE_IMAGE_MODEL || "gemini-3.1-flash-image",
    visionModel: process.env.GOOGLE_VISION_MODEL || "gemini-3.6-flash",
    ttsModel: process.env.GOOGLE_TTS_MODEL || "gemini-3.1-flash-tts-preview",
  };
}

export async function generateImage({
  prompt,
  aspectRatio = "1:1",
  imageSize = "1K",
  model = process.env.GOOGLE_IMAGE_MODEL || "gemini-3.1-flash-image",
}) {
  if (!prompt) throw new Error("prompt is required");

  // Prefer Google Cloud Vertex/Agent Platform Express for image generation when
  // a dedicated Cloud API key is configured. This lets TTS stay on AI Studio
  // while image generation uses Cloud billing / Express quotas.
  if (vertexExpressKey()) {
    return generateImageViaVertexExpress({ prompt, aspectRatio, imageSize, model });
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      model,
      input: prompt,
      response_format: {
        type: "image",
        mime_type: "image/jpeg",
        aspect_ratio: aspectRatio,
        image_size: imageSize,
      },
    }),
  });
  await expectOk(response, "Google Gemini image");
  const data = await response.json();
  const payload = findBase64Payload(data, "image");
  if (!payload) throw new Error("Google image response did not contain image data");
  return { buffer: Buffer.from(payload.data, "base64"), mimeType: payload.mimeType || "image/jpeg", source: "gemini-api" };
}

export async function reviewImage({
  buffer,
  mimeType = "image/jpeg",
  expected,
  model = process.env.GOOGLE_VISION_MODEL || "gemini-3.6-flash",
}) {
  if (!buffer?.length) throw new Error("image buffer is required");
  const instruction = [
    "You are a strict QA reviewer for picture cards used by young children.",
    `Expected subject: ${expected}.`,
    "Check that the image clearly and unmistakably shows the expected subject as the main object.",
    "It must contain one clear educational subject (natural small groups are allowed only when inherent, e.g. grapes/cherries), the full subject must be visible, with no text, logos, watermarks, confusing extra objects, scary features, anatomical nonsense, or misleading colors/shapes.",
    "The picture must be immediately recognizable by a child without reading.",
    "Reply on the first line with exactly PASS or FAIL. On the second line give a very short reason.",
  ].join(" ");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      model,
      input: [
        { type: "text", text: instruction },
        { type: "image", mime_type: mimeType, data: buffer.toString("base64") },
      ],
    }),
  });
  await expectOk(response, "Google Gemini image QA");
  const data = await response.json();
  const text = findText(data).trim();
  return { pass: /^PASS\b/i.test(text), text };
}

export async function generateSpeech({
  text,
  voice = process.env.GOOGLE_TTS_VOICE || "Kore",
  language,
  style = "warm, cheerful, patient preschool teacher; natural, friendly and expressive; clear articulation; relaxed pace; never robotic or exaggerated",
  model = process.env.GOOGLE_TTS_MODEL || "gemini-3.1-flash-tts-preview",
}) {
  if (!text) throw new Error("text is required");
  const languageHint = language ? ` Language/locale: ${language}.` : "";
  const input = `Synthesize speech only. Do not read these directions aloud. Voice direction: ${style}.${languageHint}\nTRANSCRIPT:\n${text}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      model,
      input,
      response_format: { type: "audio" },
      generation_config: { speech_config: [{ voice }] },
    }),
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
