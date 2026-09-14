import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateImage, reviewImage, generateSpeech } from '../src/server/providers/google-cloud.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const imageDir = path.join(root, 'public/assets/generated/images');
const audioDir = path.join(root, 'public/assets/generated/audio');
await mkdir(imageDir, { recursive: true });
await mkdir(audioDir, { recursive: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function retry(fn, tries = 5) {
  let last;
  for (let n = 1; n <= tries; n++) {
    try { return await fn(); } catch (e) {
      last = e;
      const text = String(e?.message || e);
      if (n === tries || !/429|rate|5\d\d|unavailable|temporar|resource.exhausted/i.test(text)) throw e;
      await sleep(Math.min(60000, 5000 * n));
    }
  }
  throw last;
}

const cards = [
  {
    file: 'igel.png', expected: 'a friendly European hedgehog',
    subject: 'one friendly European hedgehog, whole body, unmistakable small hedgehog shape, natural brown spines, cute but realistic face, standing on four feet'
  },
  {
    file: 'uhr.png', expected: 'a simple analog wall clock',
    subject: 'one simple child-friendly analog wall clock, round face, clear black hour and minute hands, large simple tick marks, no numerals and absolutely no text, unmistakably a clock'
  }
];

function prompt(subject) {
  return [
    'Create a premium hero picture card for a beloved learning game for a child aged 3 to 7.',
    `SUBJECT: ${subject}.`,
    'The child must recognize the object instantly.',
    'Polished high-end 3D children educational illustration with believable materials and truthful proportions.',
    'Exactly one centered dominant subject, very large, complete silhouette visible, square 1:1.',
    'Seamless very-light warm cream to soft pastel gradient background, subtle glow, no room, no landscape, no clutter.',
    'Soft cinematic studio light, gentle rim light, crisp readable form, tiny contact shadow.',
    'No text, letters, numbers, labels, logos, watermark, people, hands, decorative props, duplicates, scary details or cropped parts.'
  ].join(' ');
}

for (const card of cards) {
  let accepted = null;
  let correction = '';
  for (let attempt = 1; attempt <= 3; attempt++) {
    const p = `${prompt(card.subject)} ${correction}`.trim();
    const result = await retry(() => generateImage({ prompt: p, aspectRatio: '1:1', imageSize: '1K' }));
    const review = await retry(() => reviewImage({ buffer: result.buffer, mimeType: result.mimeType, expected: card.expected }), 3);
    console.log(card.file, attempt, review.text);
    if (review.pass) { accepted = result; break; }
    correction = `Previous attempt failed QA: ${review.text}. Fix it decisively.`;
  }
  if (!accepted) throw new Error(`Failed strict QA for ${card.file}`);
  await writeFile(path.join(imageDir, card.file), accepted.buffer);
}

const style = 'warm, friendly, clear native German kindergarten teacher; calm and encouraging; natural smile; pronounce the first vowel U clearly and hold it very slightly, then make a short audible pause before the phrase; premium educational audio; no singing, no exaggerated cartoon voice, no background sound';
const uSuccess = await retry(() => generateSpeech({ text: 'U. U wie Uhr.', voice: 'Leda', language: 'de-DE', style }));
await writeFile(path.join(audioDir, 'letter-u.success.de.wav'), uSuccess.buffer);

const modulePath = path.join(root, 'public/letters-module.js');
let source = await readFile(modulePath, 'utf8');
source = source
  .replace("{ letter:'I', word:'Igel', ua:'їжак', image:null }", "{ letter:'I', word:'Igel', ua:'їжак', image:'./assets/generated/images/igel.png' }")
  .replace("{ letter:'U', word:'Uhu', ua:'пугач', image:null }", "{ letter:'U', word:'Uhr', ua:'годинник', image:'./assets/generated/images/uhr.png' }");
if (!source.includes("word:'Uhr'") || !source.includes('igel.png')) throw new Error('letters-module patch failed');
await writeFile(modulePath, source);
console.log('Generated Igel + Uhr anchors, regenerated U success voice, and patched letters module.');
