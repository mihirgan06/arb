const URL_RE = /\bhttps?:\/\/\S+|\bwww\.\S+/gi;
const HANDLE_RE = /@\w+/g;
const TAG_RE = /[#$]([A-Za-z0-9_]+)/g;
const WS_RE = /\s+/g;

export function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .replace(URL_RE, "<URL>")
    .replace(HANDLE_RE, "<USER>")
    .replace(TAG_RE, "$1")
    .replace(WS_RE, " ")
    .trim();
}

