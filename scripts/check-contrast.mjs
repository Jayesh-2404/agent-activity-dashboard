const pairs = [
  ["ink on paper", "#161b17", "#f2f4ef", 4.5],
  ["muted on paper", "#5d665e", "#f2f4ef", 4.5],
  ["signal on paper", "#b23a22", "#f2f4ef", 4.5],
  ["clear on paper", "#2c664a", "#f2f4ef", 4.5],
  ["hold on paper", "#8a621c", "#f2f4ef", 4.5],
  ["ink on white", "#161b17", "#ffffff", 4.5],
  ["muted on white", "#5d665e", "#ffffff", 4.5],
  ["signal on white", "#b23a22", "#ffffff", 4.5],
  ["clear on white", "#2c664a", "#ffffff", 4.5],
  ["hold on white", "#8a621c", "#ffffff", 4.5],
  ["paper on ink", "#f2f4ef", "#161b17", 4.5],
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

let failed = 0;
for (const [name, foreground, background, minimum] of pairs) {
  const value = ratio(foreground, background);
  const pass = value >= minimum;
  if (!pass) failed += 1;
  console.log(`${pass ? "PASS" : "FAIL"} ${name}: ${value.toFixed(2)}:1 (min ${minimum}:1)`);
}

if (failed > 0) {
  console.error(`\n${failed} contrast pair${failed === 1 ? "" : "s"} failed.`);
  process.exitCode = 1;
} else {
  console.log("\nAll contrast pairs pass.");
}
