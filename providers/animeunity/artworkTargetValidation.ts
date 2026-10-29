import { ProviderContext } from "../types";
import { AnimeMappingResolution, AniBridgeTarget } from "./mappings/types";
import { fetchTmdbHtml } from "./tmdb/http";
import { parseTmdbDetailsPage } from "./tmdb/details";
import { fetchTvdbHtml } from "./tvdb/http";
import { parseTvdbTitle } from "./tvdb/parser";
import { runMetadataTask } from "./metadataTasks";

type ArtworkProvider = "tmdb_movie" | "tmdb_show" | "tvdb_movie" | "tvdb_show";

const artworkProviders = (isMovie: boolean): ArtworkProvider[] =>
  isMovie ? ["tmdb_movie", "tvdb_movie"] : ["tmdb_show", "tvdb_show"];

const normalizeTitle = (value: unknown): string =>
  String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(?:ita|sub ita)\b/g, "")
    .replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");

const candidateIds = (targets: AniBridgeTarget[], provider: ArtworkProvider): string[] =>
  Array.from(new Set(targets
    .filter(target => target.provider === provider)
    .map(target => target.id)));

export function hasConflictingArtworkTargets(
  resolution: AnimeMappingResolution,
  isMovie: boolean,
): boolean {
  const targets = resolution.metadataTargets || resolution.targets;
  return artworkProviders(isMovie).some(provider => candidateIds(targets, provider).length > 1);
}

async function candidateTitlesUncached(
  providerContext: ProviderContext,
  provider: ArtworkProvider,
  id: string,
): Promise<string[]> {
  const numericId = Number.parseInt(id, 10);
  if (!Number.isFinite(numericId) || numericId <= 0) return [];

  if (provider === "tvdb_show" || provider === "tvdb_movie") {
    const path = provider === "tvdb_movie"
      ? `/dereferrer/movie/${numericId}`
      : `/?id=${numericId}&tab=series`;
    const response = await fetchTvdbHtml(providerContext, path);
    if (!response) return [];
    const $ = providerContext.cheerio.load(response.html);
    const titles = [parseTvdbTitle(response.html, providerContext.cheerio, $)];
    $(".change_translation_text[data-title]").each((_: number, element: any) => {
      titles.push($(element).attr("data-title"));
    });
    return titles.filter((title): title is string => !!title);
  }

  const path = `/${provider === "tmdb_movie" ? "movie" : "tv"}/${numericId}`;
  const pages = await Promise.all(["en-US", "it-IT"].map(async locale => {
    const html = await fetchTmdbHtml(providerContext, path, locale);
    return html ? parseTmdbDetailsPage(html, providerContext.cheerio, locale) : null;
  }));
  return pages.flatMap(page => page ? [page.title, page.originalTitle] : [])
    .filter((title): title is string => !!title);
}

/** Resolve contradictory external IDs before requesting their artwork. */
export async function verifyArtworkTargets({
  providerContext,
  mappingResolution,
  isMovie,
  titles,
}: {
  providerContext: ProviderContext;
  mappingResolution: AnimeMappingResolution;
  isMovie: boolean;
  titles: Array<string | null | undefined>;
}): Promise<AnimeMappingResolution> {
  if (!hasConflictingArtworkTargets(mappingResolution, isMovie)) {
    return mappingResolution;
  }

  const expected = new Set(titles.map(normalizeTitle).filter(Boolean));
  const targets = mappingResolution.metadataTargets || mappingResolution.targets;
  let verifiedTargets = targets;

  for (const provider of artworkProviders(isMovie)) {
    const ids = candidateIds(targets, provider);
    if (ids.length <= 1) continue;

    const matches = expected.size > 0
      ? await Promise.all(ids.map(async id => {
          try {
            const names = await runMetadataTask({providerContext, provider, id},
              provider.startsWith("tmdb") ? "tmdb" : "tvdb", "candidate-titles",
              () => candidateTitlesUncached(providerContext, provider, id));
            return names.some(name => expected.has(normalizeTitle(name))) ? id : null;
          } catch (_) {
            return null;
          }
        }))
      : [];
    const matchingIds = matches.filter((id): id is string => !!id);
    const selectedId = matchingIds.length === 1 ? matchingIds[0] : undefined;
    verifiedTargets = verifiedTargets.filter(target =>
      target.provider !== provider || target.id === selectedId,
    );
  }

  return {...mappingResolution, metadataTargets: verifiedTargets};
}
