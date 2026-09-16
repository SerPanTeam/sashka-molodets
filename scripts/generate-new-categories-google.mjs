import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { generateImage, generateSpeech } from '../src/server/providers/google-cloud.mjs';

const root=process.cwd(), sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function retry(fn,label,tries=6){let e;for(let i=1;i<=tries;i++){try{return await fn()}catch(err){e=err;console.warn(`${label} attempt ${i}: ${err.message}`);if(i<tries)await sleep(Math.min(60000,7000*i));}}throw e}
const specs={
 rooms:{
  kitchen:'a cozy modern family kitchen, cabinets, sink, stove and refrigerator clearly visible, no people',
  'living-room':'a cozy family living room, sofa, coffee table and floor lamp clearly visible, no people',
  bedroom:'a cozy child-friendly bedroom, bed, bedside table and wardrobe clearly visible, no people',
  bathroom:'a clean family bathroom, bathtub, sink and mirror clearly visible, no people',
  'childrens-room':'a cheerful childrens room, child bed, toy shelf and small desk clearly visible, no people, no text',
  hallway:'a welcoming home hallway, coat hooks, shoe cabinet and interior doors clearly visible, no people'
 },
 nature:{
  tree:'one healthy green deciduous tree, whole tree visible, simple meadow context', flower:'one large red wildflower with stem and leaves, instantly recognizable',
  sun:'bright yellow sun in a simple blue daytime sky, no face', cloud:'one soft white cloud in a simple blue sky, no face',
  rain:'clear gentle rain falling from one gray rain cloud over a small green meadow', snow:'clear white snow covering a small meadow with a few falling snowflakes'
 },
 actions:{
  'action-run':'one friendly school-age child clearly running, full body, side view, simple sports clothes',
  'action-jump':'one friendly school-age child clearly jumping upward, both feet off the ground, full body',
  'action-eat':'one friendly school-age child clearly eating with a spoon from a bowl at a table',
  'action-drink':'one friendly school-age child clearly drinking water from a cup',
  'action-sleep':'one friendly school-age child clearly sleeping peacefully in a bed',
  'action-play':'one friendly school-age child clearly playing with building blocks on the floor'
 }};
const imageDir=path.join(root,'public/assets/generated/images'),audioDir=path.join(root,'public/assets/generated/audio');await mkdir(imageDir,{recursive:true});await mkdir(audioDir,{recursive:true});
const phrase=(item,kind,lang)=>{const action=item.category==='actions';if(lang==='de')return action?(kind==='question'?`Wer ${item.action.de}?`:kind==='success'?`Olexander, super! Das Kind ${item.action.de}.`:`Noch einmal. Finde: ${item.labels.de}.`):(kind==='question'?`Wo ist ${item.article.de} ${item.labels.de}?`:kind==='success'?`Olexander, super! Das ist ${item.article.de} ${item.labels.de}.`:`Noch einmal. Finde ${item.article.de} ${item.labels.de}.`);return action?(kind==='question'?`Хто ${item.action.ua}?`:kind==='success'?`Сашка, молодець! Дитина ${item.action.ua}.`:`Ще раз. Знайди: ${item.labels.ua}.`):(kind==='question'?`Де ${item.labels.ua}?`:kind==='success'?`Сашка, молодець! Це ${item.labels.ua}.`:`Ще раз. Знайди ${item.labels.ua}.`)};
for(const category of Object.keys(specs)){
 const file=path.join(root,'content/categories',`${category}.json`),data=JSON.parse(await readFile(file,'utf8'));
 for(const item of data.items){
  const prompt=`Premium educational picture card for a child aged 3-7. ${specs[category][item.id]}. Instantly recognizable without reading. Polished friendly high-quality 3D children's illustration, believable proportions, bright natural colors, soft studio light. Centered composition, square 1:1, light warm cream background or minimal context only where needed. No text, letters, labels, logo, watermark, border, emoji, scary details or confusing extras.`;
  console.log('IMAGE',item.id);const im=await retry(()=>generateImage({prompt,aspectRatio:'1:1',imageSize:'1K'}),`image ${item.id}`);const img=`${item.id}.png`;await writeFile(path.join(imageDir,img),im.buffer);item.generatedImage=`./assets/generated/images/${img}`;await sleep(2500);
  item.generatedAudioDe={};item.generatedAudioUa={};
  for(const lang of ['de','ua'])for(const kind of ['question','success','retry']){const text=phrase(item,kind,lang),name=`${item.id}.${kind}.${lang}.wav`;console.log('AUDIO',name,text);const au=await retry(()=>generateSpeech({text,language:lang==='de'?'German de-DE only':'Ukrainian uk-UA only',voiceName:lang==='de'?(process.env.GOOGLE_TTS_VOICE||'Leda'):(process.env.GOOGLE_TTS_UA_VOICE||'Sulafat'),style:'warm, friendly, clear native preschool teacher; calm and encouraging; natural smile; medium-slow pace; speak only the transcript; no music'}),`audio ${name}`);await writeFile(path.join(audioDir,name),au.buffer);item[lang==='de'?'generatedAudioDe':'generatedAudioUa'][kind]=`./assets/generated/audio/${name}`;await sleep(2200)}
  item.generatedAudioDe.wrong=item.generatedAudioDe.retry;item.generatedAudioUa.wrong=item.generatedAudioUa.retry;
  await writeFile(file,JSON.stringify(data,null,2)+'\n');
 }
}
console.log('NEW CATEGORIES GENERATED');
