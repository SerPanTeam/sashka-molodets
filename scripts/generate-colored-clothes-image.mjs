import { access, appendFile, mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "../src/server/load-env.mjs";
import { loadContent, saveContentGroups } from "../src/server/content.mjs";
import { generateImage, reviewImage } from "../src/server/providers/registry.mjs";

loadEnv();
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const args=Object.fromEntries(process.argv.slice(2).filter(x=>x.startsWith("--")&&x.includes("=")).map(x=>{const i=x.indexOf("=");return[x.slice(2,i),x.slice(i+1)]}));
const id=args.id;
const provider=args.provider||"google-cloud";
const force=/^(1|true|yes)$/i.test(args.force||"true");
if(!id) throw new Error("--id is required");
if(provider!=="google-cloud") throw new Error("Colored clothes generator is Google Cloud only");

const specs={
  "white-shirt":{subject:"one plain WHITE short-sleeve child T-SHIRT, clothing garment, bright neutral white fabric",expected:"a WHITE T-shirt garment; the shirt itself must be white"},
  "black-pants":{subject:"one pair of plain BLACK TROUSERS / PANTS, clothing garment, full length, matte black fabric; NOT a garden hose",expected:"BLACK trousers/pants clothing; not a hose; the trousers themselves must be black"},
  "red-dress":{subject:"one simple bright RED DRESS, clothing garment, child-friendly modest shape",expected:"a RED dress garment; the dress itself must be red"},
  "blue-shoe":{subject:"one simple bright BLUE SHOE / SNEAKER, footwear, side three-quarter view",expected:"a BLUE shoe or sneaker; the shoe itself must be blue"},
  "green-hat":{subject:"one simple bright GREEN CAP / HAT, wearable headwear, no logo",expected:"a GREEN cap or hat; the headwear itself must be green"},
  "yellow-jacket":{subject:"one simple bright YELLOW JACKET, clothing garment, symmetrical sleeves",expected:"a YELLOW jacket garment; the jacket itself must be yellow"},
  "orange-sweater":{subject:"one plain bright ORANGE PULLOVER / SWEATER, long-sleeve clothing garment",expected:"an ORANGE pullover/sweater garment; the sweater itself must be orange"},
  "purple-skirt":{subject:"one simple bright PURPLE SKIRT, clothing garment; NOT a rock or stone",expected:"a PURPLE skirt garment; not a rock; the skirt itself must be purple"},
  "brown-boots":{subject:"one matching pair of simple BROWN BOOTS, footwear, warm natural brown",expected:"a matching pair of BROWN boots; the boots themselves must be brown"}
};
const spec=specs[id];
if(!spec) throw new Error(`Unsupported colored clothes id: ${id}`);
const content=await loadContent(root);
const item=content.items.find(x=>x.id===id);
if(!item) throw new Error(`Unknown content id: ${id}`);
const imageDir=path.join(root,"public/assets/generated/images");
const logDir=path.join(root,"logs");
const logFile=path.join(logDir,"generation.jsonl");
await mkdir(imageDir,{recursive:true});await mkdir(logDir,{recursive:true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function emit(event,extra={}){const files=await readdir(imageDir).catch(()=>[]);const row={ts:new Date().toISOString(),event,provider,category:"clothes",id,imageFiles:files.length,...extra};console.log(`[CLOTHES] ${JSON.stringify(row)}`);await appendFile(logFile,JSON.stringify(row)+"\n")}
async function withRetry(fn,tries=6){let last;for(let n=1;n<=tries;n++){try{return await fn()}catch(e){last=e;const t=String(e?.message||e);await emit("retry",{attempt:n,error:t.slice(0,500)});if(n===tries||!/429|rate|5\d\d|unavailable|temporar|resource.exhausted/i.test(t))throw e;const wait=Math.min(90000,8000*n);console.log(`[WAIT] ${wait}ms`);await sleep(wait)}}throw last}
const prompt=correction=>[
  "Create one premium square picture card for a child aged 3 to 7.",
  `EXACT SUBJECT AND COLOR: ${spec.subject}.`,
  "The requested garment color is mandatory and must dominate the object itself. Do not substitute another color.",
  "Show exactly the requested clothing item, centered, very large, complete silhouette, no person, no mannequin, no hands, no extra garments.",
  "Polished high-end 3D educational illustration, believable fabric/material, soft studio light, very-light warm cream background, tiny contact shadow.",
  "No text, letters, labels, logos, brands, faces, eyes, mouth, border, watermark or clutter.",
  correction||""
].filter(Boolean).join(" ");
const file=path.join(imageDir,`${id}.png`);
if(!force){try{await access(file);item.generatedImage=`./assets/generated/images/${id}.png`;await saveContentGroups(content);process.exit(0)}catch{}}
let accepted=null,lastReview="";
for(let artAttempt=1;artAttempt<=4;artAttempt++){
  const correction=lastReview?`Previous attempt failed because: ${lastReview}. Correct BOTH object identity and exact requested color.`:"";
  const result=await withRetry(()=>generateImage({provider,prompt:prompt(correction),aspectRatio:"1:1",imageSize:"1K",size:"1024x1024",quality:"premium"}));
  const review=await withRetry(()=>reviewImage({provider,buffer:result.buffer,mimeType:result.mimeType,expected:spec.expected}),4);
  lastReview=review.text;
  await emit("qa",{artAttempt,pass:review.pass,review:review.text.slice(0,700)});
  if(review.pass){accepted=result;break;}
}
if(!accepted) throw new Error(`Exact-color clothing QA failed: ${lastReview}`);
await writeFile(file,accepted.buffer);
item.generatedImage=`./assets/generated/images/${id}.png`;
await saveContentGroups(content);
await emit("success",{file:`${id}.png`,bytes:accepted.buffer.length,expected:spec.expected});
