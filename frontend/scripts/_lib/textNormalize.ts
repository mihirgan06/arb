const URL_RE = /\bhttps?:\/\/\S+|\bwww\.\S+/gi;
const HANDLE_RE = /@\w+/g;
const TAG_RE = /[#$]([A-Za-z0-9_]+)/g;
const WS_RE = /\s+/g;

const CJK_RE = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;

function isLetter(ch: string) {
  return /\p{L}/u.test(ch);
}

function isLatinLetter(ch: string) {
  return /\p{Script=Latin}/u.test(ch);
}

export function shouldSkipNonEnglish(text: string): boolean {
  if (CJK_RE.test(text)) return true;

  let letters = 0;
  let nonLatin = 0;
  for (const ch of text) {
    if (!isLetter(ch)) continue;
    letters += 1;
    if (!isLatinLetter(ch)) nonLatin += 1;
  }

  if (letters === 0) return false;
  return nonLatin / letters > 0.3;
}

export function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .replace(URL_RE, "<URL>")
    .replace(HANDLE_RE, "<USER>")
    .replace(TAG_RE, "$1")
    .replace(WS_RE, " ")
    .trim();
}

