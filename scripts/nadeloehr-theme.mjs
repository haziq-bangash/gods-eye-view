#!/usr/bin/env node
// Nadelöhr theme: turns the upstream God's Eye View colours (cyan on
// blue-black) into role variables, so one stylesheet serves Apple-style light
// and dark Liquid Glass (src/ui/styles/foundation.css sets the values per
// `prefers-color-scheme`). Re-run after merging upstream:
//
//   node scripts/nadeloehr-theme.mjs          rewrite the stylesheets
//   node scripts/nadeloehr-theme.mjs --check  exit 1 if anything is unthemed
//
// Colours are classified by hue, saturation and lightness, so the long tail of
// hand-tuned upstream values follows one rule:
// - dark surfaces (any hue, lightness <= 16%)     -> rgb(var(--surface-rgb) / a)
// - near-white text and hairlines                  -> rgb(var(--ink-rgb) / a)
// - saturated cyan/blue (the upstream accent)      -> rgb(var(--accent*-rgb) / a)
// - muted teal / blue-grey text                    -> secondary ink (ink at 62%)
// Pure black (shadows), reds, ambers, greens and mid greys keep their values:
// they carry status meaning or already work in both appearances. Backdrop
// blurs become the shared Liquid Glass material, `var(--glass-filter)`.
// Themed values are variables, so a second run finds nothing to change.
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');

/**
 * Opt-in skins keep their own look: Cyber (DISPLAY > HUD > Layout) is a
 * deliberate alternative to the default chrome, and its tests pin its colours.
 */
const KEEP_UPSTREAM = new Set(['src/ui/styles/cyber.css']);

export function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: h * 60, s, l };
}

/**
 * The role of an upstream colour, or null to keep it.
 * @returns {{variable: string, alpha?: number} | null} `alpha` scales the
 *   colour's own alpha (secondary text is ink at 62%).
 */
export function colorRole(r, g, b) {
  if (r === 0 && g === 0 && b === 0) return null; // shadows
  const { h, s, l } = rgbToHsl(r, g, b);
  const cool = h >= 165 && h <= 255;
  if (l <= 0.16 && (cool || s < 0.12)) return { variable: '--surface-rgb' };
  if (l >= 0.82 && (cool || s < 0.12)) return { variable: '--ink-rgb' };
  if (!cool || s < 0.06) return null;
  if (s >= 0.55) {
    if (l >= 0.62) return { variable: '--accent-hi-rgb' };
    if (l < 0.4) return { variable: '--accent-lo-rgb' };
    return { variable: '--accent-rgb' };
  }
  return { variable: '--ink-rgb', alpha: 0.62 };
}

const round = (n) => Math.round(n * 1000) / 1000;

/** `rgb(var(--x) / a)`, with the alpha written as the source wrote it. */
function roleValue(role, alphaText) {
  if (!alphaText && !role.alpha) return `rgb(var(${role.variable}))`;
  let alpha = alphaText || '1';
  if (role.alpha) {
    const percent = alpha.trim().endsWith('%');
    const value = parseFloat(alpha) / (percent ? 100 : 1);
    alpha = String(round(value * role.alpha));
  }
  return `rgb(var(${role.variable}) / ${alpha.trim()})`;
}

// rgb()/rgba() with comma or space syntax and an optional alpha.
const RGB =
  /rgba?\(\s*(\d{1,3})(?:\s*,\s*|\s+)(\d{1,3})(?:\s*,\s*|\s+)(\d{1,3})\s*(?:(?:,|\/)\s*([\d.]+%?)\s*)?\)/gi;
const HEX = /#([0-9a-f]{6}|[0-9a-f]{3})\b/gi;
const BLUR = /((?:-webkit-)?backdrop-filter:\s*)(?!none\b)[^;]*blur\([^;]*;/g;

/**
 * Rewrite one line. Lines with url(...) (data URIs) and the brand palette's
 * own definitions (`--brand-*`) are left alone.
 */
function themeLine(line, count) {
  if (/url\(/i.test(line) || /^\s*--brand-/.test(line)) return line;
  let out = line.replace(RGB, (match, r, g, b, alpha) => {
    const role = colorRole(+r, +g, +b);
    if (!role) return match;
    count.n++;
    return roleValue(role, alpha);
  });
  out = out.replace(HEX, (match, digits) => {
    const full =
      digits.length === 3 ? digits.replace(/./g, (c) => c + c) : digits;
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
    const role = colorRole(r, g, b);
    if (!role) return match;
    count.n++;
    return roleValue(role);
  });
  out = out.replace(BLUR, (match, property) => {
    if (match.includes('var(--glass-filter)')) return match;
    count.n++;
    return `${property}var(--glass-filter);`;
  });
  return out;
}

/** Rewrite every themeable colour and blur in a stylesheet's text. */
export function themeText(text) {
  const count = { n: 0 };
  const out = text
    .split('\n')
    .map((line) => themeLine(line, count))
    .join('\n');
  return { text: out, changes: count.n };
}

/** Stylesheets and Vue single-file components the UI chrome is painted with. */
function themedFiles() {
  return execFileSync(
    'git',
    ['ls-files', 'src/ui/styles/*.css', 'src/**/*.vue', 'src/*.vue'],
    { cwd: ROOT, encoding: 'utf8' },
  )
    .split(/\r?\n/)
    .filter((file) => file && !KEEP_UPSTREAM.has(file));
}

async function main() {
  const check = process.argv.includes('--check');
  let total = 0;
  const touched = [];
  for (const file of themedFiles()) {
    const full = path.join(ROOT, file);
    const before = await readFile(full, 'utf8');
    const { text, changes } = themeText(before);
    if (!changes) continue;
    total += changes;
    touched.push(`${file} (${changes})`);
    if (!check) await writeFile(full, text);
  }
  if (check) {
    if (total) {
      console.error(`Unthemed values: ${total}\n  ${touched.join('\n  ')}`);
      process.exitCode = 1;
    } else console.log('Nadelöhr theme: all stylesheets themed.');
    return;
  }
  console.log(`Nadelöhr theme: ${total} values in ${touched.length} files.`);
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await main();
