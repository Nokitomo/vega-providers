import { TextTracks } from "../../types";
import { resolveMediaUrl } from "./url";

const normalizeSubtitleLanguage = (label: string, fileUrl: string): string => {
  const normalizedLabel = label.trim().toLowerCase();
  const fromLabelMap: Record<string, string> = {
    italian: "it",
    english: "en",
    spanish: "es",
    french: "fr",
    german: "de",
    japanese: "ja",
    chinese: "zh",
    russian: "ru",
    turkish: "tr",
    arabic: "ar",
    hebrew: "he",
    greek: "el",
    bulgarian: "bg",
    ukrainian: "uk",
    catalan: "ca",
    indonesian: "id",
    malay: "ms",
    thai: "th",
  };
  if (fromLabelMap[normalizedLabel]) {
    return fromLabelMap[normalizedLabel];
  }
  const suffixMatch = fileUrl.match(/_([a-z]{3})\.(?:vtt|srt|ttml)$/i);
  if (suffixMatch) {
    const code = suffixMatch[1].toLowerCase();
    const fromCodeMap: Record<string, string> = {
      ita: "it",
      eng: "en",
      spa: "es",
      fre: "fr",
      ger: "de",
      jpn: "ja",
      chi: "zh",
      rus: "ru",
      tur: "tr",
      ara: "ar",
      heb: "he",
      gre: "el",
      bul: "bg",
      ukr: "uk",
      cat: "ca",
      ind: "id",
      may: "ms",
      tha: "th",
    };
    return fromCodeMap[code] || code;
  }
  return normalizedLabel || "und";
};

const resolveSubtitleType = (fileUrl: string): TextTracks[0]["type"] => {
  const lower = fileUrl.toLowerCase();
  if (lower.endsWith(".srt")) return "application/x-subrip";
  if (lower.endsWith(".ttml")) return "application/ttml+xml";
  return "text/vtt";
};

export const parseTracksFromDecoded = (
  decoded: string,
  baseUrl?: string
): TextTracks => {
  if (!decoded) return [];
  const tracks: TextTracks = [];
  const trackBlockMatch = decoded.match(/tracks\s*:\s*\[([\s\S]*?)\]/);
  const block = trackBlockMatch ? trackBlockMatch[1] : "";
  if (!block) {
    return [];
  }
  const regex =
    /\{[^}]*?file\s*:\s*["']([^"']+)["'][^}]*?(?:label|title)\s*:\s*["']([^"']+)["'][^}]*?kind\s*:\s*["']([^"']+)["'][^}]*?\}/gi;
  let match: RegExpExecArray | null = null;
  while ((match = regex.exec(block))) {
    const file = match[1];
    const label = match[2];
    const kind = match[3];
    if (!file || kind.toLowerCase() !== "captions") {
      continue;
    }
    const resolved = baseUrl ? resolveMediaUrl(file, baseUrl) : file;
    tracks.push({
      title: label || resolved || file,
      language: normalizeSubtitleLanguage(label || "", file),
      type: resolveSubtitleType(file),
      uri: resolved || file,
    });
  }
  if (tracks.length > 0) {
    return tracks;
  }
  const looseRegex = /https?:[^"'\s]+\.vtt[^"'\s]*/gi;
  const seen = new Set<string>();
  let urlMatch: RegExpExecArray | null = null;
  while ((urlMatch = looseRegex.exec(block))) {
    const file = urlMatch[0];
    const resolved = baseUrl ? resolveMediaUrl(file, baseUrl) : file;
    const key = resolved || file;
    if (seen.has(key)) continue;
    seen.add(key);
    tracks.push({
      title: resolved || file,
      language: normalizeSubtitleLanguage("", file),
      type: resolveSubtitleType(file),
      uri: resolved || file,
    });
  }
  return tracks;
};
