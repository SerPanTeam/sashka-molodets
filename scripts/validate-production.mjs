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
    ['DE wrong', item.generatedAudioDe?.wrong],
    ['DE retry', item.generatedAudioDe?.retry],
    ['UA question', item.generatedAudioUa?.question],
    ['UA success', item.generatedAudioUa?.success],
    ['UA wrong', item.generatedAudioUa?.wrong],
    ['UA retry', item.generatedAudioUa?.retry]
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
const localSfx = await readFile(path.join(root, 'public/object-sfx-local.js'), 'utf8');

if (/\bAlexander,\s*(?:super|noch nicht)/.test(app)) errors.push('app.js still contains legacy Alexander praise/prompt');
if (!app.includes('Olexander, super!')) errors.push('app.js missing Olexander success praise');
if (!app.includes('await playApplause()')) errors.push('correct-answer flow does not await applause');
if (!app.includes('await window.SashkaSfx.play(t.id)')) errors.push('correct-answer flow does not await object SFX');
if (app.includes('state.wrong>=3')) errors.push('wrong-answer flow still auto-advances after repeated misses');
if (!app.includes('state.locked=true;state.wrong++')) errors.push('wrong-answer audio is not protected from rapid-tap interruption');
if (!app.includes('playWrongVoice(x,t,f)')) errors.push('wrong-answer flow does not use recorded contextual teaching clips');
if (!app.includes('generatedAudioDe?.wrong') || !app.includes('generatedAudioDe?.retry')) errors.push('recorded German wrong/retry path missing');
if (!app.includes('generatedAudioUa?.wrong') || !app.includes('generatedAudioUa?.retry')) errors.push('recorded Ukrainian wrong/retry path missing');
if (!app.includes('const deSrc=item?.generatedAudioDe?.[kind],uaSrc=item?.generatedAudioUa?.[kind]')) errors.push('success/question recorded-first voice path missing');
if (!app.includes('Подумай ще, друже')) errors.push('contextual Ukrainian first-miss explanation missing');
if (!app.includes('Achte auf die Farbe')) errors.push('attribute-comparison feedback missing');
if (!app.includes('preferredVoice')) errors.push('preferred natural browser voice selection missing');

// Guard the exact success-path ordering, not merely the presence of each call.
// This catches accidental refactors that would speak praise before applause/SFX.
const successFlowStart = app.indexOf('(async()=>{await playApplause()');
const successFlowEnd = successFlowStart >= 0 ? app.indexOf('})();return}', successFlowStart) : -1;
if (successFlowStart < 0 || successFlowEnd < 0) {
  errors.push('correct-answer async success flow not found');
} else {
  const flow = app.slice(successFlowStart, successFlowEnd);
  const applausePos = flow.indexOf('await playApplause()');
  const sfxPos = flow.indexOf('await window.SashkaSfx.play(t.id)');
  const praisePos = flow.indexOf('await playItemVoice(t,"success",f)');
  if (!(applausePos >= 0 && sfxPos > applausePos && praisePos > sfxPos)) {
    errors.push('correct-answer sequence must be applause → object SFX (when available) → DE→UA praise');
  }
}

// Recorded wrong-answer teaching must preserve German first, then Ukrainian.
const recordedWrongStart = app.indexOf('async function playWrongVoice');
const recordedWrongEnd = recordedWrongStart >= 0 ? app.indexOf('const speakCurrent=', recordedWrongStart) : -1;
if (recordedWrongStart < 0 || recordedWrongEnd < 0) {
  errors.push('recorded wrong-answer voice block not found');
} else {
  const flow = app.slice(recordedWrongStart, recordedWrongEnd);
  const dePos = flow.indexOf('deWrong&&deRetry');
  const uaPos = flow.indexOf('uaWrong&&uaRetry', dePos + 1);
  if (!(dePos >= 0 && uaPos > dePos)) errors.push('recorded wrong-answer order must remain German → Ukrainian');
}

if (!index.includes('object-sfx.js')) errors.push('index.html does not load object-sfx.js');
if (!index.includes('object-sfx-local.js')) errors.push('index.html does not load local animal SFX override');
if (!index.includes('audio-bridge.js')) errors.push('index.html does not load audio-bridge.js');
if (!index.includes('animal-sound-sources.html')) errors.push('animal sound attribution link missing');
if (!shim.includes("voiceMode: oldSettingsVersion < 3 ? 'dual'")) errors.push('bilingual settings migration missing');
if (!shim.includes('physicalAssetsExist')) errors.push('production shim does not verify physical asset existence');
if (!bridge.includes('window.Audio = BridgedAudio')) errors.push('shared recorded-audio bridge missing');
if (!sfx.includes('window.SashkaSfx')) errors.push('object SFX runtime missing');
if (!localSfx.includes("'./assets/sfx/animals/dog.ogg'") || !localSfx.includes("'./assets/sfx/animals/sheep.ogg'")) errors.push('local real animal recording map missing');

for (const id of ['dog','cat','cow','horse','pig','sheep','lion','elephant','bear']) {
  if (!(await exists(`public/assets/sfx/animals/${id}.ogg`))) errors.push(`missing local real animal SFX: ${id}.ogg`);
}

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

console.log('Production runtime validation OK: safe filtering, Olexander, persistent questions, recorded-first contextual DE→UA teaching feedback, local real animal recordings, shared audio bridge, strict applause → SFX → DE→UA praise sequencing.');
