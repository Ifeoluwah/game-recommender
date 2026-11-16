import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { REPO_ROOT } from "../src/config.js";
import { DECLINE_REASONS } from "../src/service/recommender.js";

/**
 * Consistency checks for the documents (spec 08 §8): the parts of the prose that can drift from the
 * code. Numbers and behaviour beyond these are a review item.
 */

const read = (path: string) => readFileSync(join(REPO_ROOT, path), "utf8");
const ADR = "docs/ADR-001-recommender-architecture.md";
const SKILL_DIR = ".claude/skills/productionise-ai-prototype";

/** Markdown with fenced code blocks removed, so a link-shaped string in an example isn't checked. */
const prose = (md: string) => md.replace(/```[\s\S]*?```/g, "");

/** Relative link targets in a Markdown file, without anchors. External and in-page links are skipped. */
export function relativeLinks(md: string): string[] {
  const out: string[] = [];
  for (const m of prose(md).matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
    const target = m[1]!;
    if (/^(https?:|mailto:|#)/.test(target)) continue;
    const path = decodeURIComponent(target.split("#")[0]!);
    if (path) out.push(path);
  }
  return out;
}

/** The text under a Markdown heading, up to the next heading of the same or a higher level; undefined if absent. */
export function sectionBody(md: string, heading: string): string | undefined {
  const level = /^#+/.exec(heading)?.[0].length ?? 0;
  const lines = md.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start < 0) return undefined;
  const body: string[] = [];
  for (const line of lines.slice(start + 1)) {
    const m = /^(#+)\s/.exec(line);
    if (m && m[1]!.length <= level) break;
    body.push(line);
  }
  return body.join("\n").trim();
}

/** For each label, the text after it up to the next label (in any order); undefined if the label is absent. */
export function labelledItems(md: string, labels: string[]): [string, string | undefined][] {
  const at = labels.map((label) => md.indexOf(label));
  return labels.map((label, i) => {
    if (at[i]! < 0) return [label, undefined];
    const later = at.filter((p) => p > at[i]!);
    return [label, md.slice(at[i]! + label.length, later.length ? Math.min(...later) : undefined)];
  });
}

/** True when there's more than Markdown punctuation and whitespace. */
const hasText = (text: string) => text.replace(/[\s>*_.:#-]/g, "") !== "";

describe("docs consistency (spec 08 §8)", () => {
  it("1. the ADR names every DeclineReason in backticks", () => {
    const adr = read(ADR);
    for (const reason of DECLINE_REASONS) expect(adr, reason).toContain(`\`${reason}\``);
  });

  it("2. EVALUATION.md names every gate key in eval/release-gates.json", () => {
    const gates = JSON.parse(read("eval/release-gates.json")) as Record<string, unknown>;
    const keys = Object.entries(gates).filter(([k]) => !k.startsWith("_")).flatMap(([, group]) => Object.keys(group as object));
    expect(keys).toHaveLength(15);
    const evaluation = read("docs/EVALUATION.md");
    for (const key of keys) expect(evaluation, key).toContain(`\`${key}\``);
  });

  it("3. the ADR has every section in §3.1 and a Mermaid flowchart with the evidence-check edges", () => {
    const adr = read(ADR);
    for (const heading of [
      "## 1. Context", "## 2. Decision", "## 3. Diagram", "## 4. Infrastructure", "## 5. Alternatives considered",
      "## 6. Trade-offs we accept", "## 7. Failure behaviour", "## 8. Scaling", "## 9. Evidence that would make us revisit",
    ]) expect(adr, heading).toContain(heading);
    const mermaid = /```mermaid\n([\s\S]*?)```/.exec(adr)?.[1];
    expect(mermaid).toBeDefined();
    expect(mermaid).toContain("flowchart LR");
    expect(mermaid).toMatch(/--\s*"partial \/ title-only"\s*-->/);
    expect(mermaid).toMatch(/--\s*complete\s*-->/);
    expect(mermaid).toContain("x-player-restricted: true");
  });

  it("6. the README has a compact flowchart that shares the ADR's evidence-check branches (spec 08 §5.2)", () => {
    const mermaidOf = (doc: string) => /```mermaid\n([\s\S]*?)```/.exec(read(doc).replace(/\r\n/g, "\n"))?.[1];
    const readme = mermaidOf("README.md");
    expect(readme, "README.md has no Mermaid block").toBeDefined();
    expect(readme).toContain("flowchart LR");
    expect(readme).toMatch(/subgraph build\["Build time[^"]*"\]/);
    expect(readme).toMatch(/subgraph request\["Request time[^"]*"\]/);
    for (const layer of ["Eligibility", "Policy", "Quality", "Diversity"]) expect(readme, layer).toMatch(new RegExp(`\\w+\\[${layer}\\]`));
    const adr = mermaidOf(ADR);
    for (const branch of [/--\s*"partial \/ title-only"\s*-->/, /--\s*complete\s*-->/]) {
      expect(readme, `README: ${branch}`).toMatch(branch);
      expect(adr, `ADR: ${branch}`).toMatch(branch);
    }
  });

  it("3a. the ADR has spec 07 §3.6's seed-availability rows and the all-declined brand revisit criterion", () => {
    const adr = read(ADR);
    expect(adr).toMatch(/not licensed in the market, or a test build \| `SEED_NOT_AVAILABLE`/);
    expect(adr).toMatch(/withdrawn or out of season \| \*\*Not declined, on purpose\*\*/);
    expect(adr).toContain("In every failure case the player sees the page without the rail");
    expect(adr).toMatch(/\*\*A brand or market whose rails all decline\.\*\*/);
  });

  const linked = ["README.md", ADR, "docs/EVALUATION.md", "docs/LEVERAGE.md", "docs/AI_USAGE.md", "docs/prompts/README.md"];
  it.each(linked)("4. every relative link in %s resolves (OpenAI report links may be pending)", (doc) => {
    const missing: string[] = [];
    for (const link of relativeLinks(read(doc))) {
      const target = resolve(dirname(join(REPO_ROOT, doc)), link);
      if (existsSync(target)) continue;
      const repoPath = relative(REPO_ROOT, target).split("\\").join("/");
      // Spec 08 §8.4: links into eval/reports/ may be missing until an OpenAI build is committed.
      if (repoPath.startsWith("eval/reports/")) { console.log(`pending: ${doc} → ${repoPath}`); continue; }
      missing.push(link);
    }
    expect(missing).toEqual([]);
  });

  it("4a. the link check finds relative links and skips external, in-page and code-block ones", () => {
    const md = "[a](docs/x.md#top) [b](https://example.test) [c](#here) [d](../y/)\n```\n[e](not/a/link.md)\n```";
    expect(relativeLinks(md)).toEqual(["docs/x.md", "../y/"]);
  });

  it("5. the skill has its front matter, steps 1–9, 'Done when' and the template", () => {
    const skill = read(`${SKILL_DIR}/SKILL.md`);
    expect(skill).toMatch(/^---\nname: productionise-ai-prototype\ndescription: .+\n---/);
    for (let n = 1; n <= 9; n++) expect(skill, `step ${n}`).toMatch(new RegExp(`^${n}\\. \\*\\*`, "m"));
    expect(skill).toContain("## Done when");
    const template = read(`${SKILL_DIR}/templates/ADR.md`);
    for (const section of ["Context", "Decision", "Diagram", "Infrastructure", "Alternatives considered", "Trade-offs we accept", "Failure behaviour", "Scaling", "Evidence that would make us revisit"]) {
      expect(template, section).toContain(section);
    }
    expect(template).toContain("```mermaid");
  });

  it("has every candidate section, each with content under its heading (spec 08 §6)", () => {
    const written = (doc: string, heading: string) => {
      const body = sectionBody(read(doc), heading);
      expect(body, `${doc}: ${heading} is missing`).toBeDefined();
      expect(hasText(body!), `${doc}: ${heading} is empty`).toBe(true);
    };
    written("docs/AI_USAGE.md", "## Division of work");
    written("docs/AI_USAGE.md", "## Time spent");
    written("docs/AI_USAGE.md", "## What wasn't kept");
    written("docs/EVALUATION.md", "### Commentary");
    const notes = sectionBody(read("README.md"), "## Notes from the candidate");
    expect(notes, "README.md: ## Notes from the candidate is missing").toBeDefined();
    for (const [item, text] of labelledItems(notes!, ["Time allocation", "AI tools used", "One output I changed or rejected"])) {
      expect(text, `README.md: ${item} is missing`).toBeDefined();
      expect(hasText(text!), `README.md: ${item} is empty`).toBe(true);
    }
  });

  it("sectionBody and labelledItems find missing and empty sections", () => {
    const md = "# T\n## A\ntext\n### A.1\nmore\n## B\n\n## C\n**X.** one\n**Y.**\n";
    expect(sectionBody(md, "## A")).toBe("text\n### A.1\nmore");
    expect(sectionBody(md, "## B")).toBe("");
    expect(sectionBody(md, "## D")).toBeUndefined();
    const items = labelledItems(sectionBody(md, "## C")!, ["X", "Y", "Z"]);
    expect(items.map(([, t]) => (t === undefined ? undefined : hasText(t)))).toEqual([true, false, undefined]);
  });
});
