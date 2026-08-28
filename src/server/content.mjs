import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export async function loadContent(rootDir) {
  const contentDir = path.join(rootDir, "content");
  const index = JSON.parse(await readFile(path.join(contentDir, "content.json"), "utf8"));
  const groups = await Promise.all(index.categoryFiles.map(async (relativePath) => {
    const file = path.join(contentDir, relativePath);
    const data = JSON.parse(await readFile(file, "utf8"));
    return { file, ...data };
  }));
  return {
    schemaVersion: index.schemaVersion,
    languages: index.languages,
    items: groups.flatMap((group) => group.items),
    groups,
  };
}

export async function saveContentGroups(content) {
  await Promise.all(content.groups.map(({ file, category, items }) =>
    writeFile(file, JSON.stringify({ category, items }, null, 2) + "\n", "utf8")
  ));
}
