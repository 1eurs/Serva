/**
 * Guards against the RTL reordering bug class.
 *   node scripts/check-bidi.mjs
 *
 * THE RULE (measured, not guessed — see lib/i18n.tsx `Ltr`):
 *   A string made of ONE numeric run is safe. "1.900" and "4/17" survive an Arabic page,
 *   because a digit-to-digit separator keeps them a single run.
 *   A string made of TWO OR MORE runs joined by a NEUTRAL — a space, a dash, "×", "@",
 *   "#", "·", or a leading sign — is ordered by the paragraph instead. In Arabic it comes
 *   out backwards, and the result is not merely ugly:
 *       7:00-23:00  ->  23:00-7:00     wrong opening hours
 *       #128        ->  128#           wrong order number on a tax invoice
 *       2×          ->  ×2             every item line of every printed receipt
 *       -12%        ->  %12-           the discount badge on the customer menu
 *
 * Why a static check and not a screenshot: this bug is invisible in English and invisible
 * in code review, so it kept coming back — it had already been hand-patched four separate
 * times on phone numbers before anyone noticed the shape. A grep for the SHAPE is what
 * catches the next one; a screenshot only catches what someone thought to photograph.
 *
 * This is a heuristic, on purpose. It cannot tell prose from a format — a person's name
 * must stay direction-neutral while their phone number must not — so it flags the shapes
 * that are nearly always machine data and lets a line opt out by isolating it.
 *
 * To silence a hit, isolate the value (that IS the fix):
 *   JSX     <Ltr>{qty}×</Ltr>          from '../../lib/i18n'
 *   string  ltrText(`${qty}×`)         same module
 * or, if the line is genuinely prose, add the marker comment: bidi-ok
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('../src', import.meta.url).pathname;

/** A line already carrying any of these is considered handled. */
const ISOLATED = [/<Ltr>/, /\bltrText\(/, /dir="ltr"/, /dir=\{/, /bidi-ok/];

/** `bidi-ok` opts out the lines below it too, so the reason can sit in a comment above
 *  a wrapped expression rather than being crammed onto the matching line. */
const OPT_OUT = /bidi-ok/;
const OPT_OUT_LOOKBACK = 3;

/** Inputs take dir="ltr" for typing direction; that is not the display bug. */
const NOT_DISPLAY = /<(input|textarea)\b/;

const RULES = [
  { id: 'quantity',   re: /\{[^{}]+\}\s*×/,       why: 'quantity + "×" reverses to "×2"' },
  { id: 'hash-num',   re: /#\{[^{}]+\}/,           why: '"#" + number reverses to "128#"' },
  { id: 'signed-pct', re: /[−-]\{[^{}]+\}%/,       why: 'signed percentage reverses to "%12−"' },
  // Only DATES are multi-run. n.toLocaleString() on a number is one run and is safe,
  // so this deliberately matches a Date receiver rather than the method name alone.
  { id: 'locale-date', re: /\.toLocale(TimeString|DateString)\(|new Date\([^)]*\)[^;]*\.toLocaleString\(/,
    why: 'formatted date/time is multi-run' },
  { id: 'bare-phone', re: /\{[^{}]*\.phone\b[^{}]*\}/, why: 'a phone number is multi-run' },
  { id: 'joined',     re: /`[^`]*\s·\s\$\{[^}]*(phone|quantity|dailyNumber|amount|count|omr\()/,
    why: 'a numeric value joined with " · " inside a template string' },
];

/** Values that are prose or never rendered as text, whatever shape they take. */
const NEVER_TEXT = [
  /\berrors\./,          // validation messages
  /\.slice\(/,           // an initial, not the value
  /\bkey=\{/,            // React key
];

/** True when the match sits in an attribute (key=, aria-*, title=, id=…) rather than
 *  in JSX child position — attributes are not laid out as bidi text on the page. */
function inAttribute(line, index) {
  const before = line.slice(0, index);
  return /=\s*$/.test(before) || /=\{[^}]*$/.test(before);
}

const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.tsx?$/.test(p)) files.push(p);
  }
})(ROOT);

const hits = [];
for (const file of files) {
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (ISOLATED.some((r) => r.test(line)) || NOT_DISPLAY.test(line)) return;
    for (let k = 1; k <= OPT_OUT_LOOKBACK && i - k >= 0; k++) if (OPT_OUT.test(lines[i - k])) return;
    if (NEVER_TEXT.some((r) => r.test(line))) return;
    for (const rule of RULES) {
      const m = rule.re.exec(line);
      if (m && !inAttribute(line, m.index)) {
        hits.push({ file: relative(ROOT, file), line: i + 1, id: rule.id, why: rule.why, src: line.trim() });
        break;
      }
    }
  });
}

if (hits.length === 0) {
  console.log(`✓  bidi: no unisolated machine-format values in ${files.length} files`);
  process.exit(0);
}

console.log(`✗  bidi: ${hits.length} value(s) will reorder on an Arabic page\n`);
for (const h of hits) {
  console.log(`  src/${h.file}:${h.line}  [${h.id}]  ${h.why}`);
  console.log(`      ${h.src.length > 120 ? h.src.slice(0, 117) + '...' : h.src}\n`);
}
console.log('  Fix: wrap the value in <Ltr> (JSX) or ltrText() (string) from lib/i18n.');
console.log('  If the line is genuinely prose, mark it with the comment: bidi-ok');
process.exit(1);
