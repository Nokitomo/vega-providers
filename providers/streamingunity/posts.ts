import { Post, ProviderContext } from "../types";
import {
  DEFAULT_LOCALE,
  REQUEST_TIMEOUT,
  buildLocaleUrl,
  extractInertiaPage,
  normalizeText,
  pickImageByType,
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

const DEFAULT_CDN_URL = "https://cdn.streamingunity.tv";
const PAGE_SIZE = 60;

const buildOffset = (page: number): number =>
  Math.max(0, (Math.max(1, page) - 1) * PAGE_SIZE);

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

const fetchHtml = async (
  url: string,
  providerContext: ProviderContext,
  signal: AbortSignal
): Promise<string> => {
  const { axios, commonHeaders } = providerContext;
  const res = await axios.get(url, {
    headers: {
      ...commonHeaders,
      Referer: url,
    },
    timeout: REQUEST_TIMEOUT,
    signal,
  });
  return typeof res.data === "string" ? res.data : String(res.data ?? "");
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
  const offset = buildOffset(page);
  let cdnUrl = DEFAULT_CDN_URL;

  if (page <= 1) {
    const homeUrl = buildLocaleUrl("/", baseUrl);
    const html = await fetchHtml(homeUrl, providerContext, signal);
    const pageData = extractInertiaPage(html, providerContext.cheerio);
    cdnUrl = pageData?.props?.cdn_url || DEFAULT_CDN_URL;
    const sliders = pageData?.props?.sliders || [];
    const slider = findSlider(sliders, sliderKey);
    const titles = slider?.titles || [];
    const posts = mapTitlesToPosts(titles, baseUrl, cdnUrl, type);
    if (posts.length > 0) return posts;
  }

  try {
    const params = new URLSearchParams();
    params.set("lang", DEFAULT_LOCALE);
    if (offset > 0) {
      params.set("offset", String(offset));
    }
    const apiUrl = `${baseUrl.replace(/\/+$/, "")}/api/browse/${sliderKey}${
      params.toString() ? `?${params.toString()}` : ""
    }`;
    const res = await providerContext.axios.get(apiUrl, {
      headers: providerContext.commonHeaders,
      timeout: REQUEST_TIMEOUT,
      signal,
    });
    const apiTitles = res?.data?.titles || [];
    return mapTitlesToPosts(apiTitles, baseUrl, cdnUrl, type);
  } catch (err) {
    console.error("streamingunity browse fallback error", err);
    return [];
  }
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
  const offset = buildOffset(page);
  let cdnUrl = DEFAULT_CDN_URL;
  const archiveFilters = filters || {};
  const shouldUseRandomOffset =
    page <= 1 &&
    archiveFilters.random === true &&
    !archiveFilters.search &&
    !archiveFilters.sort &&
    !archiveFilters.type &&
    !archiveFilters.year &&
    !archiveFilters.score &&
    !archiveFilters.views &&
    !archiveFilters.service &&
    !archiveFilters.quality &&
    !archiveFilters.age &&
    (!archiveFilters.genres || archiveFilters.genres.length === 0);

  const buildArchiveParams = (
    includeOffset: boolean,
    customOffset?: number
  ): URLSearchParams => {
    const params = new URLSearchParams();
    params.set("lang", DEFAULT_LOCALE);
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
    if (includeOffset) {
      const effectiveOffset =
        typeof customOffset === "number" ? customOffset : offset;
      if (effectiveOffset > 0) {
        params.set("offset", String(effectiveOffset));
      }
    }
    return params;
  };

  let randomOffset: number | undefined;

  if (page <= 1) {
    const params = buildArchiveParams(false);
    const query = params.toString();
    const archiveUrl = buildLocaleUrl(
      `/archive${query ? `?${query}` : ""}`,
      baseUrl
    );
    const html = await fetchHtml(archiveUrl, providerContext, signal);
    const pageData = extractInertiaPage(html, providerContext.cheerio);
    cdnUrl = pageData?.props?.cdn_url || DEFAULT_CDN_URL;
    const totalCount = Number(pageData?.props?.totalCount);

    if (shouldUseRandomOffset && Number.isFinite(totalCount) && totalCount > 0) {
      randomOffset = Math.floor(Math.random() * totalCount);
    }

    if (shouldUseRandomOffset) {
      // For random archive fetches (hero), use API with random offset instead
      // of the first page, so selection spans the whole archive.
      randomOffset = randomOffset || 0;
    } else {
      const titles = pageData?.props?.titles || [];
      const posts = mapTitlesToPosts(titles, baseUrl, cdnUrl, archiveFilters.type);
      if (posts.length > 0) return posts;
    }
  }

  try {
    const params = buildArchiveParams(true, randomOffset);
    const apiUrl = `${baseUrl.replace(/\/+$/, "")}/api/archive${
      params.toString() ? `?${params.toString()}` : ""
    }`;
    const res = await providerContext.axios.get(apiUrl, {
      headers: providerContext.commonHeaders,
      timeout: REQUEST_TIMEOUT,
      signal,
    });
    const apiTitles = res?.data?.titles || [];
    return mapTitlesToPosts(apiTitles, baseUrl, cdnUrl, archiveFilters.type);
  } catch (err) {
    console.error("streamingunity archive fallback error", err);
    return [];
  }
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

  const offset = buildOffset(page);
  let cdnUrl = DEFAULT_CDN_URL;

  if (page <= 1) {
    const browseParams = new URLSearchParams();
    browseParams.set("g", normalizedGenre);
    const browseUrl = buildLocaleUrl(
      `/browse/genre?${browseParams.toString()}`,
      baseUrl
    );
    const html = await fetchHtml(browseUrl, providerContext, signal);
    const pageData = extractInertiaPage(html, providerContext.cheerio);
    cdnUrl = pageData?.props?.cdn_url || DEFAULT_CDN_URL;
    const titles = pageData?.props?.titles || [];
    const posts = mapTitlesToPosts(titles, baseUrl, cdnUrl);
    if (posts.length > 0) return posts;
  }

  try {
    const params = new URLSearchParams();
    params.set("lang", DEFAULT_LOCALE);
    params.set("g", normalizedGenre);
    if (offset > 0) {
      params.set("offset", String(offset));
    }

    const apiUrl = `${baseUrl.replace(/\/+$/, "")}/api/browse/genre?${
      params.toString()
    }`;
    const res = await providerContext.axios.get(apiUrl, {
      headers: providerContext.commonHeaders,
      timeout: REQUEST_TIMEOUT,
      signal,
    });
    const apiTitles = res?.data?.titles || [];
    return mapTitlesToPosts(apiTitles, baseUrl, cdnUrl);
  } catch (err) {
    console.error("streamingunity browse genre fallback error", err);
    return [];
  }
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
    const offset = buildOffset(page);

    const fetchSearchApi = async (cdnUrl: string): Promise<Post[]> => {
      const params = new URLSearchParams();
      params.set("lang", DEFAULT_LOCALE);
      params.set("q", query);
      if (offset > 0) {
        params.set("offset", String(offset));
      }
      const apiUrl = `${baseUrl.replace(/\/+$/, "")}/api/search?${params.toString()}`;
      const res = await providerContext.axios.get(apiUrl, {
        headers: providerContext.commonHeaders,
        timeout: REQUEST_TIMEOUT,
        signal,
      });
      const apiTitles = res?.data?.data || res?.data?.titles || [];
      return mapTitlesToPosts(apiTitles, baseUrl, cdnUrl);
    };

    if (page <= 1) {
      const searchUrl = buildLocaleUrl(
        `/search?q=${encodeURIComponent(query)}`,
        baseUrl
      );
      const html = await fetchHtml(searchUrl, providerContext, signal);
      const pageData = extractInertiaPage(html, providerContext.cheerio);
      const cdnUrl = pageData?.props?.cdn_url || DEFAULT_CDN_URL;
      const titles = pageData?.props?.titles || [];
      const posts = mapTitlesToPosts(titles, baseUrl, cdnUrl);
      if (posts.length > 0) return posts;
      return await fetchSearchApi(cdnUrl);
    }

    try {
      return await fetchSearchApi(DEFAULT_CDN_URL);
    } catch (err) {
      console.error("streamingunity search fallback error", err);
      return [];
    }
  } catch (err) {
    console.error("streamingunity search error", err);
    return [];
  }
};
