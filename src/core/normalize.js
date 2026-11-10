// Text normalisation helpers — port of the legacy Python verifier (verify.py) with Python `re` Unicode semantics.
const THAI = '๐๑๒๓๔๕๖๗๘๙';
export const THAI_DIGITS_MAP = Object.fromEntries([...THAI].map((c, i) => [c, String(i)]));
export const thaiDigits = (s) => s.replace(/[๐-๙]/gu, (c) => THAI_DIGITS_MAP[c]);

// Python `\w` (str.isalnum() or '_') and `\d` (Unicode decimal digit).
export const W = '\\p{L}\\p{N}_';
export const D = '\\p{Nd}';

const CN_NUM = { '零': 0, '〇': 0, '一': 1, '二': 2, '两': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9 };

/** Convert any Unicode decimal digits to ASCII (Python int() accepts them). */
export function asciiDigits(s) {
  return s.replace(/\p{Nd}/gu, (ch) => {
    const cp = ch.codePointAt(0);
    let zero = cp;
    while (zero > 0 && cp - zero < 9 && /\p{Nd}/u.test(String.fromCodePoint(zero - 1))) zero--;
    return String((cp - zero) % 10);
  });
}

export function cn2int(s) {
  if (/^\p{Nd}+$/u.test(s)) return parseInt(asciiDigits(s), 10);
  let total = 0, cur = 0;
  for (const ch of s) {
    if (ch in CN_NUM) cur = CN_NUM[ch];
    else if (ch === '十') { total += (cur || 1) * 10; cur = 0; }
    else if (ch === '百') { total += (cur || 1) * 100; cur = 0; }
    else if (ch === '千') { total += (cur || 1) * 1000; cur = 0; }
  }
  return total + cur;
}

export function scriptOf(s) {
  if (/[\u0e00-\u0e7f]/u.test(s)) return 'th';
  if (/[\u4e00-\u9fff]/u.test(s)) return 'zh';
  return 'latin';
}

/** Python str.strip() / slicing by code points. */
export const strip = (s) => s.replace(/^\s+|\s+$/gu, '');
export const cpSlice = (s, a, b) => Array.from(s).slice(a, b).join('');
export const cpLen = (s) => Array.from(s).length;

export function norm(s) {
  s = thaiDigits(s.normalize('NFC')).toLowerCase();
  s = s.replaceAll('\u0e4d\u0e32', '\u0e32').replaceAll('\u0e33', '\u0e32').replaceAll('\u0e4d', '');
  s = s.replace(new RegExp(`[^${W}\\s]`, 'gu'), ' ');
  s = s.replace(/(?<=[\u0e00-\u0e7f])\s+(?=[\u0e00-\u0e7f])/gu, '');
  return strip(s.replace(/\s+/gu, ' '));
}

export function tokens(s) {
  let t = norm(s);
  if (/[\u0e00-\u0e7f\u4e00-\u9fff]/u.test(t)) {
    t = t.replaceAll(' ', '');
    const cps = Array.from(t);
    const out = [];
    for (let i = 0; i < Math.max(1, cps.length - 2); i++) out.push(cps.slice(i, i + 3).join(''));
    return out;
  }
  return t ? t.split(/\s+/u) : [];
}
