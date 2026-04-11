import { ProviderContext, Stream } from "../types";
import { resolveDroploadStream } from "./hosts/dropload";
import { resolveMixdropStream } from "./hosts/mixdrop";
import { resolveStreamHgStream } from "./hosts/streamhg";
import { resolveSuperVideoStream } from "./hosts/supervideo";
import { resolveVixsrcStream } from "./hosts/vixsrc";
import {
  isDroploadLike,
  isMixdropLike,
  isStreamHgLike,
  isSuperVideo,
  isVixsrcLike,
} from "./utils/classifiers";
import {
  GUARDAHD_BASE,
  MOSTRAGUARDA_BASE,
  REQUEST_TIMEOUT,
} from "./utils/constants";
import { extractImdbIdFromHtml } from "./utils/imdb";
import {
  normalizeMirrorUrl,
  normalizeStreamLink,
  resolveBaseUrl,
  resolveUrl,
} from "./utils/url";

const extractTmdbIdsFromHtml = (html: string): string[] => {
  const ids = new Set<string>();
  const patterns = [
    /themoviedb\.org\/(?:movie|tv)\/(\d{2,})/gi,
    /data-tmdb(?:-id)?=["'](\d{2,})["']/gi,
    /(?:tmdb(?:_id|Id)?|id_tmdb)\s*["'=:\s]+\s*["']?(\d{2,})["']?/gi,
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null = null;
    while ((match = pattern.exec(html))) {
      const value = (match[1] || "").trim();
      if (value) {
        ids.add(value);
      }
    }
  }

  return Array.from(ids);
};

const parseEpisodeKey = (
  episodeKey: string
): { season: number; episode: number } | null => {
  const [seasonRaw, episodeRaw] = (episodeKey || "").split("-");
  const season = Number.parseInt(seasonRaw || "", 10);
  const episode = Number.parseInt(episodeRaw || "", 10);
  if (!Number.isFinite(season) || !Number.isFinite(episode)) {
    return null;
  }
  if (season <= 0 || episode <= 0) {
    return null;
  }
  return { season, episode };
};

const buildGlobalMovieVixsrcUrls = (
  imdbId: string,
  tmdbIds: string[]
): string[] => {
  const urls: string[] = [];
  if (imdbId) {
    urls.push(`https://vixsrc.to/movie/${imdbId}`);
  }
  tmdbIds.forEach((tmdbId) => {
    if (tmdbId) {
      urls.push(`https://vixsrc.to/movie/${tmdbId}`);
    }
  });
  return urls;
};

const buildGlobalSeriesVixsrcUrls = (
  imdbId: string,
  tmdbIds: string[],
  season: number,
  episode: number
): string[] => {
  const urls: string[] = [];
  if (imdbId) {
    urls.push(`https://vixsrc.to/tv/${imdbId}/${season}/${episode}`);
  }
  tmdbIds.forEach((tmdbId) => {
    if (tmdbId) {
      urls.push(`https://vixsrc.to/tv/${tmdbId}/${season}/${episode}`);
    }
  });
  return urls;
};

const appendGlobalVixsrcFallback = async ({
  streams,
  candidateUrls,
  providerContext,
  signal,
}: {
  streams: Stream[];
  candidateUrls: string[];
  providerContext: ProviderContext;
  signal: AbortSignal;
}): Promise<Stream[]> => {
  if (!Array.isArray(candidateUrls) || candidateUrls.length === 0) {
    return streams;
  }

  const output = [...streams];
  const seenStreamLinks = new Set(
    output
      .map((stream) => (stream?.link || "").trim())
      .filter((link) => link.length > 0)
  );
  const seenCandidateUrls = new Set<string>();
  let fallbackIndex = 1;

  for (const candidateUrl of candidateUrls) {
    if (signal?.aborted) break;
    const normalizedUrl = (candidateUrl || "").trim();
    if (!normalizedUrl || seenCandidateUrls.has(normalizedUrl)) {
      continue;
    }
    seenCandidateUrls.add(normalizedUrl);

    try {
      const fallbackStream = await resolveVixsrcStream({
        normalizedUrl,
        index: fallbackIndex,
        providerContext,
        signal,
      });
      if (!fallbackStream?.link) {
        continue;
      }

      const normalizedStreamLink = fallbackStream.link.trim();
      if (!normalizedStreamLink || seenStreamLinks.has(normalizedStreamLink)) {
        continue;
      }

      output.push({
        ...fallbackStream,
        server: `Server 1 Fallback ${fallbackIndex}`,
      });
      seenStreamLinks.add(normalizedStreamLink);
      fallbackIndex += 1;
    } catch (err) {
      console.error("altadefinizionez global vixsrc fallback error", err);
    }
  }

  return output;
};

const extractPlayerLinksFromHtml = (
  html: string,
  cheerio: ProviderContext["cheerio"]
): string[] => {
  const $ = cheerio.load(html || "");
  const links: string[] = [];

  $("li[data-link], span[data-link]").each((_, element) => {
    const link = $(element).attr("data-link");
    if (link) {
      links.push(link);
    }
  });

  if (links.length === 0) {
    const iframe = $("iframe").attr("src");
    if (iframe) {
      links.push(iframe);
    }
  }

  return links;
};

const extractMostraguardaStreams = async (
  rawLinks: string[],
  providerContext: ProviderContext,
  signal: AbortSignal
): Promise<Stream[]> => {
  const streams: Stream[] = [];
  const seen = new Set<string>();
  let server1Index = 1;
  let superVideoIndex = 1;
  let droploadIndex = 1;
  let mixdropIndex = 1;
  let streamHgIndex = 1;

  const addStream = (stream: Stream): void => {
    if (!stream.link || seen.has(stream.link)) return;
    streams.push(stream);
    seen.add(stream.link);
  };

  for (const raw of rawLinks) {
    if (signal?.aborted) break;
    if (!raw) continue;
    const normalized = normalizeMirrorUrl(
      normalizeStreamLink(raw, MOSTRAGUARDA_BASE)
    );
    if (!normalized) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);

    if (isSuperVideo(normalized)) {
      try {
        const stream = await resolveSuperVideoStream({
          normalizedUrl: normalized,
          index: superVideoIndex,
          providerContext,
          signal,
        });
        if (stream) {
          addStream(stream);
          superVideoIndex += 1;
        }
      } catch (err) {
        console.error("altadefinizionez supervideo error", err);
      }
      continue;
    }

    if (isVixsrcLike(normalized)) {
      try {
        const stream = await resolveVixsrcStream({
          normalizedUrl: normalized,
          index: server1Index,
          providerContext,
          signal,
        });
        if (stream) {
          addStream(stream);
          server1Index += 1;
        }
      } catch (err) {
        console.error("altadefinizionez vixsrc error", err);
      }
      continue;
    }

    if (isDroploadLike(normalized)) {
      try {
        const stream = await resolveDroploadStream({
          normalizedUrl: normalized,
          index: droploadIndex,
          providerContext,
          signal,
        });
        if (stream) {
          addStream(stream);
          droploadIndex += 1;
        }
      } catch (err) {
        console.error("altadefinizionez dropload error", err);
      }
      continue;
    }

    if (isMixdropLike(normalized)) {
      try {
        const stream = await resolveMixdropStream({
          normalizedUrl: normalized,
          index: mixdropIndex,
          providerContext,
          signal,
        });
        if (stream) {
          addStream(stream);
          mixdropIndex += 1;
        }
      } catch (err) {
        console.error("altadefinizionez mixdrop error", err);
      }
      continue;
    }

    if (isStreamHgLike(normalized)) {
      try {
        const stream = await resolveStreamHgStream({
          normalizedUrl: normalized,
          index: streamHgIndex,
          providerContext,
          signal,
        });
        if (stream) {
          addStream(stream);
          streamHgIndex += 1;
        }
      } catch (err) {
        console.error("altadefinizionez streamhg error", err);
      }
    }
  }

  return streams;
};

const getMovieStreams = async (
  pageUrl: string,
  providerContext: ProviderContext,
  signal: AbortSignal
): Promise<Stream[]> => {
  const { axios, cheerio, commonHeaders } = providerContext;
  const pageOrigin = new URL(pageUrl).origin;
  const res = await axios.get(pageUrl, {
    headers: {
      ...commonHeaders,
      Referer: `${pageOrigin}/`,
    },
    timeout: REQUEST_TIMEOUT,
    signal,
  });

  const html = res.data || "";
  const imdbId = extractImdbIdFromHtml(html, cheerio);
  const tmdbIds = extractTmdbIdsFromHtml(html);

  const playerCandidates: { url: string; referer: string }[] = imdbId
    ? [
        {
          url: `${GUARDAHD_BASE}/index.php?task=set-movie-u&id_imdb=${imdbId}`,
          referer: `${GUARDAHD_BASE}/`,
        },
        {
          url: `${MOSTRAGUARDA_BASE}/index.php?task=set-movie-a&id_imdb=${imdbId}`,
          referer: `${MOSTRAGUARDA_BASE}/`,
        },
      ]
    : [];

  let links: string[] = [];
  for (const candidate of playerCandidates) {
    try {
      const playerRes = await axios.get(candidate.url, {
        headers: {
          ...commonHeaders,
          Referer: candidate.referer,
        },
        timeout: REQUEST_TIMEOUT,
        signal,
      });
      const extracted = extractPlayerLinksFromHtml(
        String(playerRes.data || ""),
        cheerio
      );
      if (extracted.length > 0) {
        links = extracted;
        break;
      }
    } catch (_) {
      // continue with next source
    }
  }

  const extracted = await extractMostraguardaStreams(links, providerContext, signal);
  const fallbackCandidateUrls = buildGlobalMovieVixsrcUrls(imdbId, tmdbIds);
  return await appendGlobalVixsrcFallback({
    streams: extracted,
    candidateUrls: fallbackCandidateUrls,
    providerContext,
    signal,
  });
};

const getSeriesStreams = async (
  pageUrl: string,
  episodeKey: string,
  providerContext: ProviderContext,
  signal: AbortSignal
): Promise<Stream[]> => {
  const { axios, cheerio, commonHeaders } = providerContext;
  const pageOrigin = new URL(pageUrl).origin;
  const res = await axios.get(pageUrl, {
    headers: {
      ...commonHeaders,
      Referer: `${pageOrigin}/`,
    },
    timeout: REQUEST_TIMEOUT,
    signal,
  });

  const html = String(res.data || "");
  const $ = cheerio.load(html);
  const parts = episodeKey.split("-");
  const season = parts[0] || "";
  const selector = season
    ? `.dropdown.mirrors[data-season="${season}"][data-episode="${episodeKey}"]`
    : `.dropdown.mirrors[data-episode="${episodeKey}"]`;

  const links: string[] = [];
  $(selector)
    .find(".dropdown-item[data-link]")
    .each((_, element) => {
      const link = $(element).attr("data-link");
      if (link) {
        links.push(link);
      }
    });

  if (links.length === 0 && season) {
    $(`.dropdown.mirrors[data-episode="${episodeKey}"]`)
      .find(".dropdown-item[data-link]")
      .each((_, element) => {
        const link = $(element).attr("data-link");
        if (link) {
          links.push(link);
        }
      });
  }

  const extracted = await extractMostraguardaStreams(links, providerContext, signal);
  const parsedEpisode = parseEpisodeKey(episodeKey);
  if (!parsedEpisode) {
    return extracted;
  }

  const imdbId = extractImdbIdFromHtml(html, cheerio);
  const tmdbIds = extractTmdbIdsFromHtml(html);
  const fallbackCandidateUrls = buildGlobalSeriesVixsrcUrls(
    imdbId,
    tmdbIds,
    parsedEpisode.season,
    parsedEpisode.episode
  );

  return await appendGlobalVixsrcFallback({
    streams: extracted,
    candidateUrls: fallbackCandidateUrls,
    providerContext,
    signal,
  });
};

export const getStream = async function ({
  link,
  type,
  signal,
  providerContext,
}: {
  link: string;
  type: string;
  signal: AbortSignal;
  providerContext: ProviderContext;
}): Promise<Stream[]> {
  try {
    if (signal?.aborted) return [];
    const baseUrl = await resolveBaseUrl(providerContext);

    if (link.includes("::")) {
      const [rawUrl, episodeKey] = link.split("::");
      const pageUrl = resolveUrl(rawUrl, baseUrl);
      if (!episodeKey) return [];
      return await getSeriesStreams(pageUrl, episodeKey, providerContext, signal);
    }

    if (type === "series") {
      return [];
    }

    const pageUrl = resolveUrl(link, baseUrl);
    return await getMovieStreams(pageUrl, providerContext, signal);
  } catch (err) {
    console.error("altadefinizionez stream error", err);
    return [];
  }
};
