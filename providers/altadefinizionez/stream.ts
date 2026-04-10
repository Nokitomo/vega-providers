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
  if (!imdbId) return [];

  const playerCandidates: { url: string; referer: string }[] = [
    {
      url: `${GUARDAHD_BASE}/index.php?task=set-movie-u&id_imdb=${imdbId}`,
      referer: `${GUARDAHD_BASE}/`,
    },
    {
      url: `${MOSTRAGUARDA_BASE}/index.php?task=set-movie-a&id_imdb=${imdbId}`,
      referer: `${MOSTRAGUARDA_BASE}/`,
    },
  ];

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

  return await extractMostraguardaStreams(links, providerContext, signal);
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

  const $ = cheerio.load(res.data || "");
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

  return await extractMostraguardaStreams(links, providerContext, signal);
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
