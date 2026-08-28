import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const json = async p => JSON.parse(await readFile(path.join(root, p), 'utf8'));
const exists = async p => { try { await access(path.join(root, p)); return true; } catch { return false; } };
const stripDot = p => String(p || '').replace(/^\.\//, '');

const manifest = await json('content/content.json');
const groups = await Promise.all(manifest.categoryFiles.map(p => json(`content/${p}`)));
const items = groups.flatMap(group => group.items || []);
const byId = new Map(items.map(item => [item.id, item]));
const priority = await json('config/generation/priority-v1.json');
const ids = Object.values(priority.categories).flat();

const errors = [];
const incomplete = [];
let readyCount = 0;

for (const id of ids) {
  const item = byId.get(id);
  if (!item) { incomplete.push(`${id}: missing content item`); continue; }
  const required = [
    ['image', item.generatedImage],
    ['DE question', item.generatedAudioDe?.question],
    ['DE success', item.generatedAudioDe?.success],
    ['UA question', item.generatedAudioUa?.question],
    ['UA success', item.generatedAudioUa?.success]
  ];
  let ready = true;
  for (const [label, ref] of required) {
    if (!ref) { incomplete.push(`${id}: missing ${label} reference`); ready = false; continue; }
    const file = path.posix.join('public', stripDot(ref));
    if (!(await exists(file))) { incomplete.push(`${id}: missing ${label} file ${file}`); ready = false; }
  }
  if (ready) readyCount++;
}

const app = await readFile(path.join(root, 'public/app.js'), 'utf8');
const index = await readFile(path.join(root, 'public/index.html'), 'utf8');
const shim = await readFile(path.join(root, 'public/pages-shim.js'), 'utf8');
const bridge = await readFile(path.join(root, 'public/audio-bridge.js'), 'utf8');
const sfx = await readFile(path.join(root, 'public/object-sfx.js'), 'utf8');

if (/\bAlexander,\s*(?:super|noch nicht)/.test(app)) errors.push('app.js still contains legacy Alexander praise/prompt');
if (!app.includes('Olexander, super!')) errors.push('app.js missing Olexander success praise');
if (!app.includes('await playApplause()')) errors.push('correct-answer flow does not await applause');
if (!app.includes('await window.SashkaSfx.play(t.id)')) errors.push('correct-answer flow does not await object SFX');
if (!index.includes('object-sfx.js')) errors.push('index.html does not load object-sfx.js');
if (!index.includes('audio-bridge.js')) errors.push('index.html does not load audio-bridge.js');
if (!shim.includes("voiceMode: oldSettingsVersion < 3 ? 'dual'")) errors.push('bilingual settings migration missing');
if (!shim.includes('physicalAssetsExist')) errors.push('production shim does not verify physical asset existence');
if (!bridge.includes('window.Audio = BridgedAudio')) errors.push('shared recorded-audio bridge missing');
if (!sfx.includes('window.SashkaSfx')) errors.push('object SFX runtime missing');
if (ids.length !== 60) errors.push(`priority list expected 60 items, got ${ids.length}`);
if (readyCount < 1) errors.push('no production-ready priority cards remain');

if (incomplete.length) {
  console.warn(`Production completeness: ${readyCount}/${ids.length} priority cards physically ready.`);
  for (const warning of incomplete) console.warn(`WARN: ${warning}`);
} else {
  console.log(`Production completeness: ${readyCount}/${ids.length} priority cards physically ready.`);
}

if (errors.length) {
  console.error(`Production runtime validation FAILED (${errors.length})`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('Production runtime validation OK: safe filtering, Olexander, bilingual migration, shared audio bridge, applause → SFX sequencing.');
