import { Link } from "../types";
import { EPISODE_RANGE_KEY } from "./episodeRanges";
import { parseSeasonScope } from "./mappings";
import { AnimeMappingResolution, AniBridgeTarget } from "./mappings";
import { TmdbSeasonMetadata } from "./tmdb";

type SourceRange = {
  start: number;
  end: number;
};

type SeasonRange = SourceRange & {
  seasonNumber: number;
  title?: string;
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

const localizedSeasonTitle = (
  seasonNumber: number,
  tmdbSeasons?: TmdbSeasonMetadata[]
): string | undefined => {
  const value = tmdbSeasons?.find(
    (season) => season.seasonNumber === seasonNumber
  )?.name?.value;
  const title = String(value || "").replace(/\s+/g, " ").trim();
  return title || undefined;
};

const toSeasonLink = (animeId: number, totalCount: number, range: SeasonRange): Link => {
  const end = Math.min(range.end, totalCount);
  const title = range.title || `Season ${range.seasonNumber}`;
  return {
    title,
    titleKey: range.title ? undefined : "Season {{number}}",
    titleParams: range.title ? undefined : { number: range.seasonNumber },
    seasonNumber: range.seasonNumber,
    availabilityStatus: "available" as const,
    episodesLink: `${animeId}|${range.start}|${end}`,
  };
};

const toEpisodeRangeLink = (animeId: number, start: number, end: number): Link => ({
  title: `Episodes ${start}-${end}`,
  titleKey: EPISODE_RANGE_KEY,
  titleParams: { start, end },
  availabilityStatus: "available" as const,
  episodesLink: `${animeId}|${start}|${end}`,
});

const buildMappedSeasonRanges = ({
  targets,
  primaryShowId,
  totalCount,
  tmdbSeasons,
}: {
  targets: AniBridgeTarget[];
  primaryShowId: string;
  totalCount: number;
  tmdbSeasons?: TmdbSeasonMetadata[];
}): SeasonRange[] => {
  const ranges: SeasonRange[] = [];
  targets
    .filter(
      (target) =>
        target.provider === "tmdb_show" &&
        target.id === primaryShowId &&
        parseSeasonScope(target.scope) != null
    )
    .forEach((target) => {
      const seasonNumber = parseSeasonScope(target.scope);
      const sourceRanges = Object.keys(target.ranges || {})
        .map(parseSourceRange)
        .filter((range): range is SourceRange => range != null);
      if (seasonNumber == null || sourceRanges.length === 0) return;
      const start = Math.min(...sourceRanges.map((range) => range.start));
      const end = Math.max(...sourceRanges.map((range) => range.end));
      if (start > totalCount) return;
      ranges.push({
        start,
        end,
        seasonNumber,
        title: localizedSeasonTitle(seasonNumber, tmdbSeasons),
      });
    });
  return ranges.sort((left, right) => {
    const byStart = left.start - right.start;
    return byStart || left.seasonNumber - right.seasonNumber;
  });
};

const buildTmdbAbsoluteSeasonRanges = (
  tmdbSeasons: TmdbSeasonMetadata[] | undefined,
  totalCount: number
): SeasonRange[] => {
  let nextStart = 1;
  const ranges: SeasonRange[] = [];
  (tmdbSeasons || [])
    .filter(
      (season) =>
        season.seasonNumber > 0 &&
        Number.isFinite(season.episodeCount) &&
        Number(season.episodeCount) > 0
    )
    .sort((left, right) => left.seasonNumber - right.seasonNumber)
    .forEach((season) => {
      const episodeCount = Number(season.episodeCount);
      const start = nextStart;
      const end = start + episodeCount - 1;
      nextStart = end + 1;
      if (start > totalCount) return;
      ranges.push({
        start,
        end,
        seasonNumber: season.seasonNumber,
        title: localizedSeasonTitle(season.seasonNumber, tmdbSeasons),
      });
    });
  return ranges;
};

const isContiguousFromOne = (ranges: SeasonRange[]): boolean => {
  let expectedStart = 1;
  for (const range of ranges) {
    if (range.start !== expectedStart || range.end < range.start) return false;
    expectedStart = range.end + 1;
  }
  return ranges.length > 0;
};

const mappedRangesMatchTmdb = (
  mappedRanges: SeasonRange[],
  tmdbRanges: SeasonRange[],
  totalCount: number
): boolean => {
  if (!isContiguousFromOne(mappedRanges) || tmdbRanges.length === 0) return false;
  return mappedRanges.every((mappedRange) => {
    const tmdbRange = tmdbRanges.find(
      (range) => range.seasonNumber === mappedRange.seasonNumber
    );
    return (
      tmdbRange != null &&
      mappedRange.start === tmdbRange.start &&
      mappedRange.end === Math.min(tmdbRange.end, totalCount)
    );
  });
};

const shouldBuildFromTmdbOnly = (
  tmdbRanges: SeasonRange[],
  totalCount: number
): boolean => {
  if (tmdbRanges.length <= 1) return false;
  const firstSeasonEnd = tmdbRanges[0]?.end || 0;
  const tmdbTotal = tmdbRanges[tmdbRanges.length - 1]?.end || 0;
  return totalCount === tmdbTotal || (totalCount > firstSeasonEnd && totalCount <= tmdbTotal);
};

export function buildTmdbSeasonEpisodeLinks({
  animeId,
  totalCount,
  mappingResolution,
  tmdbSeasons,
}: {
  animeId: number;
  totalCount?: number;
  mappingResolution: AnimeMappingResolution;
  tmdbSeasons?: TmdbSeasonMetadata[];
}): Link[] {
  if (!Number.isFinite(animeId) || animeId <= 0 || !totalCount || totalCount <= 0) {
    return [];
  }

  const primaryShowId =
    selectPrimaryTmdbShowId(mappingResolution.targets) ||
    String(mappingResolution.ids?.tmdbShowIds?.[0] || "");
  if (!primaryShowId) return [];

  const mappedRanges = buildMappedSeasonRanges({
    targets: mappingResolution.targets,
    primaryShowId,
    totalCount,
    tmdbSeasons,
  });
  const tmdbRanges = buildTmdbAbsoluteSeasonRanges(tmdbSeasons, totalCount);

  if (mappedRanges.length === 0 && shouldBuildFromTmdbOnly(tmdbRanges, totalCount)) {
    return tmdbRanges
      .filter((range) => range.start <= totalCount)
      .map((range) => toSeasonLink(animeId, totalCount, range));
  }

  if (mappedRanges.length === 0) return [];

  const links = mappedRanges.map((range) => toSeasonLink(animeId, totalCount, range));
  const lastMappedEnd = Math.max(...mappedRanges.map((range) => range.end));
  if (lastMappedEnd < totalCount) {
    const canExtendWithTmdb = mappedRangesMatchTmdb(
      mappedRanges,
      tmdbRanges,
      totalCount
    );
    const extensionRanges = canExtendWithTmdb
      ? tmdbRanges.filter(
          (range) => range.start > lastMappedEnd && range.start <= totalCount
        )
      : [];
    if (extensionRanges.length > 0) {
      links.push(
        ...extensionRanges.map((range) => toSeasonLink(animeId, totalCount, range))
      );
    } else if (links.length > 1) {
      links.push(toEpisodeRangeLink(animeId, lastMappedEnd + 1, totalCount));
    }
  }

  return links.length > 1 ? links : [];
}
