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
const provider=args.provider || process.env.AI_DEFAULT_PROVIDER || "openai";
const kinds=(args.kinds || "question,success").split(",").map(x=>x.trim()).filter(Boolean);
const pauseMs=Number(args["pause-ms"] || 1500);
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
const deQuestion=x=>plural.has(x.id)?`Wo sind die ${x.labels.de}?`:`Wo ist ${x.article?.de||"die"} ${x.labels.de}?`;
const deThis=x=>plural.has(x.id)?`Das sind die ${x.labels.de}.`:`Das ist ${x.article?.de||"die"} ${x.labels.de}.`;
const texts=(kind)=>{
  const de=kind==="success"?`Alexander, super! Gut gemacht! ${deThis(item)}`:kind==="retry"?(plural.has(item.id)?`Noch nicht. Suche die ${item.labels.de}.`:`Noch nicht. Suche ${item.article?.de||"die"} ${item.labels.de}.`):deQuestion(item);
  const ua=kind==="success"?`Сашка, молодець! Це ${item.labels.ua}.`:kind==="retry"?`Ще ні. Знайди ${item.labels.ua}.`:`Де ${item.labels.ua}?`;
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
  const row={ts:new Date().toISOString(),event,provider,category:item.category,id:item.id,de:item.labels.de,mode,audioFiles:files.filter(x=>x.endsWith(".wav")).length,...extra};
  console.log(`[GEN] ${JSON.stringify(row)}`);
  await appendFile(logFile,JSON.stringify(row)+"\n");
  await writeFile(progressFile,JSON.stringify(row,null,2)+"\n");
}
async function exists(file){try{await access(file);return true}catch{return false}}
async function withRetry(fn,label,tries=4){let last;for(let n=1;n<=tries;n++){try{return await fn()}catch(e){last=e;const t=String(e?.message||e);await emit("retry",{kind:label,attempt:n,error:t.slice(0,500)});if(n===tries||!/429|rate|5\d\d|unavailable|temporar/i.test(t))throw e;const m=t.match(/retry in\s+([\d.]+)s/i);const wait=m?Math.ceil(Number(m[1])*1000)+1000:Math.min(60000,3000*n);console.log(`[WAIT] ${wait}ms`);await sleep(wait)}}throw last}

const field=mode==="de"?"generatedAudioDe":mode==="ua"?"generatedAudioUa":"generatedAudio";
item[field] ||= {};
let failures=0;
for(const kind of kinds){
  const suffix=mode==="de"?"de":mode==="ua"?"ua":"bilingual";
  const name=`${item.id}.${kind}.${suffix}.wav`;
  const file=path.join(audioDir,name);
  if(await exists(file)){
    item[field][kind]=`./assets/generated/audio/${name}`;
    await emit("skip-existing",{kind,file:name});
    continue;
  }
  await emit("start",{kind,transcript:transcript(kind)});
  const started=Date.now();
  try{
    const language=mode==="de"?"German de-DE only":mode==="ua"?"Ukrainian uk-UA only":"German de-DE first, then Ukrainian uk-UA";
    const voice=mode==="ua"?(process.env.OPENAI_TTS_VOICE_UA||process.env.OPENAI_TTS_VOICE||"coral"):(process.env.OPENAI_TTS_VOICE||"coral");
    const style=mode==="ua"?"Warm, cheerful, caring preschool educator. Native Ukrainian pronunciation. Pleasant and encouraging, clear, natural, slightly playful, medium-slow pace. Speak only the transcript.":"Warm, cheerful, caring preschool educator. Native pronunciation. Pleasant and encouraging, clear, natural, slightly playful, medium-slow pace. Speak only the transcript.";
    const result=await withRetry(()=>generateSpeech({provider,text:transcript(kind),language,voice,style}),kind);
    await writeFile(file,result.buffer);
    item[field][kind]=`./assets/generated/audio/${name}`;
    await saveContentGroups(content);
    await emit("success",{kind,file:name,bytes:result.buffer.length,ms:Date.now()-started});
  }catch(e){
    failures++;
    await emit("error",{kind,error:String(e?.message||e).slice(0,1000),ms:Date.now()-started});
  }
  await sleep(pauseMs);
}
await saveContentGroups(content);
await emit(failures?"item-complete-with-errors":"item-complete",{failures});
if(failures) process.exitCode=2;
