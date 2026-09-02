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
if(provider!=="google-cloud") throw new Error("Number cards are Google Cloud only");
if(!/^number-[1-4]$/.test(id||"")) throw new Error("--id must be number-1..number-4");
const n=Number(id.split("-")[1]);
const content=await loadContent(root); const item=content.items.find(x=>x.id===id); if(!item) throw new Error(`Unknown content id: ${id}`);
const imageDir=path.join(root,"public/assets/generated/images"); const logDir=path.join(root,"logs"); const progressFile=path.join(root,"public/assets/generated/progress.json");
await mkdir(imageDir,{recursive:true}); await mkdir(logDir,{recursive:true}); const logFile=path.join(logDir,"generation.jsonl");
const words={1:"ONE",2:"TWO",3:"THREE",4:"FOUR"};
const objects={1:"one bright red apple",2:"two bright red apples",3:"three bright red apples",4:"four bright colorful toy blocks"};
function prompt(extra=""){return `Create a premium square educational number card for a child aged 3 to 7. The card MUST show one large, bold, clearly readable Arabic numeral ${n}, occupying roughly the upper third of the card. It must be the digit ${n}, not a word and not a decorative symbol. Below it, show EXACTLY ${words[n]} (${n}) clearly separated countable objects: ${objects[n]}. The child must instantly connect the written digit ${n} with the exact quantity ${n}. Arrange all ${n} objects in a simple clean row or balanced group with clear space between every object. Every object must be fully visible and distinct. NO people, NO hands, NO fingers, NO animals, NO extra objects, NO partial hidden objects, NO reflections that look like extra objects. No written words, letters, labels, logos or watermarks other than the single Arabic numeral ${n}. Clean very-light warm cream/pastel studio background, polished friendly high-end 3D children's educational illustration, vivid natural colors, soft cinematic studio lighting, square 1:1, generous margins, nothing cropped. ${extra}`;}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function emit(event,extra={}){const files=await readdir(imageDir).catch(()=>[]);const row={ts:new Date().toISOString(),event,provider,category:"numbers",id,de:item.labels.de,imageFiles:files.filter(x=>/\.(png|jpe?g|webp)$/i.test(x)).length,...extra};console.log(`[GEN] ${JSON.stringify(row)}`);await appendFile(logFile,JSON.stringify(row)+"\n");await writeFile(progressFile,JSON.stringify(row,null,2)+"\n");}
async function withRetry(fn,tries=6){let last;for(let a=1;a<=tries;a++){try{return await fn()}catch(e){last=e;const t=String(e?.message||e);await emit("retry-api",{attempt:a,error:t.slice(0,700)});if(a===tries||!/429|rate|5\d\d|unavailable|temporar|resource.exhausted/i.test(t))throw e;const wait=Math.min(90000,10000*a);console.log(`[WAIT] ${wait}ms`);await sleep(wait)}}throw last}
const file=path.join(imageDir,`${id}.png`); await emit("start",{prompt:prompt()}); let accepted=null,qaText="";
for(let artAttempt=1;artAttempt<=5;artAttempt++){
  const result=await withRetry(()=>generateImage({provider,prompt:prompt(qaText?`Previous attempt failed QA: ${qaText}. Correct both the DIGIT and the COUNT above all else.`:""),aspectRatio:"1:1",imageSize:"1K",size:"1024x1024",quality:"premium"}));
  const expected=`An educational number card that visibly contains one large Arabic numeral ${n} and exactly ${n} clearly separated countable objects below it, with no hands or people. The digit must be ${n}, and there must be neither fewer nor more than ${n} objects.`;
  const review=await withRetry(()=>reviewImage({provider,buffer:result.buffer,mimeType:result.mimeType,expected}),4); qaText=review.text;
  await emit("qa",{artAttempt,pass:review.pass,review:qaText.slice(0,700),bytes:result.buffer.length}); if(review.pass){accepted=result;break;}
}
if(!accepted){await emit("error",{error:`Failed numeral/count QA: ${qaText}`});process.exit(2)}
await writeFile(file,accepted.buffer); item.generatedImage=`./assets/generated/images/${id}.png`; await saveContentGroups(content); await emit("success",{file:`${id}.png`,bytes:accepted.buffer.length,qa:qaText.slice(0,500)});
