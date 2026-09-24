import { ExternalEpisodeMapping } from "../../types";
import { parseSeasonScope } from "./descriptors";
import {
  AniBridgeTarget,
  AnimeMappingResolution,
  EpisodeMappingResolution,
} from "./types";

type NumericRange = {
  start: number;
  end?: number;
};

type TargetExpression = {
  segments: NumericRange[];
  ratio: number;
};

const RANGE_PATTERN = /^(\d+(?:\.\d+)?)(?:-(\d*(?:\.\d+)?))?$/;

function parseNumericRange(value: string): NumericRange | null {
  const match = value.trim().match(RANGE_PATTERN);
  if (!match?.[1]) return null;
  const start = Number(match[1]);
  if (!Number.isFinite(start) || start < 0) return null;

  const hasDash = value.includes("-");
  const end = match[2] ? Number(match[2]) : hasDash ? undefined : start;
  if (end != null && (!Number.isFinite(end) || end < start)) return null;
  return { start, end };
}

function parseTargetExpression(value: string): TargetExpression | null {
  const separatorIndex = value.lastIndexOf("|");
  const rangesPart = separatorIndex >= 0 ? value.slice(0, separatorIndex) : value;
  const ratioPart = separatorIndex >= 0 ? value.slice(separatorIndex + 1) : "1";
  const ratio = Number(ratioPart);
  if (!Number.isInteger(ratio) || ratio === 0) return null;

  const segments = rangesPart
    .split(",")
    .map(parseNumericRange)
    .filter((range): range is NumericRange => range != null);
  if (segments.length === 0) return null;
  return { segments, ratio };
}

function resolveTargetNumber(
  segments: NumericRange[],
  index: number
): number | undefined {
  let remaining = index;
  for (const segment of segments) {
    if (segment.end == null) return segment.start + remaining;
    const length = Math.floor(segment.end - segment.start) + 1;
    if (remaining < length) return segment.start + remaining;
    remaining -= length;
  }
  return undefined;
}

export function mapAniBridgeEpisodeRange(
  sourceExpression: string,
  targetExpression: string,
  sourceEpisodeNumber: number
): number[] {
  const source = parseNumericRange(sourceExpression);
  const target = parseTargetExpression(targetExpression);
  if (!source || !target || !Number.isFinite(sourceEpisodeNumber)) return [];
  if (sourceEpisodeNumber < source.start) return [];
  if (source.end != null && sourceEpisodeNumber > source.end) return [];

  const sourceOffset = Math.floor(sourceEpisodeNumber - source.start);
  const targetIndexes: number[] = [];
  if (target.ratio > 0) {
    const first = sourceOffset * target.ratio;
    for (let index = 0; index < target.ratio; index += 1) {
      targetIndexes.push(first + index);
    }
  } else {
    targetIndexes.push(Math.floor(sourceOffset / Math.abs(target.ratio)));
  }

  return Array.from(
    new Set(
      targetIndexes
        .map((index) => resolveTargetNumber(target.segments, index))
        .filter((value): value is number => value != null)
    )
  );
}

function mapTargetEpisode(
  target: AniBridgeTarget,
  sourceEpisodeNumber: number
): ExternalEpisodeMapping | null {
  const episodeNumbers = Array.from(
    new Set(
      Object.entries(target.ranges).flatMap(([sourceRange, targetRange]) =>
        mapAniBridgeEpisodeRange(
          sourceRange,
          targetRange,
          sourceEpisodeNumber
        )
      )
    )
  ).sort((left, right) => left - right);
  if (episodeNumbers.length === 0) return null;

  return {
    provider: target.provider,
    id: target.id,
    scope: target.scope,
    seasonNumber: parseSeasonScope(target.scope),
    episodeNumbers,
  };
}

function pickPrimaryTmdbShowId(targets: AniBridgeTarget[]): string | undefined {
  const scores = new Map<string, number>();
  targets.forEach((target) => {
    if (target.provider !== "tmdb_show") return;
    scores.set(
      target.id,
      (scores.get(target.id) || 0) + Object.keys(target.ranges).length
    );
  });
  return Array.from(scores.entries()).sort(
    (left, right) => right[1] - left[1] || left[0].localeCompare(right[0])
  )[0]?.[0];
}

export function resolveAniBridgeEpisodeMappings(
  resolution: AnimeMappingResolution,
  sourceEpisodeNumber: number
): EpisodeMappingResolution {
  const mappings = resolution.targets
    .map((target) => mapTargetEpisode(target, sourceEpisodeNumber))
    .filter((mapping): mapping is ExternalEpisodeMapping => mapping != null);

  const primaryTmdbShowId = pickPrimaryTmdbShowId(resolution.targets);
  const primary = mappings.find(
    (mapping) =>
      mapping.provider === "tmdb_show" && mapping.id === primaryTmdbShowId
  );

  return {
    seasonNumber: primary?.seasonNumber,
    mappings,
  };
}
