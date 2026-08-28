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
const continueOnError = flag("continue-on-error");
const provider = value("provider", process.env.AI_DEFAULT_PROVIDER || "google");
const categoriesArg = value("categories", "animals,vegetables,fruits");
const categories = categoriesArg === "all" ? null : categoriesArg.split(",").map(x => x.trim()).filter(Boolean);
const perCategory = Number(value("per-category", "10"));
const kinds = new Set(value("audio-kinds", "question,success,retry").split(",").map(x => x.trim()).filter(Boolean));
const voiceModes = new Set(value("voice-modes", "bilingual").split(",").map(x => x.trim()).filter(Boolean));
const doImages = !flag("audio-only");
const doAudio = flag("audio") || flag("audio-only");
const qa = !flag("no-qa") && provider === "google";
const maxImageAttempts = Number(value("image-attempts", "3"));
const pauseMs = Number(value("pause-ms", "1200"));

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function retryDelay(text, attempt) {
  const seconds = text.match(/retry in\s+([\d.]+)s/i)?.[1];
  if (seconds) return Math.min(65000, Math.ceil(Number(seconds) * 1000) + 750);
  if (/\(429\)|rate|quota/i.test(text)) return Math.max(6500, Math.min(65000, 6500 * attempt));
  return Math.min(20000, 1800 * 2 ** (attempt - 1));
}
async function withRetry(fn, label, tries = 4) {
  let last;
  for (let attempt = 1; attempt <= tries; attempt++) {
    try { return await fn(); }
    catch (error) {
      last = error;
      const text = String(error?.message || error);
      const retryable = /\(429\)|\(5\d\d\)|rate|quota|temporar|unavailable/i.test(text);
      if (!retryable || attempt === tries) throw error;
      const wait = retryDelay(text, attempt);
      console.warn(`[retry ${attempt}/${tries}] ${label}; waiting ${wait}ms`);
      await sleep(wait);
    }
  }
  throw last;
}

const content = await loadContent(root);
const priority = JSON.parse(await readFile(path.join(root, "config/generation/priority-v1.json"), "utf8"));
const imageDir = path.join(root, "public/assets/generated/images");
const audioDir = path.join(root, "public/assets/generated/audio");
await mkdir(imageDir, { recursive: true });
await mkdir(audioDir, { recursive: true });

const allById = new Map(content.items.map(item => [item.id, item]));
const requestedCategories = categories || Object.keys(priority.categories);
const selected = [];
for (const category of requestedCategories) {
  const ids = priority.categories[category] || content.items.filter(x => x.category === category).map(x => x.id);
  selected.push(...ids.map(id => allById.get(id)).filter(Boolean).slice(0, perCategory));
}

const subjectDescriptions = {
  dog:"one friendly domestic dog, whole body", cat:"one friendly domestic cat, whole body", rabbit:"one rabbit, whole body, long ears", cow:"one black-and-white dairy cow, whole body", horse:"one brown horse, whole body", pig:"one pink farm pig, whole body", sheep:"one white woolly sheep, whole body", lion:"one adult lion with a clear mane, whole body", elephant:"one gray elephant, whole body, trunk and large ears visible", bear:"one brown bear, whole body, calm expression",
  tomato:"one ripe red tomato with green calyx", cucumber:"one dark-green cucumber", carrot:"one orange carrot with green leafy top", potato:"one light-brown potato", corn:"one yellow ear of corn with a little green husk", pepper:"one green bell pepper", broccoli:"one green broccoli head", onion:"one golden-yellow onion bulb", eggplant:"one glossy purple eggplant", garlic:"one white garlic bulb",
  apple:"one ripe red apple", banana:"one ripe yellow banana", orange:"one whole orange citrus fruit", pear:"one green pear", grapes:"one small bunch of purple grapes", strawberry:"one ripe red strawberry", watermelon:"one whole green striped watermelon", peach:"one ripe peach", cherries:"a natural pair of red cherries joined by stems", kiwi:"one whole brown fuzzy kiwi",
  cup:"one simple ceramic drinking cup with handle", plate:"one simple round dinner plate", spoon:"one metal eating spoon", fork:"one metal table fork", table:"one simple four-legged dining table", glass:"one clear empty drinking glass", bowl:"one simple eating bowl", pot:"one cooking pot with two handles and no food", pan:"one frying pan with handle and no food", fridge:"one closed household refrigerator",
  toothbrush:"one child toothbrush", toothpaste:"one toothpaste tube", soap:"one bar of soap", towel:"one neatly folded bath towel", shampoo:"one shampoo bottle", comb:"one simple hair comb", sponge:"one yellow cleaning sponge", "toilet-paper":"one roll of toilet paper", hairbrush:"one hair brush", washcloth:"one soft washcloth",
  car:"one ordinary family car", bus:"one city bus", train:"one passenger train locomotive/front car", bicycle:"one standard bicycle", airplane:"one passenger airplane", ship:"one simple passenger ship", truck:"one cargo truck", tractor:"one farm tractor", tram:"one city tram", helicopter:"one helicopter"
};

function imagePrompt(item, correction = "") {
  const subject = subjectDescriptions[item.id] || `${item.labels.de} / ${item.labels.ua}`;
  const animal = item.category === "animals";
  return [
    "Create a premium educational picture card for a child aged 3–7.",
    `SUBJECT: ${subject}.`,
    "It must be instantly recognizable by a young child without reading.",
    "Style: polished friendly high-quality 3D children's illustration, believable proportions and textures, bright natural colors, soft studio light, subtle contact shadow.",
    "Composition: exactly one main subject, centered, large, complete object visible, square 1:1, very light warm cream background, no scene or horizon.",
    animal ? "Animal must have correct natural species anatomy, normal eyes, no clothes, no human pose." : "Keep the object's real characteristic shape and color; no cartoon face, eyes, mouth, arms or legs.",
    "No text, letters, numbers, labels, border, logo, watermark, people, hands, decorative props, duplicate objects, confusing extras or scary details.",
    correction ? `Fix this QA issue: ${correction}` : ""
  ].filter(Boolean).join(" ");
}

const pluralGerman = new Set(["grapes", "cherries"]);
const deQuestion = item => pluralGerman.has(item.id) ? `Wo sind die ${item.labels.de}?` : `Wo ist ${item.article?.de || "die"} ${item.labels.de}?`;
const deThisIs = item => pluralGerman.has(item.id) ? `Das sind die ${item.labels.de}.` : `Das ist ${item.article?.de || "die"} ${item.labels.de}.`;
function deRetry(item) { return pluralGerman.has(item.id) ? `Noch nicht. Suche die ${item.labels.de}.` : `Noch nicht. Suche ${item.article?.de || "die"} ${item.labels.de}.`; }
function audioText(item, kind, mode) {
  const de = kind === "success" ? `Olexander, super! Gut gemacht! ${deThisIs(item)}` : kind === "retry" ? deRetry(item) : deQuestion(item);
  if (mode === "de") return de;
  const ua = kind === "success" ? `Сашка, молодець! Це ${item.labels.ua}.` : kind === "retry" ? `Ще ні. Знайди ${item.labels.ua}.` : `Де ${item.labels.ua}?`;
  return `${de}\n${ua}`;
}

console.log(`Selected ${selected.length}: ${requestedCategories.join(", ")} (${perCategory}/category)`);
console.log(`Images=${doImages} Audio=${doAudio} VoiceModes=${[...voiceModes]} QA=${qa} Provider=${provider}`);
let imageCount=0,audioCount=0,qaRejected=0,failures=0;

for (const item of selected) {
  if (doImages) {
    try {
      const fileName = `${item.id}.jpg`;
      const file = path.join(imageDir, fileName);
      let exists=false; try { await access(file); exists=true; } catch {}
      if (!exists || force) {
        console.log(`[image:${provider}] ${item.category}/${item.id}`);
        if (!dry) {
          let correction="", accepted=null;
          for (let attempt=1; attempt<=maxImageAttempts; attempt++) {
            const generated = await withRetry(() => generateImage({provider,prompt:imagePrompt(item,correction),aspectRatio:"1:1",imageSize:"1K"}), `image ${item.id}`);
            if (!qa) { accepted=generated; break; }
            const review = await withRetry(() => reviewImage({provider,buffer:generated.buffer,mimeType:generated.mimeType,expected:`${subjectDescriptions[item.id] || item.labels.de}; ${item.labels.de}; ${item.labels.ua}`}), `qa ${item.id}`);
            console.log(`  QA ${attempt}: ${review.text.replace(/\s+/g," ").slice(0,200)}`);
            if (review.pass) { accepted=generated; break; }
            qaRejected++; correction=review.text; await sleep(pauseMs);
          }
          if (accepted) { await writeFile(file,accepted.buffer); item.generatedImage=`./assets/generated/images/${fileName}`; imageCount++; }
        }
      } else item.generatedImage=`./assets/generated/images/${fileName}`;
      await sleep(pauseMs);
    } catch(error) {
      failures++; console.error(`[image failed] ${item.id}: ${String(error?.message||error).slice(0,800)}`); if(!continueOnError) throw error;
    }
  }

  if (doAudio) {
    for (const mode of voiceModes) {
      const field = mode === "de" ? "generatedAudioDe" : "generatedAudio";
      item[field] ||= {};
      for (const kind of kinds) {
        try {
          const suffix = mode === "de" ? "de" : "bilingual";
          const fileName = `${item.id}.${kind}.${suffix}.wav`;
          const file = path.join(audioDir,fileName);
          let exists=false; try { await access(file); exists=true; } catch {}
          if (!exists || force) {
            console.log(`[audio:${provider}] ${item.category}/${item.id} ${kind}/${mode}`);
            if (!dry) {
              const language = mode === "de" ? "German de-DE only" : "German de-DE first, then Ukrainian uk-UA";
              const result = await withRetry(() => generateSpeech({provider,text:audioText(item,kind,mode),language,style:"warm, cheerful, caring preschool educator; native pronunciation; clear, natural, slightly playful; medium-slow pace; speak only the transcript"}), `audio ${item.id}/${kind}/${mode}`);
              await writeFile(file,result.buffer); audioCount++;
            }
          }
          item[field][kind]=`./assets/generated/audio/${fileName}`;
          await sleep(pauseMs);
        } catch(error) {
          failures++; console.error(`[audio failed] ${item.id}/${kind}/${mode}: ${String(error?.message||error).slice(0,800)}`); if(!continueOnError) throw error;
        }
      }
    }
  }
}

if (!dry) await saveContentGroups(content);
console.log(`Done. images=${imageCount}; audio=${audioCount}; QA retries=${qaRejected}; failures=${failures}`);
if (dry) console.log("Dry run: no API calls or files were written.");
