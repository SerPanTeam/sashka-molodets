import { expectOk, findBase64Payload, pcm16Mono24kToWav } from "./utils.mjs";

const project = () => process.env.GOOGLE_CLOUD_PROJECT || "project-a095a9ee-fc31-43e4-9f8";
const imageLocation = () => process.env.GOOGLE_IMAGE_LOCATION || "global";
const ttsLocation = () => process.env.GOOGLE_TTS_LOCATION || "global";
const visionLocation = () => process.env.GOOGLE_VISION_LOCATION || "global";

function token() {
  const value = process.env.GOOGLE_OAUTH_ACCESS_TOKEN || process.env.CLOUDSDK_AUTH_ACCESS_TOKEN || "";
  if (!value) throw new Error("GOOGLE_OAUTH_ACCESS_TOKEN is not configured; authenticate with google-github-actions/auth@v3");
  return value;
}

const authHeaders = () => ({
  Authorization: `Bearer ${token()}`,
  "Content-Type": "application/json",
  "x-goog-user-project": project(),
});

function modelUrl({ model, location = "global", apiVersion = "v1" }) {
  return `https://aiplatform.googleapis.com/${apiVersion}/projects/${encodeURIComponent(project())}/locations/${encodeURIComponent(location)}/publishers/google/models/${encodeURIComponent(model)}:generateContent`;
}

function findText(value) {
  if (!value || typeof value !== "object") return "";
  if (typeof value.text === "string") return value.text;
  for (const child of Object.values(value)) {
    if (child && typeof child === "object") {
      const found = findText(child);
      if (found) return found;
    }
  }
  return "";
}

export function status() {
  return {
    configured: Boolean(process.env.GOOGLE_OAUTH_ACCESS_TOKEN || process.env.CLOUDSDK_AUTH_ACCESS_TOKEN),
    project: project(),
    imageModel: process.env.GOOGLE_IMAGE_MODEL || "gemini-3.1-flash-image",
    visionModel: process.env.GOOGLE_VISION_MODEL || "gemini-3.5-flash",
    ttsModel: process.env.GOOGLE_TTS_MODEL || "gemini-2.5-flash-tts",
  };
}

export async function generateImage({
  prompt,
  aspectRatio = "1:1",
  imageSize = "1K",
  model = process.env.GOOGLE_IMAGE_MODEL || "gemini-3.1-flash-image",
}) {
  if (!prompt) throw new Error("prompt is required");
  const response = await fetch(modelUrl({ model, location: imageLocation(), apiVersion: "v1" }), {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"],
        imageConfig: { aspectRatio, imageSize },
      },
    }),
  });
  await expectOk(response, "Google Cloud Vertex image");
  const data = await response.json();
  const payload = findBase64Payload(data, "image");
  if (!payload) throw new Error(`Vertex image response did not contain image data: ${JSON.stringify(data).slice(0, 900)}`);
  return { buffer: Buffer.from(payload.data, "base64"), mimeType: payload.mimeType || "image/png", source: "vertex-ai" };
}

export async function reviewImage({
  buffer,
  mimeType = "image/png",
  expected,
  model = process.env.GOOGLE_VISION_MODEL || "gemini-3.5-flash",
}) {
  if (!buffer?.length) throw new Error("image buffer is required");
  const instruction = [
    "You are the strict art director for a premium picture-learning game for children aged 3 to 7.",
    `Expected subject: ${expected}.`,
    "The subject must be instantly recognizable by a preschool child.",
    "Require: one dominant subject, clean silhouette, vivid appetizing/natural colors, friendly premium 3D illustration, believable proportions, uncluttered background, no text, no watermark, no scary or anatomically strange details.",
    "Reject dull, muddy, generic, malformed, ambiguous, over-detailed, visually confusing or low-quality images.",
    "Reply first line exactly PASS or FAIL. Second line: one short reason.",
  ].join(" ");
  const response = await fetch(modelUrl({ model, location: visionLocation(), apiVersion: "v1" }), {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      contents: [{ role: "user", parts: [
        { text: instruction },
        { inlineData: { mimeType, data: buffer.toString("base64") } },
      ] }],
      generationConfig: { responseModalities: ["TEXT"], temperature: 0.1 },
    }),
  });
  await expectOk(response, "Google Cloud Vertex image QA");
  const data = await response.json();
  const text = findText(data).trim();
  return { pass: /^PASS\b/i.test(text), text };
}

function languageCode(language = "") {
  const text = String(language).toLowerCase();
  if (text.includes("uk") || text.includes("ukrain")) return "uk-UA";
  return "de-DE";
}

export async function generateSpeech({
  text,
  voice = process.env.GOOGLE_TTS_VOICE || "Leda",
  language,
  style = "joyful, warm, playful preschool game host; smiling voice; expressive and affectionate; short natural pauses; slightly amused; crystal-clear pronunciation; never robotic, never babyish, never shouting",
  model = process.env.GOOGLE_TTS_MODEL || "gemini-2.5-flash-tts",
}) {
  if (!text) throw new Error("text is required");
  const locale = languageCode(language);
  const direction = [
    "Speak only the transcript; do not add or remove words.",
    `Voice direction: ${style}.`,
    "Imagine you are playing a favorite little game with one child and genuinely enjoying their progress.",
    locale === "uk-UA" ? "Use natural native Ukrainian pronunciation." : "Use natural native German pronunciation.",
    `TRANSCRIPT: ${text}`,
  ].join(" ");
  const response = await fetch(modelUrl({ model, location: ttsLocation(), apiVersion: "v1beta1" }), {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: direction }] }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          languageCode: locale,
          voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } },
        },
      },
    }),
  });
  await expectOk(response, "Google Cloud Gemini TTS");
  const data = await response.json();
  const payload = findBase64Payload(data, "audio");
  if (!payload) throw new Error(`Vertex TTS response did not contain audio data: ${JSON.stringify(data).slice(0, 900)}`);
  const raw = Buffer.from(payload.data, "base64");
  const mime = String(payload.mimeType || "").toLowerCase();
  if (mime.includes("wav")) return { buffer: raw, mimeType: "audio/wav", source: "vertex-ai" };
  return { buffer: pcm16Mono24kToWav(raw), mimeType: "audio/wav", source: "vertex-ai" };
}
