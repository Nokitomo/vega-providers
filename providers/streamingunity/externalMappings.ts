import { ProviderContext } from "../types";
import {
  AnimeMappingResolution,
  resolveExternalAnimeMappings,
} from "../animeunity/mappings";
import {
  resolveWikidataExternalIds,
  WikidataExternalIds,
} from "../animeunity/wikidata";

type StreamingUnityMediaType = "movie" | "series";

export type StreamingUnityExternalIds = {
  tmdbId?: number;
  tvdbId?: number;
  imdbId?: string;
  wikidataId?: string;
  traktSlug?: string;
  mappingResolution?: AnimeMappingResolution;
  wikidata?: WikidataExternalIds;
};

function toPositiveInt(value: unknown): number | undefined {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function normalizeImdbId(value: unknown): string | undefined {
  const text = String(value ?? "").trim().toLowerCase();
  return /^tt\d{5,}$/.test(text) ? text : undefined;
}

function textValues(value: unknown): string[] {
  if (value == null) return [];
  if (typeof value === "string" || typeof value === "number") {
    return [String(value)];
  }
  if (Array.isArray(value)) return value.flatMap(textValues);
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return [
      record.name,
      record.title,
      record.value,
      record.iso_3166_1,
      record.iso_639_1,
      record.code,
    ].flatMap(textValues);
  }
  return [];
}

function normalizeComparable(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

export function isLikelyAnimeStreamingUnityTitle(title: any): boolean {
  const countries = textValues([
    title?.country,
    title?.countries,
    title?.origin_country,
    title?.production_countries,
  ]).map(normalizeComparable);
  const languages = textValues([
    title?.original_language,
    title?.original_language_code,
    title?.language,
  ]).map(normalizeComparable);
  const tags = textValues([
    title?.genres,
    title?.keywords,
    title?.tags,
    title?.translations,
  ]).map(normalizeComparable);

  const isJapanese =
    countries.some((value) =>
      ["jp", "jpn", "japan", "giappone"].includes(value)
    ) ||
    languages.some((value) =>
      ["ja", "jpn", "japanese", "giapponese"].includes(value)
    );
  const saysAnime = tags.some((value) => value.includes("anime"));
  const saysAnimation = tags.some(
    (value) => value.includes("animation") || value.includes("animazione")
  );

  return saysAnime || (isJapanese && saysAnimation);
}

export function readStreamingUnityExternalIds(
  title: any,
  type: StreamingUnityMediaType
): StreamingUnityExternalIds {
  return {
    tmdbId: toPositiveInt(title?.tmdb_id),
    tvdbId:
      type === "movie"
        ? toPositiveInt(title?.tvdb_movie_id) ||
          toPositiveInt(title?.thetvdb_id) ||
          toPositiveInt(title?.tvdb_id)
        : toPositiveInt(title?.tvdb_show_id) ||
          toPositiveInt(title?.thetvdb_id) ||
          toPositiveInt(title?.tvdb_id),
    imdbId: normalizeImdbId(title?.imdb_id),
  };
}

export async function resolveStreamingUnityExternalIds({
  providerContext,
  title,
  type,
  needTvdb = false,
  needImdb = false,
}: {
  providerContext: ProviderContext;
  title: any;
  type: StreamingUnityMediaType;
  needTvdb?: boolean;
  needImdb?: boolean;
}): Promise<StreamingUnityExternalIds> {
  const base = readStreamingUnityExternalIds(title, type);
  let resolvedTvdbId = base.tvdbId;
  let resolvedImdbId = base.imdbId;
  let mappingResolution: AnimeMappingResolution | undefined;
  let wikidata: WikidataExternalIds | null = null;
  const animeLike = isLikelyAnimeStreamingUnityTitle(title);
  let shouldResolveTvdb = needTvdb && !resolvedTvdbId;
  let shouldResolveImdb = needImdb && !resolvedImdbId;
  if (
    (!shouldResolveTvdb && !shouldResolveImdb) ||
    (!base.tmdbId && !base.tvdbId && !base.imdbId)
  ) {
    return base;
  }

  if (animeLike) {
    mappingResolution = await resolveExternalAnimeMappings({
      providerContext,
      isMovie: type === "movie",
      tmdbId: base.tmdbId,
      tvdbId: base.tvdbId,
      imdbId: base.imdbId,
    });

    resolvedTvdbId =
      resolvedTvdbId ||
      (type === "movie"
      ? mappingResolution.ids.tvdbMovieIds[0]
      : mappingResolution.ids.tvdbShowIds[0]);
    resolvedImdbId = resolvedImdbId || mappingResolution.imdbId;
    shouldResolveTvdb = needTvdb && !resolvedTvdbId;
    shouldResolveImdb = needImdb && !resolvedImdbId;
  }

  if ((shouldResolveTvdb || shouldResolveImdb) && base.tmdbId) {
    wikidata = await resolveWikidataExternalIds({
      providerContext,
      type: type === "series" ? "tv" : "movie",
      tmdbId: base.tmdbId,
    });
    resolvedTvdbId = resolvedTvdbId || wikidata?.tvdbId;
    resolvedImdbId = resolvedImdbId || wikidata?.imdbId;
  }

  return {
    tmdbId: base.tmdbId,
    tvdbId: resolvedTvdbId,
    imdbId: resolvedImdbId,
    wikidataId: wikidata?.wikidataId,
    traktSlug: wikidata?.traktSlug,
    mappingResolution,
    wikidata: wikidata || undefined,
  };
}
