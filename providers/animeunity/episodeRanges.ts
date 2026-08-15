import { Link } from "../types";

export const ANIMEUNITY_EPISODE_RANGE_SIZE = 120;
export const ANIMEUNITY_SPECIALS_LOOKAHEAD = 30;
const EPISODE_RANGE_KEY = "Episodes {{start}}-{{end}}";

export type EpisodeRangeRequest = {
  animeId: number;
  start: number;
  end?: number;
};

export type EpisodeFetchRange = {
  start: number;
  end: number;
};

export const buildEpisodeRangeLinks = (
  animeId: number,
  totalCount: number,
  rangeSize = ANIMEUNITY_EPISODE_RANGE_SIZE
): Link[] => {
  if (
    !Number.isFinite(animeId) ||
    animeId <= 0 ||
    totalCount <= 0 ||
    rangeSize <= 0
  ) return [];
  const links: Link[] = [];
  for (let start = 1; start <= totalCount; start += rangeSize) {
    const end = Math.min(start + rangeSize - 1, totalCount);
    links.push({
      title: `Episodes ${start}-${end}`,
      titleKey: EPISODE_RANGE_KEY,
      titleParams: { start, end },
      availabilityStatus: "available",
      episodesLink: `${animeId}|${start}|${end}`,
    });
  }
  return links;
};

export const parseEpisodeRangeRequest = (value: string): EpisodeRangeRequest | null => {
  const parts = String(value || "").split("|");
  const animeId = Number.parseInt(parts[0] || "", 10);
  if (!Number.isFinite(animeId) || animeId <= 0) return null;

  const rawStart = Number.parseInt(parts[1] || "", 10);
  const rawEnd = Number.parseInt(parts[2] || "", 10);
  const start = Number.isFinite(rawStart) && rawStart > 0 ? rawStart : 1;
  const end = Number.isFinite(rawEnd) && rawEnd >= start ? rawEnd : undefined;
  return { animeId, start, end };
};

export const buildEpisodeFetchRanges = (
  request: EpisodeRangeRequest,
  totalCount: number,
  rangeSize = ANIMEUNITY_EPISODE_RANGE_SIZE,
  specialsLookahead = ANIMEUNITY_SPECIALS_LOOKAHEAD
): EpisodeFetchRange[] => {
  if (totalCount <= 0 || rangeSize <= 0) return [];
  const requestedEnd = request.end ?? totalCount;
  const isLastRange = requestedEnd >= totalCount;
  const finalEnd = isLastRange ? requestedEnd + specialsLookahead : requestedEnd;
  const firstStart = request.end ? (request.start <= 1 ? 0 : request.start) : 0;
  const ranges: EpisodeFetchRange[] = [];
  for (let start = firstStart; start <= finalEnd; start += rangeSize) {
    ranges.push({ start, end: Math.min(start + rangeSize - 1, finalEnd) });
  }
  return ranges;
};
