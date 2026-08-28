import { access, appendFile, mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "../src/server/load-env.mjs";
import { loadContent, saveContentGroups } from "../src/server/content.mjs";
import { generateImage } from "../src/server/providers/registry.mjs";

loadEnv();
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = Object.fromEntries(process.argv.slice(2).filter(x => x.startsWith("--") && x.includes("=")).map(x => {
  const i=x.indexOf("="); return [x.slice(2,i),x.slice(i+1)];
}));
const id=args.id;
const provider=args.provider || process.env.AI_DEFAULT_PROVIDER || "openai";
const quality=args.quality || process.env.OPENAI_IMAGE_QUALITY || "medium";
if(!id) throw new Error("--id is required");

const content=await loadContent(root);
const item=content.items.find(x=>x.id===id);
if(!item) throw new Error(`Unknown content id: ${id}`);
const imageDir=path.join(root,"public/assets/generated/images");
const logDir=path.join(root,"logs");
const progressFile=path.join(root,"public/assets/generated/progress.json");
await mkdir(imageDir,{recursive:true}); await mkdir(logDir,{recursive:true});
const logFile=path.join(logDir,"generation.jsonl");

const subjects={
  dog:"one friendly domestic dog, whole body",cat:"one friendly domestic cat, whole body",rabbit:"one hare/rabbit with long ears, whole body",cow:"one black-and-white dairy cow, whole body",horse:"one brown horse, whole body",pig:"one pink farm pig, whole body",sheep:"one white woolly sheep, whole body",lion:"one adult lion with a clear mane, whole body",elephant:"one gray elephant, whole body, trunk and large ears visible",bear:"one brown bear, whole body, calm expression",
  tomato:"one ripe red tomato with green calyx",cucumber:"one dark-green cucumber",carrot:"one orange carrot with green leafy top",potato:"one light-brown potato",corn:"one yellow ear of corn with a little green husk",pepper:"one green bell pepper",broccoli:"one green broccoli head",onion:"one golden-yellow onion bulb",eggplant:"one glossy purple eggplant",garlic:"one white garlic bulb",
  apple:"one ripe red apple",banana:"one ripe yellow banana",orange:"one whole orange citrus fruit",pear:"one green pear",grapes:"one small bunch of purple grapes",strawberry:"one ripe red strawberry",watermelon:"one whole green striped watermelon",peach:"one ripe peach",cherries:"a natural pair of red cherries joined by stems",kiwi:"one whole brown fuzzy kiwi",
  cup:"one simple ceramic drinking cup with handle",plate:"one simple round dinner plate",spoon:"one metal eating spoon",fork:"one metal table fork",table:"one simple four-legged dining table",glass:"one clear empty drinking glass",bowl:"one simple eating bowl",pot:"one cooking pot with two handles and no food",pan:"one frying pan with handle and no food",fridge:"one closed household refrigerator",
  toothbrush:"one child toothbrush",toothpaste:"one toothpaste tube",soap:"one bar of soap",towel:"one neatly folded bath towel",shampoo:"one shampoo bottle",comb:"one simple hair comb",sponge:"one yellow cleaning sponge","toilet-paper":"one roll of toilet paper",hairbrush:"one hair brush",washcloth:"one soft washcloth",
  car:"one ordinary family car",bus:"one city bus",train:"one passenger train front car",bicycle:"one standard bicycle",airplane:"one passenger airplane",ship:"one simple passenger ship",truck:"one cargo truck",tractor:"one farm tractor",tram:"one city tram",helicopter:"one helicopter"
};
function prompt(){
  const subject=subjects[item.id] || `${item.labels.de} / ${item.labels.ua}`;
  const animal=item.category==="animals";
  return [
    "Create a premium educational picture card for a child aged 3 to 7.",
    `SUBJECT: ${subject}.`,
    "The child must recognize the subject instantly without reading.",
    "Friendly polished high-quality 3D educational illustration, believable proportions and textures, bright natural colors, soft studio lighting, subtle contact shadow.",
    "Exactly one clear main subject, centered, large, completely visible, square 1:1, very light warm cream background, no scene, no horizon.",
    animal ? "Correct natural species anatomy, normal eyes, no clothes, no human pose." : "Keep the object's real characteristic shape and color. No cartoon face, eyes, mouth, arms, or legs.",
    "No text, letters, numbers, labels, border, logo, watermark, people, hands, decorative props, duplicates, confusing extras, or scary details."
  ].join(" ");
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function emit(event,extra={}){
  const files=await readdir(imageDir).catch(()=>[]);
  const row={ts:new Date().toISOString(),event,provider,category:item.category,id:item.id,de:item.labels.de,imageFiles:files.filter(x=>/\.(png|jpe?g|webp)$/i.test(x)).length,...extra};
  console.log(`[GEN] ${JSON.stringify(row)}`);
  await appendFile(logFile,JSON.stringify(row)+"\n");
  await writeFile(progressFile,JSON.stringify(row,null,2)+"\n");
}
async function exists(file){try{await access(file);return true}catch{return false}}
async function withRetry(fn,tries=4){let last;for(let n=1;n<=tries;n++){try{return await fn()}catch(e){last=e;const t=String(e?.message||e);await emit("retry",{attempt:n,error:t.slice(0,700)});if(n===tries||!/429|rate|5\d\d|unavailable|temporar/i.test(t))throw e;const wait=Math.min(60000,3000*n);console.log(`[WAIT] ${wait}ms`);await sleep(wait)}}throw last}

const name=`${item.id}.png`;
const file=path.join(imageDir,name);
if(await exists(file)){
  item.generatedImage=`./assets/generated/images/${name}`;
  await saveContentGroups(content);
  await emit("skip-existing",{file:name});
  process.exit(0);
}
await emit("start",{quality,prompt:prompt()});
const started=Date.now();
try{
  const result=await withRetry(()=>generateImage({provider,prompt:prompt(),size:"1024x1024",quality}));
  await writeFile(file,result.buffer);
  item.generatedImage=`./assets/generated/images/${name}`;
  await saveContentGroups(content);
  await emit("success",{file:name,bytes:result.buffer.length,mimeType:result.mimeType,quality,ms:Date.now()-started});
}catch(e){
  await emit("error",{quality,error:String(e?.message||e).slice(0,1200),ms:Date.now()-started});
  process.exitCode=2;
}
