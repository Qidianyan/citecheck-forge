// Numeric claim check (H7): durations, percentages and money amounts in a claim vs the cited article.
// Units are normalised across Vietnamese, Indonesian, Thai, English and Chinese so a Chinese paraphrase
// of a Vietnamese article can still be compared on its numbers.
import { thaiDigits } from './normalize.js';

const UNIT_WORDS = [
  ['day', /^(?:ngày|hari|วัน|days?|天|日|个工作日|工作日|working days?|hari kerja)/iu],
  ['hour', /^(?:giờ|jam|ชั่วโมง|hours?|小时|個小時|个小时)/iu],
  ['month', /^(?:tháng|bulan|เดือน|months?|个月|個月|月)/iu],
  ['year', /^(?:năm|tahun|ปี|years?|年)/iu],
  ['percent', /^(?:%|％|phần trăm|persen|เปอร์เซ็นต์|percent|per cent)/iu],
];
// Money: amount + optional magnitude + currency; value normalised to the base currency unit.
const MAG = [
  [/^(?:tỷ|tỉ|miliar|billion|bn)/iu, 1e9], [/^(?:triệu|juta|million|mn)/iu, 1e6], [/^(?:nghìn|ngàn|ribu|thousand)/iu, 1e3],
  [/^亿/u, 1e8], [/^万/u, 1e4], [/^千/u, 1e3], [/^ล้าน/u, 1e6], [/^แสน/u, 1e5], [/^หมื่น/u, 1e4], [/^พัน/u, 1e3],
];
const CURRENCY = /^(?:đồng|vnd|vnđ|越南盾|盾|rupiah|rp|印尼盾|baht|บาท|泰铢|铢|thb|idr)/iu;
const CURRENCY_PREFIX = /(?:Rp\.?|IDR|VND|THB|฿)\s*$/iu;

const NUM = /\d+(?:[.,\s]\d{3})*(?:[.,]\d+)?/gu;

function parseNumber(s) {
  const t = s.replace(/\s/gu, '');
  // "1.000.000" / "1,000,000" thousands separators; a single "." or "," followed by 1-2 digits is a decimal.
  if (/^\d{1,3}(?:\.\d{3})+(?:,\d+)?$/u.test(t)) return Number(t.replace(/\./gu, '').replace(',', '.'));
  if (/^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/u.test(t)) return Number(t.replace(/,/gu, ''));
  return Number(t.replace(',', '.'));
}

/** Extract [{ unit, value, raw }] from text. Bare numbers (article numbers, years of laws) are ignored. */
export function numericFacts(text) {
  const s = thaiDigits(String(text || '').normalize('NFC'));
  const out = [];
  for (const m of s.matchAll(NUM)) {
    const raw = m[0].trim();
    if (!raw) continue;
    const value = parseNumber(raw);
    if (!Number.isFinite(value)) continue;
    const before = s.slice(Math.max(0, m.index - 6), m.index);
    let rest = s.slice(m.index + m[0].length).replace(/^\s+/u, '');
    // Skip law numbers and article references: "13/2023", "Điều 9", "第9条", "Pasal 5".
    if (/^\/\d/u.test(rest) || /(?:Điều|Pasal|Article|Section|มาตรา|第|khoản|ayat|Nomor|No\.|số)\s*$/iu.test(before)) continue;
    if (/^(?:条|款|項|项)/u.test(rest)) continue;
    let mult = 1;
    for (const [re, f] of MAG) if (re.test(rest)) { mult = f; rest = rest.replace(re, '').replace(/^\s+/u, ''); break; }
    if (CURRENCY.test(rest) || CURRENCY_PREFIX.test(before)) { out.push({ unit: 'money', value: value * mult, raw }); continue; }
    let unit = null;
    for (const [u, re] of UNIT_WORDS) if (re.test(rest)) { unit = u; break; }
    if (unit && mult === 1) out.push({ unit, value, raw });
  }
  return out;
}

/**
 * Compare claim numbers with the article's numbers of the same unit. Returns null when nothing can be
 * compared, else { mismatches: [{ unit, claimed, official: [...] }], matched: n }.
 * A claimed value counts as a mismatch only when the article states numbers of that unit and none equals it.
 */
export function compareNumbers(claim, articleText) {
  const c = numericFacts(claim);
  if (!c.length) return null;
  const a = numericFacts(articleText);
  const byUnit = new Map();
  for (const f of a) { if (!byUnit.has(f.unit)) byUnit.set(f.unit, new Set()); byUnit.get(f.unit).add(f.value); }
  const mismatches = [];
  let matched = 0;
  for (const f of c) {
    const off = byUnit.get(f.unit);
    if (!off) continue;
    if (off.has(f.value)) matched++;
    else mismatches.push({ unit: f.unit, claimed: f.value, official: [...off].slice(0, 5) });
  }
  if (!matched && !mismatches.length) return null;
  return { mismatches, matched };
}
