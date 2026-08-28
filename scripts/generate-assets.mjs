import { writeFile, mkdir, access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "../src/server/load-env.mjs";
import { loadContent, saveContentGroups } from "../src/server/content.mjs";
import { generateImage, generateSpeech, reviewImage } from "../src/server/providers/registry.mjs";

loadEnv();
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const flag = name => argv.includes(`--${name}`);
const value = (name, fallback) => argv.find(x => x.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const dry = flag("dry-run");
const force = flag("force");
const provider = value("provider", process.env.AI_DEFAULT_PROVIDER || "google");
const categoriesArg = value("categories", "animals,vegetables,fruits");
const categories = categoriesArg === "all" ? null : categoriesArg.split(",").map(x => x.trim()).filter(Boolean);
const perCategory = Number(value("per-category", "10"));
const kinds = new Set(value("audio-kinds", "question,success,retry").split(",").map(x => x.trim()).filter(Boolean));
const doImages = !flag("audio-only");
const doAudio = flag("audio") || flag("audio-only");
const qa = !flag("no-qa") && provider === "google";
const maxImageAttempts = Number(value("image-attempts", "3"));
const pauseMs = Number(value("pause-ms", "650"));

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function withRetry(fn, label, tries = 5) {
  let last;
  for (let attempt = 1; attempt <= tries; attempt++) {
    try { return await fn(); }
    catch (error) {
      last = error;
      const text = String(error?.message || error);
      const retryable = /\(429\)|\(5\d\d\)|rate|quota|temporar|unavailable/i.test(text);
      if (!retryable || attempt === tries) throw error;
      const wait = Math.min(20000, 1800 * 2 ** (attempt - 1));
      console.warn(`[retry ${attempt}/${tries}] ${label}: ${text.slice(0, 180)}; waiting ${wait}ms`);
      await sleep(wait);
    }
  }
  throw last;
}

const content = await loadContent(root);
const priorityPath = path.join(root, "config/generation/priority-v1.json");
const priority = JSON.parse(await readFile(priorityPath, "utf8"));
const imageDir = path.join(root, "public/assets/generated/images");
const audioDir = path.join(root, "public/assets/generated/audio");
await mkdir(imageDir, { recursive: true });
await mkdir(audioDir, { recursive: true });

const allById = new Map(content.items.map(item => [item.id, item]));
const requestedCategories = categories || Object.keys(priority.categories);
const selected = [];
for (const category of requestedCategories) {
  const ids = priority.categories[category] || content.items.filter(x => x.category === category).map(x => x.id);
  const items = ids.map(id => allById.get(id)).filter(Boolean).slice(0, perCategory);
  selected.push(...items);
}

const subjectDescriptions = {
  dog: "one friendly domestic dog, whole body, natural canine anatomy",
  cat: "one friendly domestic cat, whole body, natural feline anatomy",
  rabbit: "one rabbit/hare, whole body, long ears, natural anatomy",
  cow: "one black-and-white dairy cow, whole body, natural anatomy",
  horse: "one brown horse, whole body, natural anatomy",
  pig: "one pink farm pig, whole body, natural anatomy",
  sheep: "one white woolly sheep, whole body, natural anatomy",
  lion: "one adult lion with a clear mane, whole body, natural anatomy, friendly neutral expression",
  elephant: "one gray elephant, whole body, trunk and large ears clearly visible, natural anatomy",
  bear: "one brown bear, whole body, natural anatomy, calm neutral expression",
  tomato: "one ripe red tomato with a small green calyx",
  cucumber: "one fresh dark-green cucumber, elongated shape",
  carrot: "one orange carrot with a short fresh green leafy top",
  potato: "one ordinary light-brown potato tuber",
  corn: "one yellow ear of sweet corn with a little green husk",
  pepper: "one fresh green bell pepper, classic blocky bell-pepper shape",
  broccoli: "one green broccoli head with a short thick stalk",
  onion: "one golden-yellow onion bulb with papery skin",
  eggplant: "one glossy deep-purple eggplant with green calyx",
  garlic: "one white garlic bulb with distinct cloves under the skin",
  apple: "one ripe red apple with a small stem and one green leaf",
  banana: "one ripe yellow banana, gently curved",
  orange: "one whole ripe orange citrus fruit",
  pear: "one ripe green pear with classic pear shape and a small stem",
  grapes: "one small bunch of purple grapes on a stem",
  strawberry: "one ripe red strawberry with green leafy cap and visible seeds",
  watermelon: "one whole green striped watermelon, round-to-oval shape",
  peach: "one ripe peach with soft orange-pink skin and a small leaf",
  cherries: "a natural pair of ripe red cherries joined by stems",
  kiwi: "one whole brown fuzzy kiwi fruit, oval shape",
};

function imagePrompt(item, correction = "") {
  const subject = subjectDescriptions[item.id] || `${item.labels.de} / ${item.labels.ua}`;
  const produce = ["vegetables", "fruits"].includes(item.category);
  return [
    "Create a premium educational picture card for a child aged about 3–7.",
    `SUBJECT: ${subject}.`,
    "The subject must be instantly recognizable without any text.",
    "Visual style: polished friendly high-quality 3D children's illustration, believable natural proportions and textures, bright clean colors, soft studio light, subtle soft contact shadow.",
    "Composition: exactly one main subject centered, large, full subject visible, comfortable margin, square 1:1, very light warm cream background, no scene and no horizon.",
    produce ? "For food/produce: absolutely no cartoon face, eyes, mouth, arms or legs; keep the real characteristic shape and natural color." : "For animals: natural species anatomy, four limbs only when appropriate, normal eyes, no clothing, no human pose, no exaggerated cartoon anatomy.",
    "No text, letters, numbers, labels, border, logo, watermark, hands, people, toys, tableware, extra food, decorative props, duplicate subject, or confusing objects.",
    "Optimize for visual discrimination in a preschool matching game: clear silhouette, distinctive defining features, uncluttered image.",
    correction ? `Previous QA correction to address: ${correction}` : "",
  ].filter(Boolean).join(" ");
}

function isPluralGerman(item) { return ["grapes", "cherries"].includes(item.id); }
function questionText(item) {
  return `Wo ist ${item.article?.de || "die"} ${item.labels.de}?  [short pause]  Де ${item.labels.ua}?`;
}
function successText(item) {
  const de = isPluralGerman(item) ? `Super! Das sind die ${item.labels.de}.` : `Super! Das ist ${item.article?.de || "die"} ${item.labels.de}.`;
  return `${de}  [short pause]  Молодець! Це ${item.labels.ua}.`;
}
function retryText(item) {
  return `Noch nicht. Suche ${item.article?.de || "die"} ${item.labels.de}.  [short pause]  Ще ні. Знайди ${item.labels.ua}.`;
}
function audioText(item, kind) {
  if (kind === "success") return successText(item);
  if (kind === "retry") return retryText(item);
  return questionText(item);
}

console.log(`Selected ${selected.length} items: ${requestedCategories.join(", ")} (${perCategory}/category)`);
console.log(`Images=${doImages} Audio=${doAudio} QA=${qa} Provider=${provider} Dry=${dry}`);

let imageCount = 0, audioCount = 0, qaRejected = 0;
for (const item of selected) {
  if (doImages) {
    const file = path.join(imageDir, `${item.id}.png`);
    let exists = false;
    try { await access(file); exists = true; } catch {}
    if (!exists || force) {
      console.log(`[image:${provider}] ${item.category}/${item.id}`);
      if (!dry) {
        let correction = "";
        let accepted = null;
        for (let attempt = 1; attempt <= maxImageAttempts; attempt++) {
          const generated = await withRetry(() => generateImage({
            provider,
            prompt: imagePrompt(item, correction),
            aspectRatio: "1:1",
            imageSize: "1K",
            size: "1024x1024",
          }), `image ${item.id}`);
          if (!qa) { accepted = generated; break; }
          const review = await withRetry(() => reviewImage({
            provider,
            buffer: generated.buffer,
            mimeType: generated.mimeType,
            expected: `${subjectDescriptions[item.id] || item.labels.de}; German label ${item.labels.de}; Ukrainian label ${item.labels.ua}`,
          }), `qa ${item.id}`);
          console.log(`  QA attempt ${attempt}: ${review.text.replace(/\s+/g, " ").slice(0, 220)}`);
          if (review.pass) { accepted = generated; break; }
          qaRejected++;
          correction = review.text;
          await sleep(pauseMs);
        }
        if (accepted) {
          await writeFile(file, accepted.buffer);
          item.generatedImage = `/assets/generated/images/${item.id}.png`;
          imageCount++;
        } else {
          console.warn(`  SKIP ${item.id}: image failed QA after ${maxImageAttempts} attempts; emoji fallback will remain.`);
        }
      }
      await sleep(pauseMs);
    } else if (!item.generatedImage) {
      item.generatedImage = `/assets/generated/images/${item.id}.png`;
    }
  }

  if (doAudio) {
    item.generatedAudio ||= {};
    for (const kind of kinds) {
      const fileName = `${item.id}.${kind}.bilingual.wav`;
      const file = path.join(audioDir, fileName);
      let exists = false;
      try { await access(file); exists = true; } catch {}
      if (!exists || force) {
        console.log(`[audio:${provider}] ${item.category}/${item.id} ${kind}`);
        if (!dry) {
          const result = await withRetry(() => generateSpeech({
            provider,
            text: audioText(item, kind),
            language: "German de-DE first, then Ukrainian uk-UA",
            style: "warm, cheerful, caring preschool educator; native-sounding pronunciation in each language; clear and natural; slightly playful but not theatrical; medium-slow pace; insert a short natural pause when switching from German to Ukrainian; speak the transcript only",
          }), `audio ${item.id}/${kind}`);
          await writeFile(file, result.buffer);
          audioCount++;
        }
        await sleep(pauseMs);
      }
      item.generatedAudio[kind] = `/assets/generated/audio/${fileName}`;
    }
  }
}

if (!dry) await saveContentGroups(content);
console.log(`Done. New images=${imageCount}; new audio=${audioCount}; QA rejections/regenerations=${qaRejected}.`);
if (dry) console.log("Dry run: no API calls or files were written. Remove --dry-run to generate assets.");
