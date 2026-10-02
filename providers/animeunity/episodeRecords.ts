import { ProviderContext } from "../types";
import { DEFAULT_HEADERS, TIMEOUTS } from "./config";
import { buildEpisodeFetchRanges } from "./episodeRanges";

export type AnimeUnityEpisodeSpan = {
  label: string;
  start: number;
  end: number;
};

export type AnimeUnityEpisodeRecord = AnimeUnityEpisodeSpan & {
  id: string;
  raw: any;
};

export function parseAnimeUnityEpisodeSpan(
  value: unknown
): AnimeUnityEpisodeSpan | null {
  const label = String(value ?? "").trim();
  const match = label.match(/^(\d+)(?:\s*-\s*(\d+))?$/);
  if (!match) return null;
  const start = Number.parseInt(match[1], 10);
  const end = Number.parseInt(match[2] || match[1], 10);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start <= 0 || end < start) {
    return null;
  }
  return { label, start, end };
}

export async function fetchAnimeUnityEpisodeRecords({
  providerContext,
  baseHost,
  animeId,
  totalCount,
  start = 1,
  end = totalCount,
}: {
  providerContext: ProviderContext;
  baseHost: string;
  animeId: number;
  totalCount: number;
  start?: number;
  end?: number;
}): Promise<AnimeUnityEpisodeRecord[]> {
  const records: AnimeUnityEpisodeRecord[] = [];
  const seen = new Set<string>();
  const ranges = buildEpisodeFetchRanges(
    { animeId, start, end },
    totalCount
  );
  for (const range of ranges) {
    try {
      const response = await providerContext.axios.get(
        `${baseHost}/info_api/${animeId}/1?start_range=${range.start}&end_range=${range.end}`,
        {
          headers: { ...DEFAULT_HEADERS, Referer: `${baseHost}/` },
          timeout: TIMEOUTS.LONG,
        }
      );
      for (const raw of response.data?.episodes || []) {
        const id = String(raw?.id || "").trim();
        const span = parseAnimeUnityEpisodeSpan(raw?.number);
        if (!id || !span || seen.has(id)) continue;
        if (span.start < start || span.end > end) continue;
        seen.add(id);
        records.push({ id, ...span, raw });
      }
    } catch (_) {
      // A partial failure must not invalidate the normal AniBridge fallback.
    }
  }
  return records.sort((left, right) => left.start - right.start || left.end - right.end);
}
