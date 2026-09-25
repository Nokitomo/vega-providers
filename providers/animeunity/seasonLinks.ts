import { Link } from "../types";
import { parseSeasonScope } from "./mappings";
import { AnimeMappingResolution, AniBridgeTarget } from "./mappings";

type SourceRange = {
  start: number;
  end: number;
};

const parseSourceRange = (value: string): SourceRange | null => {
  const match = String(value || "")
    .trim()
    .match(/^(\d+)(?:-(\d+))?$/);
  if (!match?.[1]) return null;
  const start = Number.parseInt(match[1], 10);
  const end = match[2] ? Number.parseInt(match[2], 10) : start;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start <= 0 || end < start) {
    return null;
  }
  return { start, end };
};

const selectPrimaryTmdbShowId = (targets: AniBridgeTarget[]): string | undefined => {
  const scores = new Map<string, number>();
  targets.forEach((target) => {
    if (target.provider !== "tmdb_show") return;
    scores.set(
      target.id,
      (scores.get(target.id) || 0) + Object.keys(target.ranges || {}).length
    );
  });
  return Array.from(scores.entries()).sort(
    (left, right) => right[1] - left[1] || left[0].localeCompare(right[0])
  )[0]?.[0];
};

export function buildTmdbSeasonEpisodeLinks({
  animeId,
  totalCount,
  mappingResolution,
}: {
  animeId: number;
  totalCount?: number;
  mappingResolution: AnimeMappingResolution;
}): Link[] {
  if (!Number.isFinite(animeId) || animeId <= 0 || !totalCount || totalCount <= 0) {
    return [];
  }

  const primaryShowId = selectPrimaryTmdbShowId(mappingResolution.targets);
  if (!primaryShowId) return [];

  const links: Link[] = [];
  mappingResolution.targets
    .filter(
      (target) =>
        target.provider === "tmdb_show" &&
        target.id === primaryShowId &&
        parseSeasonScope(target.scope) != null
    )
    .forEach((target) => {
      const seasonNumber = parseSeasonScope(target.scope);
      const ranges = Object.keys(target.ranges || {})
        .map(parseSourceRange)
        .filter((range): range is SourceRange => range != null);
      if (seasonNumber == null || ranges.length === 0) return;
      const start = Math.min(...ranges.map((range) => range.start));
      const end = Math.max(...ranges.map((range) => range.end));
      if (start > totalCount) return;
      links.push({
        title: `Season ${seasonNumber}`,
        titleKey: "Season {{number}}",
        titleParams: { number: seasonNumber },
        seasonNumber,
        availabilityStatus: "available" as const,
        episodesLink: `${animeId}|${start}|${Math.min(end, totalCount)}`,
      });
    });
  links.sort((left, right) => {
    const leftSeason = Number(left.seasonNumber) || 0;
    const rightSeason = Number(right.seasonNumber) || 0;
    return leftSeason - rightSeason;
  });

  return links.length > 1 ? links : [];
}
