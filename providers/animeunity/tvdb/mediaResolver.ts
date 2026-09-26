import { ProviderContext } from "../../types";
import { readExternalCache, writeExternalCache } from "../externalCache";
import { getProviderRuntimeCache } from "../mappings/runtimeCache";
import { fetchTvdbHtml, TVDB_BASE_URL } from "./http";
import { extractTvdbEntityPath } from "./parser";
import { TvdbMediaType } from "./types";

const CACHE_SCHEMA = "v1";
const SOFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const TEXT_LANGUAGE_PRIORITY = ["ita", "eng"];

export type TvdbMediaTextMetadata = {
  source: "tvdb-web";
  sourceUrl: string;
  tvdbId: number;
  mediaType: TvdbMediaType;
  title?: string;
  synopsis?: string;
};

function cleanText(value: string): string | undefined {
  const text = value.replace(/\s+/g, " ").trim();
  return text || undefined;
}

function entryPath(mediaType: TvdbMediaType, id: number): string {
  return mediaType === "movie"
    ? `/dereferrer/movie/${encodeURIComponent(String(id))}`
    : `/?id=${encodeURIComponent(String(id))}&tab=series`;
}

function parseTvdbTextMetadata({
  html,
  cheerio,
  tvdbId,
  mediaType,
  sourceUrl,
}: {
  html: string;
  cheerio: any;
  tvdbId: number;
  mediaType: TvdbMediaType;
  sourceUrl: string;
}): TvdbMediaTextMetadata {
  const $ = cheerio.load(html);
  const translations = new Map<string, { title?: string; synopsis?: string }>();

  $(".change_translation_text[data-language]").each((_: number, element: any) => {
    const container = $(element);
    const language = String(container.attr("data-language") || "")
      .trim()
      .toLowerCase();
    if (!TEXT_LANGUAGE_PRIORITY.includes(language)) return;
    translations.set(language, {
      title: cleanText(String(container.attr("data-title") || "")),
      synopsis: cleanText(container.find("p").first().text()),
    });
  });

  const text =
    TEXT_LANGUAGE_PRIORITY.map((language) => translations.get(language)).find(
      (value) => value?.title || value?.synopsis,
    ) || {};

  return {
    source: "tvdb-web",
    sourceUrl,
    tvdbId,
    mediaType,
    title: text.title,
    synopsis: text.synopsis,
  };
}

export async function resolveTvdbMediaTextMetadata({
  providerContext,
  tvdbId,
  mediaType = "series",
}: {
  providerContext: ProviderContext;
  tvdbId?: number;
  mediaType?: TvdbMediaType;
}): Promise<TvdbMediaTextMetadata | null> {
  const id = Math.trunc(Number(tvdbId));
  if (!Number.isFinite(id) || id <= 0) return null;

  const persistentKey = `animeunity:tvdb:${CACHE_SCHEMA}:media-text:${mediaType}:${id}`;
  const cached = readExternalCache<TvdbMediaTextMetadata>(
    providerContext,
    persistentKey,
    SOFT_TTL_MS,
  );
  if (cached) return cached.value;

  const runtimeCache = getProviderRuntimeCache(providerContext);
  const pendingKey = `${persistentKey}:pending`;
  const pending = runtimeCache.get(pendingKey) as
    Promise<TvdbMediaTextMetadata | null> | undefined;
  if (pending) return pending;

  const request = (async (): Promise<TvdbMediaTextMetadata | null> => {
    const entryResponse = await fetchTvdbHtml(
      providerContext,
      entryPath(mediaType, id),
    );
    if (!entryResponse) return null;

    const entityPath = extractTvdbEntityPath(
      entryResponse.html,
      mediaType,
      entryResponse.url,
    );
    const sourceUrl = entityPath
      ? `${TVDB_BASE_URL}${entityPath}`
      : entryResponse.url;
    const metadata = parseTvdbTextMetadata({
      html: entryResponse.html,
      cheerio: providerContext.cheerio,
      tvdbId: id,
      mediaType,
      sourceUrl,
    });
    writeExternalCache(providerContext, persistentKey, metadata);
    return metadata;
  })()
    .catch(() => null)
    .finally(() => runtimeCache.delete(pendingKey));

  runtimeCache.set(pendingKey, request);
  return request;
}
