import { writeFile, mkdir, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "../src/server/load-env.mjs";
import { loadContent, saveContentGroups } from "../src/server/content.mjs";
import { generateImage, generateSpeech } from "../src/server/providers/registry.mjs";

loadEnv();
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = new Set(process.argv.slice(2));
const dry = args.has("--dry-run");
const audio = args.has("--audio");
const images = !args.has("--audio-only");
const provider = process.argv.find((x) => x.startsWith("--provider="))?.split("=")[1] || process.env.AI_DEFAULT_PROVIDER || "google";
const limit = Number(process.argv.find((x) => x.startsWith("--limit="))?.split("=")[1] || Infinity);
const content = await loadContent(root);
const imageDir = path.join(root, "public/assets/generated/images");
const audioDir = path.join(root, "public/assets/generated/audio");
await mkdir(imageDir, { recursive: true });
await mkdir(audioDir, { recursive: true });

const style = "Single educational object illustration for a young child. Friendly premium children's picture-book style, simple clean silhouette, rounded shapes, vivid natural colors. One object only, centered, full object visible, isolated on a very light warm background. No text, no letters, no numbers, no border, no watermark, no extra props, no hands, no people. Consistent studio lighting and visual style across the whole dataset. Square composition.";
let made = 0;
for (const item of content.items) {
  if (made >= limit) break;
  if (!images || ["colors", "numbers", "shapes"].includes(item.category)) continue;
  const file = path.join(imageDir, `${item.id}.png`);
  try { await access(file); continue; } catch {}
  console.log(`[image:${provider}] ${item.id}`);
  if (!dry) {
    const r = await generateImage({ provider, prompt: `${style} Subject: ${item.labels.de} (${item.labels.ua}). Category: ${item.category}.`, aspectRatio: "1:1", imageSize: "1K", size: "1024x1024" });
    await writeFile(file, r.buffer);
    item.generatedImage = `/assets/generated/images/${item.id}.png`;
  }
  made++;
}
if (!dry && images) await saveContentGroups(content);

if (audio) {
  let n = 0;
  for (const item of content.items) {
    for (const [lang, locale] of [["de", "de-DE"], ["ua", "uk-UA"]]) {
      if (n >= limit) break;
      const text = lang === "de" ? `Wo ist ${item.article?.de || "die"} ${item.labels.de}?` : `Де ${item.labels.ua}?`;
      const ext = provider === "openai" ? "mp3" : "wav";
      const file = path.join(audioDir, `${item.id}.question.${lang}.${ext}`);
      try { await access(file); continue; } catch {}
      console.log(`[audio:${provider}] ${item.id} ${lang}`);
      if (!dry) {
        const r = await generateSpeech({ provider, text, language: locale });
        await writeFile(file, r.buffer);
      }
      n++;
    }
    if (n >= limit) break;
  }
}
if (dry) console.log("Dry run: no API calls were made. Remove --dry-run to generate assets.");
