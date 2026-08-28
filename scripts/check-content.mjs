import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadContent } from "../src/server/content.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const content = await loadContent(root);
const ids = new Set();
const errors = [];
for (const [i, x] of content.items.entries()) {
  if (!x.id) errors.push(`items[${i}] missing id`);
  if (ids.has(x.id)) errors.push(`duplicate id: ${x.id}`);
  ids.add(x.id);
  if (!x.category) errors.push(`${x.id}: missing category`);
  if (!x.emoji && !x.generatedImage) errors.push(`${x.id}: missing visual`);
  if (!x.labels?.de || !x.labels?.ua) errors.push(`${x.id}: missing labels`);
}
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(`OK: ${content.items.length} items, ${new Set(content.items.map((x) => x.category)).size} categories`);
