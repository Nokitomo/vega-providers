import { Post, ProviderContext } from "../types";

const DEFAULT_BASE_URL = "https://altadefinizionez.sbs";
const REQUEST_TIMEOUT = 10000;

const normalizeBaseUrl = (value: string) => value.replace(/\/+$/, "");
const HERO_RANDOM_FLAG = "random";

const resolveBaseUrl = async (
  providerContext: ProviderContext
): Promise<string> => {
  try {
    const resolved = await providerContext.getBaseUrl("altadefinizionez");
    if (resolved) {
      return normalizeBaseUrl(resolved);
    }
  } catch (_) {
    // ignore and fall back to default
  }
  return DEFAULT_BASE_URL;
};

const resolveUrl = (href: string, baseUrl: string): string => {
  if (!href) return "";
  if (/^https?:\/\//i.test(href)) return href;
  return new URL(href, baseUrl).href;
};

const stripHash = (href: string): string => href.split("#")[0];

const parseBooleanFlag = (value?: string): boolean =>
  value === "1" || value === "true" || value === "yes";

const parseFilterRandom = (
  rawFilter: string
): { filter: string; random: boolean } => {
  const trimmed = (rawFilter || "").trim();
  const queryIndex = trimmed.indexOf("?");
  if (queryIndex === -1) {
    return { filter: trimmed, random: false };
  }
  const path = trimmed.slice(0, queryIndex);
  const rawQuery = trimmed.slice(queryIndex + 1);
  if (!rawQuery) {
    return { filter: trimmed, random: false };
  }
  const kept: string[] = [];
  let random = false;
  rawQuery
    .split("&")
    .map((part) => part.trim())
    .filter(Boolean)
    .forEach((part) => {
      const [rawKey, rawValue = ""] = part.split("=");
      const key = decodeURIComponent(rawKey || "").toLowerCase();
      const value = decodeURIComponent(rawValue || "");
      if (key === HERO_RANDOM_FLAG) {
        random = parseBooleanFlag(value);
      } else if (rawKey) {
        kept.push(part);
      }
    });
  const filter = kept.length > 0 ? `${path}?${kept.join("&")}` : path;
  return { filter, random };
};

const isArchiveFilter = (filter: string): boolean => {
  const [path] = (filter || "").split("?");
  const cleaned = path.replace(/^\/+/, "").replace(/\/+$/, "");
  return cleaned.toLowerCase() === "catalog/all";
};

const isDetailLink = (href: string, baseUrl: string): boolean => {
  if (!href) return false;
  try {
    const resolved = new URL(href, baseUrl);
    const baseHost = new URL(baseUrl).hostname;
    if (!resolved.hostname.endsWith(baseHost)) return false;
    return /\/\d+[^/]*\.html\/?$/i.test(resolved.pathname);
  } catch (_) {
    return false;
  }
};

const buildListUrl = (baseUrl: string, filter: string, page: number): string => {
  const normalized = (filter || "").trim();
  const safePage = page > 1 ? page : 1;

  if (!normalized || normalized === "latest") {
    return `${baseUrl}/`;
  }

  if (/^https?:\/\//i.test(normalized)) {
    return normalized;
  }

  const [pathPart, queryPart] = normalized.split("?");
  const cleanedPath = (pathPart || "").replace(/^\/+/, "").replace(/\/+$/, "");

  if (!cleanedPath) {
    return `${baseUrl}/`;
  }

  if (cleanedPath === "film") {
    if (safePage > 1) {
      return `${baseUrl}/film/page/${safePage}/${queryPart ? `?${queryPart}` : ""}`;
    }
    return `${baseUrl}/film/${queryPart ? `?${queryPart}` : ""}`;
  }

  if (cleanedPath.startsWith("catalog/")) {
    if (safePage > 1) {
      return `${baseUrl}/${cleanedPath}/page/${safePage}/${queryPart ? `?${queryPart}` : ""}`;
    }
    return `${baseUrl}/${cleanedPath}/${queryPart ? `?${queryPart}` : ""}`;
  }

  if (safePage > 1) {
    return `${baseUrl}/${cleanedPath}/page/${safePage}/`;
  }

  if (queryPart) {
    return `${baseUrl}/${cleanedPath}/?${queryPart}`;
  }

  return `${baseUrl}/${cleanedPath}/`;
};

const extractImage = (
  element: any,
  baseUrl: string
): string => {
  const img = element.find("img").first();
  const src =
    img.attr("data-src") ||
    img.attr("data-lazy-src") ||
    img.attr("data-original") ||
    img.attr("src") ||
    "";
  return src ? resolveUrl(src, baseUrl) : "";
};

const addPost = (
  posts: Post[],
  seen: Set<string>,
  post: Post
): void => {
  if (!post.title || !post.link || !post.image) return;
  if (seen.has(post.link)) return;
  posts.push(post);
  seen.add(post.link);
};

const parseGridPosts = (
  $: any,
  baseUrl: string,
  posts: Post[],
  seen: Set<string>
): void => {
  $(".movie").each((_index: number, element: any) => {
    const item = $(element);
    const anchor = item.find(".movie-poster a[href]").first();
    const href = anchor.attr("href") || "";
    const resolved = stripHash(resolveUrl(href, baseUrl));
    if (!isDetailLink(resolved, baseUrl)) return;

    const title =
      item.find(".movie-title a").first().text().trim() ||
      anchor.attr("title") ||
      anchor.text().trim();
    const image = extractImage(item.find(".movie-poster").first(), baseUrl);
    const episodeLabel = item
      .find(".movie-label .label.episode")
      .first()
      .text()
      .trim();
    const episodeLabelText = episodeLabel || "";
    const isSeasonEpisodeLabel = /^\d+\s*x\s*\d+$/i.test(episodeLabelText);
    const episodeLabelKey =
      episodeLabelText && !isSeasonEpisodeLabel ? "EP {{number}}" : undefined;
    const episodeLabelParams = episodeLabelKey
      ? { number: episodeLabelText }
      : undefined;

    addPost(posts, seen, {
      title: title,
      link: resolved,
      image: image,
      episodeLabel: episodeLabelText || undefined,
      episodeLabelKey,
      episodeLabelParams,
    });
  });
};

const parseTablePosts = (
  $: any,
  baseUrl: string,
  posts: Post[],
  seen: Set<string>
): void => {
  $("table.catalog-table tr").each((_index: number, element: any) => {
    const row = $(element);
    const anchor = row.find("a[href]").first();
    const href = anchor.attr("href") || "";
    const resolved = stripHash(resolveUrl(href, baseUrl));
    if (!isDetailLink(resolved, baseUrl)) return;

    const title =
      row.find("h2 a").first().text().trim() ||
      anchor.attr("title") ||
      anchor.text().trim();
    const image = extractImage(row, baseUrl);

    addPost(posts, seen, {
      title: title,
      link: resolved,
      image: image,
    });
  });
};

const parseTrendingPosts = (
  $: any,
  baseUrl: string,
  posts: Post[],
  seen: Set<string>
): void => {
  const container = $("#trending").first();
  if (!container.length) return;
  container.find(".swiper-slide").each((_index: number, element: any) => {
    const item = $(element);
    const anchor = item.find("a[href]").first();
    const href = anchor.attr("href") || "";
    const resolved = stripHash(resolveUrl(href, baseUrl));
    if (!isDetailLink(resolved, baseUrl)) return;

    const title =
      anchor.attr("title") ||
      anchor.text().trim() ||
      item.find(".movie-title a").first().text().trim();
    const image = extractImage(item.find(".movie-poster").first(), baseUrl);

    addPost(posts, seen, {
      title: title,
      link: resolved,
      image: image,
    });
  });
};

const parseFallbackPosts = (
  $: any,
  baseUrl: string,
  posts: Post[],
  seen: Set<string>
): void => {
  $(".movie-poster a[href]").each((_index: number, element: any) => {
    const anchor = $(element);
    const href = anchor.attr("href") || "";
    const resolved = stripHash(resolveUrl(href, baseUrl));
    if (!isDetailLink(resolved, baseUrl)) return;

    const title = anchor.attr("title") || anchor.text().trim();
    const image = extractImage(anchor, baseUrl);

    addPost(posts, seen, {
      title: title,
      link: resolved,
      image: image,
    });
  });
};

const parsePostsFromHtml = (
  html: string,
  baseUrl: string,
  cheerio: ProviderContext["cheerio"]
): Post[] => {
  const $ = cheerio.load(html || "");
  const posts: Post[] = [];
  const seen = new Set<string>();

  parseGridPosts($, baseUrl, posts, seen);
  parseTablePosts($, baseUrl, posts, seen);

  if (posts.length === 0) {
    parseFallbackPosts($, baseUrl, posts, seen);
  }

  return posts;
};

const fetchTrendingPosts = async ({
  baseUrl,
  providerContext,
  signal,
}: {
  baseUrl: string;
  providerContext: ProviderContext;
  signal: AbortSignal;
}): Promise<Post[]> => {
  const { axios, commonHeaders, cheerio } = providerContext;
  const res = await axios.get(baseUrl, {
    headers: {
      ...commonHeaders,
      Referer: `${baseUrl}/`,
    },
    timeout: REQUEST_TIMEOUT,
    signal,
  });
  const html = typeof res.data === "string" ? res.data : String(res.data ?? "");
  const $ = cheerio.load(html || "");
  const posts: Post[] = [];
  const seen = new Set<string>();
  parseTrendingPosts($, baseUrl, posts, seen);
  return posts;
};

const isTrendingFilter = (filter: string): boolean =>
  (filter || "").trim().toLowerCase() === "trending";

const extractMaxPageFromHtml = (
  html: string,
  cheerio: ProviderContext["cheerio"]
): number => {
  const $ = cheerio.load(html || "");
  const pageNumbers = $("a[href*=\"/page/\"]")
    .map((_index: number, element: any) => {
      const href = $(element).attr("href") || "";
      const match = href.match(/\/page\/(\d+)/i);
      return match ? Number.parseInt(match[1], 10) : null;
    })
    .get()
    .filter((value: number | null) => Number.isFinite(value)) as number[];
  if (pageNumbers.length === 0) return 1;
  const maxPage = Math.max(...pageNumbers);
  return Number.isFinite(maxPage) && maxPage > 0 ? maxPage : 1;
};

const fetchPostsPage = async ({
  baseUrl,
  filter,
  page,
  providerContext,
  signal,
}: {
  baseUrl: string;
  filter: string;
  page: number;
  providerContext: ProviderContext;
  signal: AbortSignal;
}): Promise<{ posts: Post[]; html: string }> => {
  const { axios, commonHeaders, cheerio } = providerContext;
  const url = buildListUrl(baseUrl, filter, page);
  const res = await axios.get(url, {
    headers: {
      ...commonHeaders,
      Referer: `${baseUrl}/`,
    },
    timeout: REQUEST_TIMEOUT,
    signal,
  });
  const html = typeof res.data === "string" ? res.data : String(res.data ?? "");
  return {
    posts: parsePostsFromHtml(html, baseUrl, cheerio),
    html,
  };
};

const fetchRandomArchivePosts = async ({
  baseUrl,
  filter,
  providerContext,
  signal,
}: {
  baseUrl: string;
  filter: string;
  providerContext: ProviderContext;
  signal: AbortSignal;
}): Promise<Post[]> => {
  const { cheerio } = providerContext;
  const firstPage = await fetchPostsPage({
    baseUrl,
    filter,
    page: 1,
    providerContext,
    signal,
  });
  const maxPage = extractMaxPageFromHtml(firstPage.html, cheerio);
  if (maxPage <= 1) {
    return firstPage.posts;
  }
  const randomPage = 1 + Math.floor(Math.random() * maxPage);
  if (randomPage === 1) {
    return firstPage.posts;
  }
  const randomPageData = await fetchPostsPage({
    baseUrl,
    filter,
    page: randomPage,
    providerContext,
    signal,
  });
  return randomPageData.posts.length > 0
    ? randomPageData.posts
    : firstPage.posts;
};

export const getPosts = async function ({
  filter,
  page,
  signal,
  providerContext,
}: {
  filter: string;
  page: number;
  providerValue: string;
  signal: AbortSignal;
  providerContext: ProviderContext;
}): Promise<Post[]> {
  try {
    if (signal?.aborted) return [];
    const baseUrl = await resolveBaseUrl(providerContext);
    const parsedFilter = parseFilterRandom(filter);

    if (isTrendingFilter(parsedFilter.filter)) {
      return await fetchTrendingPosts({
        baseUrl,
        providerContext,
        signal,
      });
    }

    if (parsedFilter.random && isArchiveFilter(parsedFilter.filter)) {
      return await fetchRandomArchivePosts({
        baseUrl,
        filter: parsedFilter.filter,
        providerContext,
        signal,
      });
    }

    const result = await fetchPostsPage({
      baseUrl,
      filter: parsedFilter.filter,
      page,
      providerContext,
      signal,
    });
    return result.posts;
  } catch (err) {
    console.error("altadefinizionez posts error", err);
    return [];
  }
};

export const getSearchPosts = async function ({
  searchQuery,
  page,
  signal,
  providerContext,
}: {
  searchQuery: string;
  page: number;
  providerValue: string;
  signal: AbortSignal;
  providerContext: ProviderContext;
}): Promise<Post[]> {
  try {
    if (signal?.aborted) return [];
    const normalized = (searchQuery || "").trim();
    if (!normalized) return [];
    if (page > 1) return [];

    const { axios, commonHeaders, cheerio } = providerContext;
    const baseUrl = await resolveBaseUrl(providerContext);
    const body = `do=search&subaction=search&story=${encodeURIComponent(
      normalized
    )}`;

    const res = await axios.post(`${baseUrl}/`, body, {
      headers: {
        ...commonHeaders,
        Referer: `${baseUrl}/`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      timeout: REQUEST_TIMEOUT,
      signal,
    });

    return parsePostsFromHtml(
      typeof res.data === "string" ? res.data : String(res.data ?? ""),
      baseUrl,
      cheerio
    );
  } catch (err) {
    console.error("altadefinizionez search error", err);
    return [];
  }
};
