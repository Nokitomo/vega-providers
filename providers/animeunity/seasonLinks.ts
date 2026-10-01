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
  mappingDescriptor: string;
  targetStart?: number;
  corroborated: boolean;
};

const parseSourceRange = (
  value: string,
  openRangeEnd?: number
): SourceRange | null => {
  const match = String(value || "")
    .trim()
    .match(/^(\d+)(?:-(\d*))?$/);
  if (!match?.[1]) return null;
  const start = Number.parseInt(match[1], 10);
  const hasRangeSeparator = String(value || "").includes("-");
  const end = match[2]
    ? Number.parseInt(match[2], 10)
    : hasRangeSeparator
      ? openRangeEnd
      : start;
  if (end == null) return null;
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

const parseTargetStart = (target: AniBridgeTarget): number | undefined => {
  const values = Object.values(target.ranges || {})
    .map((value) =>
      Number.parseFloat(String(value).match(/\d+(?:\.\d+)?/)?.[0] || "")
    )
    .filter((value) => Number.isFinite(value));
  return values.length > 0 ? Math.min(...values) : undefined;
};

const sourceBounds = (
  target: AniBridgeTarget,
  openRangeEnd?: number
): SourceRange | null => {
  const ranges = Object.keys(target.ranges || {})
    .map((value) => parseSourceRange(value, openRangeEnd))
    .filter((range): range is SourceRange => range != null);
  if (ranges.length === 0) return null;
  return {
    start: Math.min(...ranges.map((range) => range.start)),
    end: Math.max(...ranges.map((range) => range.end)),
  };
};

const rangesOverlap = (left: SourceRange, right: SourceRange): boolean =>
  left.start <= right.end && right.start <= left.end;

const isSameSourceRange = (
  target: AniBridgeTarget,
  start: number,
  end: number,
  openRangeEnd?: number
): boolean => {
  const bounds = sourceBounds(target, openRangeEnd);
  return bounds?.start === start && bounds.end === end;
};

const alignWithTmdbRange = (
  range: SeasonRange,
  tmdbRanges: SeasonRange[]
): SeasonRange => {
  const tmdbRange = tmdbRanges.find(
    (candidate) => candidate.seasonNumber === range.seasonNumber
  );
  if (!tmdbRange) return range;

  const exact =
    range.start === tmdbRange.start && range.end === tmdbRange.end;
  const boundaryNoise =
    Math.abs(range.start - tmdbRange.start) <= 1 &&
    Math.abs(range.end - tmdbRange.end) <= 1;
  const absoluteOpenRange =
    range.start === tmdbRange.start &&
    range.targetStart === tmdbRange.start &&
    range.end >= tmdbRange.end;
  if (!exact && !boundaryNoise && !absoluteOpenRange) return range;

  return {
    ...range,
    start: tmdbRange.start,
    end: tmdbRange.end,
  };
};

const isBetterSeasonRange = (
  candidate: SeasonRange,
  current: SeasonRange,
  totalCount: number
): boolean => {
  const candidateScore = [
    candidate.start === 1 && candidate.end >= totalCount ? 1 : 0,
    candidate.seasonNumber > 0 ? 1 : 0,
    candidate.corroborated ? 1 : 0,
    candidate.targetStart === 1 ? 1 : 0,
    candidate.end - candidate.start + 1,
  ];
  const currentScore = [
    current.start === 1 && current.end >= totalCount ? 1 : 0,
    current.seasonNumber > 0 ? 1 : 0,
    current.corroborated ? 1 : 0,
    current.targetStart === 1 ? 1 : 0,
    current.end - current.start + 1,
  ];
  for (let index = 0; index < candidateScore.length; index += 1) {
    if (candidateScore[index] !== currentScore[index]) {
      return candidateScore[index] > currentScore[index];
    }
  }
  return candidate.seasonNumber < current.seasonNumber;
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
    episodesLink: `${animeId}|${range.start}|${end}|${encodeURIComponent(
      range.mappingDescriptor
    )}`,
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
  tmdbRanges,
}: {
  targets: AniBridgeTarget[];
  primaryShowId: string;
  totalCount: number;
  tmdbSeasons?: TmdbSeasonMetadata[];
  tmdbRanges: SeasonRange[];
}): { ranges: SeasonRange[]; hadConflicts: boolean } => {
  const candidates: SeasonRange[] = [];
  let mappingCandidatesCount = 0;
  targets
    .filter(
      (target) =>
        target.provider === "tmdb_show" &&
        target.id === primaryShowId &&
        parseSeasonScope(target.scope) != null
    )
    .forEach((target) => {
      const seasonNumber = parseSeasonScope(target.scope);
      const bounds = sourceBounds(target, totalCount);
      if (seasonNumber == null || !bounds) return;
      const { start, end } = bounds;
      if (start > totalCount) return;
      mappingCandidatesCount += 1;
      const tmdbSeason = tmdbSeasons?.find(
        (season) => season.seasonNumber === seasonNumber
      );
      if (tmdbSeasons && !tmdbSeason) {
        return;
      }
      candidates.push(alignWithTmdbRange({
        start,
        end,
        seasonNumber,
        title: localizedSeasonTitle(seasonNumber, tmdbSeasons),
        mappingDescriptor:
          target.raw ||
          [target.provider, target.id, target.scope].filter(Boolean).join(":"),
        targetStart: parseTargetStart(target),
        corroborated: targets.some(
          (candidate) =>
            candidate.provider === "tvdb_show" &&
            candidate.scope === target.scope &&
            isSameSourceRange(candidate, start, end, totalCount)
        ),
      }, tmdbRanges));
    });

  const ranges: SeasonRange[] = [];
  candidates
    .sort((left, right) => left.start - right.start || left.end - right.end)
    .forEach((candidate) => {
      const conflictingIndexes = ranges
        .map((range, index) => (rangesOverlap(range, candidate) ? index : -1))
        .filter((index) => index >= 0);
      if (conflictingIndexes.length === 0) {
        ranges.push(candidate);
        return;
      }
      const conflicts = conflictingIndexes.map((index) => ranges[index]);
      const winner = conflicts.reduce(
        (best, current) =>
          isBetterSeasonRange(current, best, totalCount) ? current : best,
        candidate
      );
      conflictingIndexes
        .sort((left, right) => right - left)
        .forEach((index) => ranges.splice(index, 1));
      ranges.push(winner);
    });

  ranges.sort((left, right) => {
    const byStart = left.start - right.start;
    return byStart || left.seasonNumber - right.seasonNumber;
  });
  return { ranges, hadConflicts: ranges.length < mappingCandidatesCount };
};

const buildTmdbAbsoluteSeasonRanges = (
  tmdbSeasons: TmdbSeasonMetadata[] | undefined,
  totalCount: number,
  primaryShowId: string
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
        mappingDescriptor: `tmdb_show:${primaryShowId}:s${season.seasonNumber}`,
        corroborated: false,
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
  if (
    mappedRanges.length < 2 ||
    !isContiguousFromOne(mappedRanges) ||
    tmdbRanges.length === 0
  ) return false;
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

  const tmdbRanges = buildTmdbAbsoluteSeasonRanges(
    tmdbSeasons,
    totalCount,
    primaryShowId
  );
  const mappedResult = buildMappedSeasonRanges({
    targets: mappingResolution.targets,
    primaryShowId,
    totalCount,
    tmdbSeasons,
    tmdbRanges,
  });
  const mappedRanges = mappedResult.ranges;

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

  return links.length > 1 || mappedResult.hadConflicts ? links : [];
}
