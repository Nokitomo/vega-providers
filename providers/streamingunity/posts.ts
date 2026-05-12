import { Post, ProviderContext } from "../types";
import {
  DEFAULT_CDN_URL,
  DEFAULT_LOCALE,
  REQUEST_TIMEOUT,
  buildLocaleUrl,
  extractInertiaPage,
  normalizeText,
  pickImageByType,
  resolveCdnUrl,
  resolveBaseUrl,
  resolveTitleName,
  resolveTitleSlug,
  buildTitleUrl,
} from "./utils";
import {
  normalizeArchiveAge,
  normalizeArchiveGenre,
  normalizeArchiveQuality,
  normalizeArchiveScore,
  normalizeArchiveService,
  normalizeArchiveSort,
  normalizeArchiveType,
  normalizeArchiveViews,
  normalizeArchiveYear,
} from "./filters";

const HTML_ACCEPT_HEADER =
  "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";

type ArchiveFilters = {
  search?: string;
  sort?: string;
  type?: "tv" | "movie";
  genres?: string[];
  year?: string;
  score?: string;
  views?: string;
  service?: string;
  quality?: string;
  age?: string;
  random?: boolean;
};

const parseFilter = (filter: string): { path: string; params: URLSearchParams } => {
  const trimmed = (filter || "").trim();
  const [pathPart, queryPart] = trimmed.split("?", 2);
  const path = (pathPart || "")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "")
    .toLowerCase();
  return {
    path,
    params: new URLSearchParams(queryPart || ""),
  };
};

const splitMultiValues = (value: string): string[] =>
  value
    .split(/[,|]/)
    .map((item) => item.trim())
    .filter(Boolean);

const collectParamValues = (
  params: URLSearchParams,
  keys: string[]
): string[] => {
  if (!keys.length) return [];
  const targets = keys.map((key) => key.toLowerCase());
  const values: string[] = [];
  params.forEach((value, key) => {
    const normalizedKey = key.toLowerCase();
    if (
      targets.includes(normalizedKey) ||
      targets.some((target) => normalizedKey.startsWith(`${target}[`))
    ) {
      values.push(value);
    }
  });
  return values.filter(Boolean);
};

const parseBooleanParam = (value?: string | null): boolean => {
  if (!value) return false;
  const normalized = normalizeText(String(value)).toLowerCase();
  return ["1", "true", "yes", "y", "on"].includes(normalized);
};

const normalizeArchiveFilters = (params: URLSearchParams): ArchiveFilters => {
  const search =
    params.get("search") ||
    params.get("q") ||
    params.get("query") ||
    params.get("title") ||
    "";

  const sort = normalizeArchiveSort(
    params.get("sort") || params.get("sort_by") || params.get("order")
  );

  const type = normalizeArchiveType(params.get("type") || params.get("category"));

  const genres = new Set<string>();
  collectParamValues(params, ["genre", "genres"]).forEach((raw) => {
    splitMultiValues(raw).forEach((value) => {
      const normalized = normalizeArchiveGenre(value);
      if (normalized) genres.add(normalized);
    });
  });

  const year = normalizeArchiveYear(params.get("year") || params.get("years"));
  const score = normalizeArchiveScore(params.get("score") || params.get("rating"));
  const views = normalizeArchiveViews(params.get("views"));
  const service = normalizeArchiveService(params.get("service"));
  const quality = normalizeArchiveQuality(params.get("quality"));
  const age = normalizeArchiveAge(
    params.get("age") || params.get("age_min") || params.get("rating_age")
  );
  const random = parseBooleanParam(params.get("random"));

  return {
    search: search.trim() || undefined,
    sort,
    type: type === "tv" || type === "movie" ? type : undefined,
    genres: genres.size > 0 ? Array.from(genres) : undefined,
    year,
    score,
    views,
    service,
    quality,
    age,
    random,
  };
};

const HOME_SLIDER_KEYS = new Set(["trending", "latest", "top10", "upcoming"]);

const resolveSliderKey = (path: string): string | null => {
  if (!path) return null;
  const normalized = path.toLowerCase();
  if (normalized.startsWith("browse/")) {
    const key = normalized.replace(/^browse\//, "");
    return HOME_SLIDER_KEYS.has(key) ? key : null;
  }
  return HOME_SLIDER_KEYS.has(normalized) ? normalized : null;
};

const resolveBrowseGenre = (params: URLSearchParams): string | undefined => {
  const genre = params.get("g") || params.get("genre") || "";
  const normalized = normalizeText(genre);
  return normalized || undefined;
};

const findSlider = (sliders: any[], key: string): any | null => {
  if (!Array.isArray(sliders) || !key) return null;
  const normalizedKey = key.toLowerCase();
  const byName = sliders.find(
    (slider) => String(slider?.name || "").toLowerCase() === normalizedKey
  );
  if (byName) return byName;

  const labelMap: Record<string, string[]> = {
    trending: ["titoli del momento", "trending"],
    latest: ["aggiunti di recente", "recently"],
    top10: ["top 10"],
    upcoming: ["in arrivo", "upcoming"],
  };
  const labelHints = labelMap[normalizedKey] || [];

  return (
    sliders.find((slider) => {
      const label = normalizeText(String(slider?.label || "")).toLowerCase();
      return labelHints.some((hint) => label.includes(hint));
    }) || null
  );
};

const mapTitleToPost = (
  title: any,
  baseUrl: string,
  cdnUrl: string
): Post | null => {
  if (!title?.id) return null;
  const slug = resolveTitleSlug(title, DEFAULT_LOCALE);
  const link = buildTitleUrl(title.id, slug, baseUrl);
  const name = resolveTitleName(title, DEFAULT_LOCALE);
  const image = pickImageByType(title?.images, cdnUrl, [
    "poster",
    "cover",
    "background",
  ]);
  if (!name || !link || !image) return null;
  return {
    title: name,
    link,
    image,
  };
};

const mapTitlesToPosts = (
  titles: any[],
  baseUrl: string,
  cdnUrl: string,
  type?: "tv" | "movie"
): Post[] => {
  if (!Array.isArray(titles)) return [];
  const posts: Post[] = [];
  const seen = new Set<string>();
  titles.forEach((title) => {
    if (type && String(title?.type || "").toLowerCase() !== type) return;
    const post = mapTitleToPost(title, baseUrl, cdnUrl);
    if (!post || !post.link || seen.has(post.link)) return;
    posts.push(post);
    seen.add(post.link);
  });
  return posts;
};

const extractPayloadFromResponse = (
  responseData: unknown,
  providerContext: ProviderContext
): any | null => {
  if (responseData == null) return null;

  if (typeof responseData === "object") {
    return responseData;
  }

  const text = String(responseData ?? "").trim();
  if (!text) return null;

  if (text.startsWith("{") || text.startsWith("[")) {
    try {
      return JSON.parse(text);
    } catch (_) {
      // fall through to HTML parsing
    }
  }

  return extractInertiaPage(text, providerContext.cheerio)?.props || null;
};

const fetchPayload = async ({
  url,
  providerContext,
  signal,
  preferHtml = false,
}: {
  url: string;
  providerContext: ProviderContext;
  signal: AbortSignal;
  preferHtml?: boolean;
}): Promise<any | null> => {
  const { axios, commonHeaders } = providerContext;
  const res = await axios.get(url, {
    headers: {
      ...commonHeaders,
      Referer: url,
      ...(preferHtml ? { Accept: HTML_ACCEPT_HEADER } : {}),
    },
    timeout: REQUEST_TIMEOUT,
    signal,
    responseType: "text",
    transformResponse: [(value) => value],
  });
  return extractPayloadFromResponse(res.data, providerContext);
};

const extractTitlesFromPayload = (payload: any): any[] => {
  if (Array.isArray(payload?.titles)) {
    return payload.titles;
  }
  if (Array.isArray(payload?.data)) {
    return payload.data;
  }
  return [];
};

const fetchHomePosts = async ({
  baseUrl,
  sliderKey,
  type,
  providerContext,
  signal,
  page,
}: {
  baseUrl: string;
  sliderKey: string;
  type?: "tv" | "movie";
  providerContext: ProviderContext;
  signal: AbortSignal;
  page: number;
}): Promise<Post[]> => {
  let cdnUrl = resolveCdnUrl(null, baseUrl, DEFAULT_CDN_URL);

  try {
    const params = new URLSearchParams();
    if (page > 1) {
      params.set("page", String(page));
    }
    const browseUrl = buildLocaleUrl(
      `/browse/${sliderKey}${params.toString() ? `?${params.toString()}` : ""}`,
      baseUrl
    );
    const payload = await fetchPayload({
      url: browseUrl,
      providerContext,
      signal,
    });
    cdnUrl = resolveCdnUrl(payload, baseUrl, cdnUrl);
    const posts = mapTitlesToPosts(
      extractTitlesFromPayload(payload),
      baseUrl,
      cdnUrl,
      type
    );
    if (posts.length > 0 || page > 1) return posts;
  } catch (err) {
    console.error("streamingunity browse route error", err);
  }

  if (page <= 1) {
    try {
      const homeUrl = buildLocaleUrl("/", baseUrl);
      const pageData = await fetchPayload({
        url: homeUrl,
        providerContext,
        signal,
        preferHtml: true,
      });
      cdnUrl = resolveCdnUrl(pageData, baseUrl, cdnUrl);
      const sliders = pageData?.sliders || [];
      const slider = findSlider(sliders, sliderKey);
      const titles = slider?.titles || [];
      return mapTitlesToPosts(titles, baseUrl, cdnUrl, type);
    } catch (err) {
      console.error("streamingunity browse html fallback error", err);
    }
  }

  return [];
};

const fetchArchivePosts = async ({
  baseUrl,
  filters,
  providerContext,
  signal,
  page,
}: {
  baseUrl: string;
  filters?: ArchiveFilters;
  providerContext: ProviderContext;
  signal: AbortSignal;
  page: number;
}): Promise<Post[]> => {
  let cdnUrl = resolveCdnUrl(null, baseUrl, DEFAULT_CDN_URL);
  const archiveFilters = filters || {};

  const buildArchiveParams = (): URLSearchParams => {
    const params = new URLSearchParams();
    if (archiveFilters.search) params.set("search", archiveFilters.search);
    if (archiveFilters.sort) params.set("sort", archiveFilters.sort);
    if (archiveFilters.type) params.set("type", archiveFilters.type);
    if (archiveFilters.year) params.set("year", archiveFilters.year);
    if (archiveFilters.score) params.set("score", archiveFilters.score);
    if (archiveFilters.views) params.set("views", archiveFilters.views);
    if (archiveFilters.service) params.set("service", archiveFilters.service);
    if (archiveFilters.quality) params.set("quality", archiveFilters.quality);
    if (archiveFilters.age) params.set("age", archiveFilters.age);
    if (archiveFilters.genres && archiveFilters.genres.length > 0) {
      archiveFilters.genres.forEach((genre) => {
        if (genre) params.append("genre[]", genre);
      });
    }
    if (archiveFilters.random) {
      params.set("random", "true");
    }
    if (page > 1) {
      params.set("page", String(page));
    }
    return params;
  };

  try {
    const params = buildArchiveParams();
    const archiveUrl = buildLocaleUrl(
      `/archive${params.toString() ? `?${params.toString()}` : ""}`,
      baseUrl
    );
    const payload = await fetchPayload({
      url: archiveUrl,
      providerContext,
      signal,
    });
    cdnUrl = resolveCdnUrl(payload, baseUrl, cdnUrl);
    const posts = mapTitlesToPosts(
      extractTitlesFromPayload(payload),
      baseUrl,
      cdnUrl,
      archiveFilters.type
    );
    if (posts.length > 0 || page > 1) return posts;
  } catch (err) {
    console.error("streamingunity archive route error", err);
  }

  if (page <= 1) {
    try {
      const params = buildArchiveParams();
      params.delete("page");
      const archiveUrl = buildLocaleUrl(
        `/archive${params.toString() ? `?${params.toString()}` : ""}`,
        baseUrl
      );
      const pageData = await fetchPayload({
        url: archiveUrl,
        providerContext,
        signal,
        preferHtml: true,
      });
      cdnUrl = resolveCdnUrl(pageData, baseUrl, cdnUrl);
      const titles = extractTitlesFromPayload(pageData);
      return mapTitlesToPosts(titles, baseUrl, cdnUrl, archiveFilters.type);
    } catch (err) {
      console.error("streamingunity archive html fallback error", err);
    }
  }

  return [];
};

const fetchBrowseGenrePosts = async ({
  baseUrl,
  genre,
  providerContext,
  signal,
  page,
}: {
  baseUrl: string;
  genre: string;
  providerContext: ProviderContext;
  signal: AbortSignal;
  page: number;
}): Promise<Post[]> => {
  const normalizedGenre = normalizeText(genre);
  if (!normalizedGenre) return [];

  let cdnUrl = resolveCdnUrl(null, baseUrl, DEFAULT_CDN_URL);

  try {
    const params = new URLSearchParams();
    params.set("g", normalizedGenre);
    if (page > 1) {
      params.set("page", String(page));
    }
    const browseUrl = buildLocaleUrl(
      `/browse/genre?${params.toString()}`,
      baseUrl
    );
    const payload = await fetchPayload({
      url: browseUrl,
      providerContext,
      signal,
    });
    cdnUrl = resolveCdnUrl(payload, baseUrl, cdnUrl);
    const posts = mapTitlesToPosts(
      extractTitlesFromPayload(payload),
      baseUrl,
      cdnUrl
    );
    if (posts.length > 0 || page > 1) return posts;
  } catch (err) {
    console.error("streamingunity browse genre route error", err);
  }

  if (page <= 1) {
    try {
      const browseParams = new URLSearchParams();
      browseParams.set("g", normalizedGenre);
      const browseUrl = buildLocaleUrl(
        `/browse/genre?${browseParams.toString()}`,
        baseUrl
      );
      const pageData = await fetchPayload({
        url: browseUrl,
        providerContext,
        signal,
        preferHtml: true,
      });
      cdnUrl = resolveCdnUrl(pageData, baseUrl, cdnUrl);
      const titles = extractTitlesFromPayload(pageData);
      return mapTitlesToPosts(titles, baseUrl, cdnUrl);
    } catch (err) {
      console.error("streamingunity browse genre html fallback error", err);
    }
  }

  return [];
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
    if (!baseUrl) {
      console.error("streamingunity posts error: missing base url");
      return [];
    }
    const parsed = parseFilter(filter);
    const archiveFilters = normalizeArchiveFilters(parsed.params);
    const browseGenre = resolveBrowseGenre(parsed.params);
    const sliderKey = resolveSliderKey(parsed.path);

    if (parsed.path === "browse/genre" && browseGenre) {
      return await fetchBrowseGenrePosts({
        baseUrl,
        genre: browseGenre,
        providerContext,
        signal,
        page,
      });
    }

    if (sliderKey) {
      return await fetchHomePosts({
        baseUrl,
        sliderKey,
        type: archiveFilters.type,
        providerContext,
        signal,
        page,
      });
    }

    if (parsed.path.startsWith("archive")) {
      return await fetchArchivePosts({
        baseUrl,
        filters: archiveFilters,
        providerContext,
        signal,
        page,
      });
    }

    return await fetchArchivePosts({
      baseUrl,
      filters: archiveFilters,
      providerContext,
      signal,
      page,
    });
  } catch (err) {
    console.error("streamingunity posts error", err);
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
    const query = (searchQuery || "").trim();
    if (!query) return [];

    const baseUrl = await resolveBaseUrl(providerContext);
    if (!baseUrl) {
      console.error("streamingunity search error: missing base url");
      return [];
    }
    try {
      const params = new URLSearchParams();
      params.set("q", query);
      if (page > 1) {
        params.set("page", String(page));
      }
      const searchUrl = buildLocaleUrl(
        `/search?${params.toString()}`,
        baseUrl
      );
      const payload = await fetchPayload({
        url: searchUrl,
        providerContext,
        signal,
      });
      const cdnUrl = resolveCdnUrl(payload, baseUrl, DEFAULT_CDN_URL);
      const posts = mapTitlesToPosts(
        extractTitlesFromPayload(payload),
        baseUrl,
        cdnUrl
      );
      if (posts.length > 0 || page > 1) return posts;
      if (page <= 1) {
        const pageData = await fetchPayload({
          url: searchUrl,
          providerContext,
          signal,
          preferHtml: true,
        });
        const htmlCdnUrl = resolveCdnUrl(pageData, baseUrl, cdnUrl);
        const titles = extractTitlesFromPayload(pageData);
        return mapTitlesToPosts(titles, baseUrl, htmlCdnUrl);
      }
      return [];
    } catch (err) {
      console.error("streamingunity search route error", err);
      try {
        const searchUrl = buildLocaleUrl(
          `/search?q=${encodeURIComponent(query)}`,
          baseUrl
        );
        const pageData = await fetchPayload({
          url: searchUrl,
          providerContext,
          signal,
          preferHtml: true,
        });
        const cdnUrl = resolveCdnUrl(pageData, baseUrl, DEFAULT_CDN_URL);
        const titles = extractTitlesFromPayload(pageData);
        return mapTitlesToPosts(titles, baseUrl, cdnUrl);
      } catch (htmlErr) {
        console.error("streamingunity search html fallback error", htmlErr);
        return [];
      }
    }
  } catch (err) {
    console.error("streamingunity search error", err);
    return [];
  }
};
