import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const cssPath = fileURLToPath(new URL("../src/app/globals.css", import.meta.url));
const css = readFileSync(cssPath, "utf8");

function tokenBlock(selector) {
  const start = css.indexOf(selector);
  if (start === -1) throw new Error(`Missing ${selector} block in globals.css`);
  const open = css.indexOf("{", start);
  const close = css.indexOf("}", open);
  const body = css.slice(open + 1, close);
  const tokens = {};
  for (const match of body.matchAll(/--([\w-]+):\s*([^;]+);/g)) {
    tokens[match[1]] = match[2].trim();
  }
  return tokens;
}

const rootTokens = tokenBlock(":root");
const themes = [
  { name: "light", tokens: rootTokens },
  { name: "dark", tokens: { ...rootTokens, ...tokenBlock('html[data-theme="dark"]') } },
];

// Text pairs need 4.5:1. Graph lanes and status dots are non-text UI and need 3:1.
const checks = [
  ["ink on paper", "ink", "paper", 4.5],
  ["muted on paper", "muted", "paper", 4.5],
  ["ink-strong on paper", "ink-strong", "paper", 4.5],
  ["signal on paper", "signal", "paper", 4.5],
  ["clear on paper", "clear", "paper", 4.5],
  ["hold on paper", "hold", "paper", 4.5],
  ["ink on surface", "ink", "white", 4.5],
  ["muted on surface", "muted", "white", 4.5],
  ["signal on surface", "signal", "white", 4.5],
  ["clear on surface", "clear", "white", 4.5],
  ["hold on surface", "hold", "white", 4.5],
  ["paper on ink", "paper", "ink", 4.5],
  ["surface on ink", "white", "ink", 4.5],
  ["graph main lane", "graph-main", "paper", 3],
  ["graph side lane", "graph-side", "paper", 3],
  ["graph local lane", "graph-local", "paper", 3],
  ["signal bar on surface", "signal-bar", "white", 3],
];

function channels(hex) {
  const value = hex.replace("#", "");
  const normalized =
    value.length === 3
      ? value
          .split("")
          .map((part) => part + part)
          .join("")
      : value;
  return [0, 2, 4].map((offset) => Number.parseInt(normalized.slice(offset, offset + 2), 16) / 255);
}

function luminance(hex) {
  return channels(hex)
    .map((value) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4))
    .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
}

function ratio(foreground, background) {
  const first = luminance(foreground);
  const second = luminance(background);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

function resolve(tokens, name) {
  const seen = new Set();
  let current = name;
  while (!current.startsWith("#")) {
    if (seen.has(current)) throw new Error(`Circular token reference at --${current}`);
    seen.add(current);
    const match = /^var\(--([\w-]+)\)$/.exec(current);
    if (!match) throw new Error(`Cannot resolve token --${name} (got ${current})`);
    current = tokens[match[1]];
    if (!current) throw new Error(`Token --${match[1]} is not defined`);
  }
  return current;
}

let failed = 0;
for (const theme of themes) {
  console.log(`\n${theme.name} theme`);
  for (const [label, foregroundToken, backgroundToken, minimum] of checks) {
    const foreground = resolve(theme.tokens, `var(--${foregroundToken})`);
    const background = resolve(theme.tokens, `var(--${backgroundToken})`);
    const value = ratio(foreground, background);
    const pass = value >= minimum;
    if (!pass) failed += 1;
    console.log(
      `${pass ? "PASS" : "FAIL"} ${label}: ${value.toFixed(2)}:1 (min ${minimum}:1, ${foreground} on ${background})`,
    );
  }
}

if (failed > 0) {
  console.error(`\n${failed} contrast pair${failed === 1 ? "" : "s"} failed.`);
  process.exitCode = 1;
} else {
  console.log(`\nAll ${themes.length * checks.length} contrast pairs pass.`);
}
