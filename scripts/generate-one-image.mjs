import { access, appendFile, mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "../src/server/load-env.mjs";
import { loadContent, saveContentGroups } from "../src/server/content.mjs";
import { generateImage, reviewImage } from "../src/server/providers/registry.mjs";

loadEnv();
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = Object.fromEntries(process.argv.slice(2).filter(x => x.startsWith("--") && x.includes("=")).map(x => {
  const i=x.indexOf("="); return [x.slice(2,i),x.slice(i+1)];
}));
const id=args.id;
const provider=args.provider || process.env.AI_DEFAULT_PROVIDER || "google-cloud";
const quality=args.quality || "premium";
const force=/^(1|true|yes)$/i.test(args.force || "false");
const qa=/^(1|true|yes)$/i.test(args.qa ?? "true");
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
  dog:"one adorable but realistic friendly domestic dog, whole body, unmistakable dog silhouette",cat:"one adorable but realistic domestic cat, whole body, clear cat ears and tail",rabbit:"one friendly hare/rabbit, whole body, long ears clearly visible",cow:"one friendly black-and-white dairy cow, whole body, unmistakable cow proportions",horse:"one beautiful warm-brown horse, whole body, clear mane and tail",pig:"one friendly pink farm pig, whole body, clear snout and curled tail",sheep:"one soft white woolly sheep, whole body, clear sheep face",lion:"one majestic but child-friendly adult lion, whole body, clear golden mane, not scary",elephant:"one friendly gray elephant, whole body, trunk and large ears clearly visible",bear:"one calm friendly brown bear, whole body, clearly a real bear, not a teddy toy",
  tomato:"one juicy ripe bright-red tomato with fresh green calyx",cucumber:"one fresh glossy dark-green cucumber",carrot:"one vivid orange carrot with fresh green leafy top",potato:"one clean light-brown potato with natural shape",corn:"one sunny yellow ear of corn with a little fresh green husk",pepper:"one glossy vivid green bell pepper",broccoli:"one fresh rich-green broccoli head",onion:"one golden-yellow onion bulb",eggplant:"one glossy deep-purple eggplant with green cap",garlic:"one clean white garlic bulb",
  apple:"one juicy shiny red apple with a small green leaf",banana:"one ripe cheerful yellow banana",orange:"one juicy whole bright-orange citrus fruit",pear:"one fresh green pear",grapes:"one compact natural bunch of juicy purple grapes",strawberry:"one juicy bright-red strawberry with green leaves",watermelon:"one whole rich-green striped watermelon",peach:"one velvety ripe peach with warm peach-orange color",cherries:"a natural pair of shiny red cherries joined by stems",kiwi:"one whole brown fuzzy kiwi fruit",
  cup:"one clean ceramic drinking cup with handle",plate:"one clean simple round dinner plate",spoon:"one shiny metal eating spoon",fork:"one shiny metal table fork",table:"one simple sturdy four-legged wooden dining table",glass:"one clean clear empty drinking glass",bowl:"one simple clean eating bowl",pot:"one clean cooking pot with two handles and lid, no food",pan:"one clean frying pan with handle, no food",fridge:"one modern closed household refrigerator, front view",
  toothbrush:"one colorful child toothbrush",toothpaste:"one unmistakable classic toothpaste tube lying slightly diagonal, crimped sealed flat end at one side and a small white screw-cap/nozzle at the other, familiar toothpaste packaging proportions, clean white tube with simple blue and red curved graphic stripes but absolutely no readable words or logo; it must clearly look like toothpaste, not lotion, sunscreen, paint, cream or soap",soap:"one clean colorful bar of soap",towel:"one soft neatly folded bath towel",shampoo:"one colorful shampoo bottle with no readable brand text",comb:"one simple colorful hair comb",sponge:"one bright yellow cleaning sponge","toilet-paper":"one clean white roll of toilet paper",hairbrush:"one simple colorful hair brush",washcloth:"one soft colorful washcloth",
  car:"one bright modern family car, three-quarter view",bus:"one bright city bus, three-quarter view",train:"one modern passenger train front car, clearly recognizable",bicycle:"one standard colorful bicycle, side view",airplane:"one modern passenger airplane, whole aircraft visible",ship:"one friendly simple passenger ship, whole ship visible",truck:"one bright cargo truck, three-quarter view",tractor:"one bright farm tractor, three-quarter view",tram:"one modern city tram, three-quarter view",helicopter:"one modern helicopter, whole aircraft visible"
};

const palettes={animals:"warm sunlit natural colors",vegetables:"fresh garden colors that look crisp and delicious",fruits:"juicy saturated natural fruit colors",household:"clean warm cheerful home colors",hygiene:"fresh playful aqua, coral and sunshine accents",transport:"bold cheerful primary colors with realistic materials"};
function prompt(extra=""){
  const subject=subjects[item.id] || `${item.labels.de} / ${item.labels.ua}`;
  const animal=item.category==="animals";
  return [
    "Create a premium hero picture card for a beloved learning game for a child aged 3 to 7.",
    `SUBJECT: ${subject}.`,
    "GOAL: the child should instantly recognize it, feel delighted by the picture, and want to tap it.",
    "Visual style: polished high-end 3D children's educational illustration with tactile believable materials; charming like a premium animated feature prop, but still visually truthful to the real object.",
    `Color direction: ${palettes[item.category]||"vivid clean natural colors"}; rich, luminous, juicy colors; never muddy, gray or washed out.`,
    "Composition: exactly one dominant subject (except inherent pairs/bunches such as cherries or grapes), centered, very large, complete silhouette visible, generous breathing room, square 1:1.",
    "Background: seamless very-light warm cream to soft pastel gradient, subtle glow behind subject, no room, no landscape, no horizon, no clutter.",
    "Lighting: soft cinematic studio light, gentle rim light, crisp readable form, tiny soft contact shadow, premium render quality.",
    animal ? "Animal must have correct natural species anatomy and proportions, friendly relaxed expression, normal eyes, no clothes and no human pose." : "Preserve the object's unmistakable real-world characteristic shape and expected color; absolutely no cartoon face, eyes, mouth, arms or legs.",
    "No text, letters, numbers, labels, brand names, border, logo, watermark, people, hands, props, duplicates, confusing extras, frightening details, malformed anatomy or cropped parts.",
    extra
  ].filter(Boolean).join(" ");
}

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function emit(event,extra={}){
  const files=await readdir(imageDir).catch(()=>[]);
  const row={ts:new Date().toISOString(),event,provider,category:item.category,id:item.id,de:item.labels.de,force,qa,imageFiles:files.filter(x=>/\.(png|jpe?g|webp)$/i.test(x)).length,...extra};
  console.log(`[GEN] ${JSON.stringify(row)}`);
  await appendFile(logFile,JSON.stringify(row)+"\n");
  await writeFile(progressFile,JSON.stringify(row,null,2)+"\n");
}
async function exists(file){try{await access(file);return true}catch{return false}}
async function withRetry(fn,tries=4){let last;for(let n=1;n<=tries;n++){try{return await fn()}catch(e){last=e;const t=String(e?.message||e);await emit("retry-api",{attempt:n,error:t.slice(0,700)});if(n===tries||!/429|rate|5\d\d|unavailable|temporar|resource.exhausted/i.test(t))throw e;const wait=Math.min(60000,3500*n);console.log(`[WAIT] ${wait}ms`);await sleep(wait)}}throw last}

const name=`${item.id}.png`;
const file=path.join(imageDir,name);
if(!force && await exists(file)){
  item.generatedImage=`./assets/generated/images/${name}`;
  await saveContentGroups(content);
  await emit("skip-existing",{file:name});
  process.exit(0);
}

await emit("start",{quality,prompt:prompt()});
const started=Date.now();
try{
  let accepted=null,qaText="QA disabled";
  let correction="";
  for(let artAttempt=1;artAttempt<=3;artAttempt++){
    const result=await withRetry(()=>generateImage({provider,prompt:prompt(correction),aspectRatio:"1:1",imageSize:"1K",size:"1024x1024",quality}));
    if(!qa){accepted=result;break;}
    const review=await withRetry(()=>reviewImage({provider,buffer:result.buffer,mimeType:result.mimeType,expected:subjects[item.id]||item.labels.de}),3);
    qaText=review.text;
    await emit("qa",{artAttempt,pass:review.pass,review:review.text.slice(0,700),bytes:result.buffer.length});
    if(review.pass){accepted=result;break;}
    correction=`Previous attempt was rejected by child-card QA: ${review.text}. Fix those problems decisively while preserving the requested subject and clean premium style.`;
  }
  if(!accepted) throw new Error(`Image failed strict QA after 3 art attempts: ${qaText}`);
  await writeFile(file,accepted.buffer);
  item.generatedImage=`./assets/generated/images/${name}`;
  await saveContentGroups(content);
  await emit("success",{file:name,bytes:accepted.buffer.length,mimeType:accepted.mimeType,quality,qa:qaText.slice(0,500),ms:Date.now()-started});
}catch(e){
  await emit("error",{quality,error:String(e?.message||e).slice(0,1400),ms:Date.now()-started});
  process.exitCode=2;
}
