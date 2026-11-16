// Appends every prompt you send to Claude Code to docs/prompt-log.md
const fs = require("fs");
const path = require("path");
let input = "";
process.stdin.on("data", (c) => (input += c));
process.stdin.on("end", () => {
  try {
    const { prompt, cwd } = JSON.parse(input);
    if (!prompt) return;
    const file = path.join(cwd || process.cwd(), "docs", "prompt-log.md");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (!fs.existsSync(file)) fs.writeFileSync(file, "# Prompt log\n");
    const stamp = new Date().toISOString().replace("T", " ").slice(0, 19);
    fs.appendFileSync(file, `\n## ${stamp}\n\n${prompt.trim()}\n`);
  } catch (e) {}
});