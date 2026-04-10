import { resolveMediaUrl } from "./url";

export const buildStreamHgRedirectUrl = (url: string): string => {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const idMatch = parsed.pathname.match(/^\/e\/([a-z0-9]+)$/i);
    if (
      idMatch?.[1] &&
      (host === "dhcplay.com" ||
        host.endsWith(".dhcplay.com") ||
        host.includes("streamhg"))
    ) {
      return `https://vibuxer.com/e/${idMatch[1]}`;
    }
  } catch (_) {
    // ignore malformed URL
  }
  return "";
};

export const extractDirectMediaCandidates = (
  text: string,
  baseUrl: string
): string[] => {
  if (!text) return [];
  const candidates = new Set<string>();

  const pushCandidate = (value: string): void => {
    if (!value) return;
    const cleaned = value.replace(/\\\//g, "/").replace(/&amp;/g, "&").trim();
    if (!cleaned) return;
    const resolved = resolveMediaUrl(cleaned, baseUrl);
    if (/\.m3u8(?:[?#][^"'\s]*)?$/i.test(resolved)) {
      candidates.add(resolved);
      return;
    }
    if (/\.mp4(?:[?#][^"'\s]*)?$/i.test(resolved)) {
      candidates.add(resolved);
    }
  };

  for (const match of text.matchAll(/https?:[^"'\s]+?\.(?:m3u8|mp4)[^"'\s]*/gi)) {
    pushCandidate(match[0]);
  }
  for (const match of text.matchAll(/\/\/[^"'\s]+?\.(?:m3u8|mp4)[^"'\s]*/gi)) {
    pushCandidate(match[0]);
  }
  for (const match of text.matchAll(/\/[a-z0-9/_-]+?\.m3u8[^"'\s]*/gi)) {
    pushCandidate(match[0]);
  }

  return Array.from(candidates);
};
