import { access, appendFile, mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "../src/server/load-env.mjs";
import { loadContent, saveContentGroups } from "../src/server/content.mjs";
import { generateSpeech } from "../src/server/providers/registry.mjs";

loadEnv();
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = Object.fromEntries(process.argv.slice(2).filter(x => x.startsWith("--") && x.includes("=")).map(x => {
  const i=x.indexOf("="); return [x.slice(2,i),x.slice(i+1)];
}));
const id=args.id;
const mode=args.mode || "de";
const provider=args.provider || process.env.AI_DEFAULT_PROVIDER || "google-cloud";
const kinds=(args.kinds || "question,success,retry,wrong").split(",").map(x=>x.trim()).filter(Boolean);
const pauseMs=Number(args["pause-ms"] || 900);
const force=/^(1|true|yes)$/i.test(args.force || "false");
if(!id) throw new Error("--id is required");
if(!["de","ua","bilingual"].includes(mode)) throw new Error("--mode must be de, ua or bilingual");

const content=await loadContent(root);
const item=content.items.find(x=>x.id===id);
if(!item) throw new Error(`Unknown content id: ${id}`);
const audioDir=path.join(root,"public/assets/generated/audio");
const logDir=path.join(root,"logs");
const progressFile=path.join(root,"public/assets/generated/progress.json");
await mkdir(audioDir,{recursive:true}); await mkdir(logDir,{recursive:true});
const logFile=path.join(logDir,"generation.jsonl");

const plural=new Set(["grapes","cherries"]);
const colorDe=x=>x?.attributes?.color?.de||"";
const colorUa=x=>x?.attributes?.color?.ua||"";
const article=x=>x.article?.de||"die";
function deAdj(color,ending){if(!color)return"";if(["orange","rosa","lila"].includes(color))return color;return `${color}${ending}`}
function deNamed(x,{acc=false}={}){
  const pl=plural.has(x.id),a=article(x),c=colorDe(x);
  const art=pl?"die":acc&&a==="der"?"den":a;
  if(!c)return `${art} ${x.labels.de}`;
  const ending=pl||acc&&a==="der"?"en":"e";
  return `${art} ${deAdj(c,ending)} ${x.labels.de}`;
}
const uaNamed=x=>colorUa(x)?`${colorUa(x)} ${x.labels.ua}`:x.labels.ua;

const texts=(kind)=>{
  const de = kind==="success"
    ? `Jaaa, genau! Das ist ${deNamed(item)}! Super gemacht, Olexander!`
    : kind==="retry"
      ? `Wir suchen aber ${deNamed(item,{acc:true})}. Schau noch mal genau. Du schaffst das!`
      : kind==="wrong"
        ? `Hihi, das ist ${deNamed(item)}!`
        : plural.has(item.id)
          ? `Wo sind die ${item.labels.de}? Zeig sie mir!`
          : `Wo ist ${deNamed(item)}? Zeig mal!`;
  const ua = kind==="success"
    ? `Так! Ура! Це ${uaNamed(item)}! Сашка, молодець!`
    : kind==="retry"
      ? `А ми шукаємо ${uaNamed(item)}. Подивись ще разочок. Ти зможеш!`
      : kind==="wrong"
        ? `Ой, це ${uaNamed(item)}!`
        : `Де ${uaNamed(item)}? Покажи мені!`;
  return {de,ua};
};
const transcript=(kind)=>{
  const t=texts(kind);
  if(mode==="de") return t.de;
  if(mode==="ua") return t.ua;
  return `${t.de}\n${t.ua}`;
};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function emit(event,extra={}){
  const files=await readdir(audioDir).catch(()=>[]);
  const row={ts:new Date().toISOString(),event,provider,category:item.category,id:item.id,de:item.labels.de,mode,force,audioFiles:files.filter(x=>x.endsWith(".wav")).length,...extra};
  console.log(`[GEN] ${JSON.stringify(row)}`);
  await appendFile(logFile,JSON.stringify(row)+"\n");
  await writeFile(progressFile,JSON.stringify(row,null,2)+"\n");
}
async function exists(file){try{await access(file);return true}catch{return false}}
async function withRetry(fn,label,tries=4){let last;for(let n=1;n<=tries;n++){try{return await fn()}catch(e){last=e;const t=String(e?.message||e);await emit("retry-api",{kind:label,attempt:n,error:t.slice(0,600)});if(n===tries||!/429|rate|5\d\d|unavailable|temporar|resource.exhausted/i.test(t))throw e;const wait=Math.min(60000,3500*n);console.log(`[WAIT] ${wait}ms`);await sleep(wait)}}throw last}

const field=mode==="de"?"generatedAudioDe":mode==="ua"?"generatedAudioUa":"generatedAudio";
item[field] ||= {};
let failures=0;
for(const kind of kinds){
  const suffix=mode==="de"?"de":mode==="ua"?"ua":"bilingual";
  const name=`${item.id}.${kind}.${suffix}.wav`;
  const file=path.join(audioDir,name);
  if(!force && await exists(file)){
    item[field][kind]=`./assets/generated/audio/${name}`;
    await emit("skip-existing",{kind,file:name});
    continue;
  }
  await emit("start",{kind,transcript:transcript(kind)});
  const started=Date.now();
  try{
    const language=mode==="de"?"German de-DE":mode==="ua"?"Ukrainian uk-UA":"German de-DE first, then Ukrainian uk-UA";
    const googleProvider=/google|vertex/i.test(provider);
    const voice=googleProvider
      ? (mode==="ua"?(process.env.GOOGLE_TTS_VOICE_UA||process.env.GOOGLE_TTS_VOICE||"Sulafat"):(process.env.GOOGLE_TTS_VOICE_DE||process.env.GOOGLE_TTS_VOICE||"Leda"))
      : (mode==="ua"?(process.env.OPENAI_TTS_VOICE_UA||process.env.OPENAI_TTS_VOICE||"coral"):(process.env.OPENAI_TTS_VOICE||"coral"));
    const moods={
      question:"curious, inviting and playful; sound like a fun little treasure hunt; smiling voice",
      success:"genuinely delighted and celebratory; make the child feel proud, but keep the pitch steady",
      wrong:"gentle, amused and playful, never scolding; smiling as if this is part of the game",
      retry:"warm, encouraging and calm, like giving a friendly little clue",
    };
    const uaStability=mode==="ua"?"; steady natural pitch and volume; no vibrato, no trembling, no quivering, no breathy wobble, no theatrical voice acting; relaxed native Ukrainian pronunciation; short clean phrases with gentle pauses":"";
    const style=`${moods[kind]||moods.question}; affectionate preschool game host; natural ${mode==="ua"?"Ukrainian":"German"} speech; clear and human; never robotic, never patronizing, never shouting${uaStability}`;
    const result=await withRetry(()=>generateSpeech({provider,text:transcript(kind),language,voice,style}),kind);
    await writeFile(file,result.buffer);
    item[field][kind]=`./assets/generated/audio/${name}`;
    await saveContentGroups(content);
    await emit("success",{kind,file:name,voice,bytes:result.buffer.length,ms:Date.now()-started});
  }catch(e){
    failures++;
    await emit("error",{kind,error:String(e?.message||e).slice(0,1200),ms:Date.now()-started});
  }
  await sleep(pauseMs);
}
await saveContentGroups(content);
await emit(failures?"item-complete-with-errors":"item-complete",{failures});
if(failures) process.exitCode=2;
