import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { createReadStream, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "./src/server/load-env.mjs";
import { getProviderStatus, generateImage, generateSpeech } from "./src/server/providers/registry.mjs";
import { loadContent } from "./src/server/content.mjs";

loadEnv();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");
const port = Number(process.env.PORT || 4173);
const mime = { ".html":"text/html; charset=utf-8", ".js":"text/javascript; charset=utf-8", ".css":"text/css; charset=utf-8", ".json":"application/json; charset=utf-8", ".webmanifest":"application/manifest+json; charset=utf-8", ".svg":"image/svg+xml", ".png":"image/png", ".jpg":"image/jpeg", ".jpeg":"image/jpeg", ".webp":"image/webp", ".wav":"audio/wav", ".mp3":"audio/mpeg", ".ogg":"audio/ogg" };
function sendJson(res, status, data) { res.writeHead(status, {"Content-Type":"application/json; charset=utf-8", "Cache-Control":"no-store", "X-Content-Type-Options":"nosniff"}); res.end(JSON.stringify(data)); }
async function readBody(req, limit=1_000_000) { const chunks=[]; let size=0; for await (const chunk of req) { size += chunk.length; if (size > limit) throw new Error("Request body too large"); chunks.push(chunk); } return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {}; }
function isAdmin(req) { const required=process.env.ADMIN_TOKEN; if (!required || required === "change-me") return process.env.NODE_ENV !== "production"; return req.headers.authorization === `Bearer ${required}`; }
function safeStaticPath(urlPath) { const decoded=decodeURIComponent(urlPath.split("?")[0]); const candidate=path.normalize(path.join(publicDir, decoded === "/" ? "index.html" : decoded)); return candidate.startsWith(publicDir) ? candidate : null; }

const server = http.createServer(async (req,res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    if (url.pathname === "/api/health" && req.method === "GET") return sendJson(res,200,{ok:true,app:"Сашка молодец",providers:getProviderStatus()});
    if (url.pathname === "/api/content" && req.method === "GET") { const content = await loadContent(__dirname); return sendJson(res,200,{schemaVersion:content.schemaVersion,languages:content.languages,items:content.items}); }
    if (url.pathname === "/api/generate/image" && req.method === "POST") {
      if (!isAdmin(req)) return sendJson(res,401,{error:"Unauthorized"});
      const result=await generateImage(await readBody(req)); res.writeHead(200,{"Content-Type":result.mimeType,"Cache-Control":"no-store"}); return res.end(result.buffer);
    }
    if (url.pathname === "/api/generate/speech" && req.method === "POST") {
      if (!isAdmin(req)) return sendJson(res,401,{error:"Unauthorized"});
      const result=await generateSpeech(await readBody(req)); res.writeHead(200,{"Content-Type":result.mimeType,"Cache-Control":"no-store"}); return res.end(result.buffer);
    }
    const staticPath = safeStaticPath(url.pathname); if (!staticPath) { res.writeHead(400); return res.end("Bad request"); }
    let resolved=staticPath;
    if (!existsSync(resolved)) resolved=path.join(publicDir,"index.html"); else { const s=await stat(resolved); if (s.isDirectory()) resolved=path.join(resolved,"index.html"); }
    const ext=path.extname(resolved).toLowerCase(); const headers={"Content-Type":mime[ext] || "application/octet-stream", "X-Content-Type-Options":"nosniff"};
    headers["Cache-Control"] = url.pathname.startsWith("/assets/generated/") ? "public, max-age=31536000, immutable" : "no-cache";
    res.writeHead(200,headers); createReadStream(resolved).pipe(res);
  } catch (error) { console.error(error); if (!res.headersSent) sendJson(res,500,{error:error.message || "Internal error"}); else res.end(); }
});
server.listen(port,"0.0.0.0",()=>console.log(`Сашка молодец → http://localhost:${port}`));
