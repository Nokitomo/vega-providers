import { Stream } from "./types";

const buildStreamIdentity = (link: string): string =>
  String(link || "").trim().replace(/&amp;/gi, "&");

export const deduplicateStreams = (streams: Stream[]): Stream[] => {
  const seen = new Set<string>();
  return (Array.isArray(streams) ? streams : []).filter((stream) => {
    const identity = buildStreamIdentity(stream?.link);
    if (!identity || seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
};
