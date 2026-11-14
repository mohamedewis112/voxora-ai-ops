/**
 * Voxora AI — phone normalization (Egypt focus, generic enough for +20 style inputs).
 * All duplicate detection / owner matching MUST go through `normalizePhone`.
 *
 * Examples:
 *   "01012345678"       → { local: "01012345678", canonical: "+201012345678", prefix: "010" }
 *   "+20 10 1234 5678"  → same canonical
 *   "00201012345678"    → same canonical
 *   "20 11 1234 5678"   → same canonical
 *   "02-23456789"       → landline (no prefix, still normalized)
 */

export interface NormalizedPhone {
  ok: boolean;
  raw: string;
  local: string; // "01012345678" or "0223456789"
  canonical: string; // "+201012345678" / "+20223456789"
  prefix: string | null; // "010" | "011" | "012" | "015" | null for landlines
  kind: "mobile" | "landline" | "invalid";
}

const MOBILE_PREFIXES = ["010", "011", "012", "015"];

export function normalizePhone(rawInput: string): NormalizedPhone {
  const raw = (rawInput ?? "").trim();
  if (!raw) return { ok: false, raw, local: "", canonical: "", prefix: null, kind: "invalid" };

  let digits = raw.replace(/[^\d+]/g, "");
  let plus = digits.startsWith("+");
  digits = digits.replace(/\+/g, "");

  // Strip common country code forms: 0020 / +20 / 20
  if (digits.startsWith("0020")) {
    digits = digits.slice(4);
    plus = true;
  } else if (digits.startsWith("20") && digits.length >= 12) {
    digits = digits.slice(2);
    plus = true;
  }

  // Normalize to local representation
  let local: string;
  if (!plus && digits.startsWith("0")) {
    local = digits; // already local
  } else if (plus || (!digits.startsWith("0") && digits.length >= 10)) {
    // country code without leading zero: 1012345678 → 01012345678
    local = "0" + digits;
  } else {
    local = digits;
  }

  // Mobile?
  for (const p of MOBILE_PREFIXES) {
    if (local.startsWith(p) && local.length === 11) {
      return { ok: true, raw, local, canonical: "+2" + local, prefix: p, kind: "mobile" };
    }
  }
  // Landline: 02 + 8/9 digits
  if (/^0[1-5]\d{7,9}$/.test(local)) {
    return { ok: true, raw, local, canonical: "+2" + local, prefix: null, kind: "landline" };
  }
  return { ok: false, raw, local, canonical: "", prefix: null, kind: "invalid" };
}

export function isValidPhone(raw: string): boolean {
  return normalizePhone(raw).ok;
}

/** Arabic-friendly name normalization used by duplicate matching. */
export function normalizeName(name: string): string {
  return (name ?? "")
    .replace(/[\u064B-\u0652\u0670]/g, "") // diacritics
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^\p{L}\p{N}]/gu, "")
    .trim()
    .toLowerCase();
}

export function nameSimilarity(a: string, b: string): number {
  const x = normalizeName(a);
  const y = normalizeName(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  // containment bonus (e.g. "صيدلية الشفاء" vs "صيدليه الشفا فرع المعادي")
  if (x.includes(y) || y.includes(x)) return 0.92;
  return levenshteinRatio(x, y);
}

function levenshteinRatio(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (!m || !n) return 0;
  const dp = new Array(n + 1).fill(0);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return 1 - dp[n] / Math.max(m, n);
}

/** Display helper: canonical → Egyptian local display. */
export function displayPhone(canonical: string): string {
  if (canonical?.startsWith("+20")) return canonical.slice(3);
  return canonical;
}
