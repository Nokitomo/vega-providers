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

const DEFAULT_CDN_URL = "https://cdn.streamingunity.tv";
const PAGE_SIZE = 60;

const buildOffset = (page: number): number =>
  Math.max(0, (Math.max(1, page) - 1) * PAGE_SIZE);

const normalizeType = (value: string | null): "tv" | "movie" | undefined => {
  if (!value) return undefined;
  const normalized = value.toLowerCase();
  if (["tv", "series", "show", "serie", "serietv", "tvshow"].includes(normalized)) {
    return "tv";
  }
  if (["movie", "movies", "film", "films"].includes(normalized)) {
    return "movie";
  }
  return undefined;
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

const HOME_SLIDER_KEYS = new Set(["trending", "latest", "top10"]);

const resolveSliderKey = (path: string): string | null => {
  if (!path) return null;
  const normalized = path.toLowerCase();
  if (normalized.startsWith("browse/")) {
    const key = normalized.replace(/^browse\//, "");
    return HOME_SLIDER_KEYS.has(key) ? key : null;
  }
  return HOME_SLIDER_KEYS.has(normalized) ? normalized : null;
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
  type,
  providerContext,
  signal,
  page,
}: {
  baseUrl: string;
  type?: "tv" | "movie";
  providerContext: ProviderContext;
  signal: AbortSignal;
  page: number;
}): Promise<Post[]> => {
  const offset = buildOffset(page);
  let cdnUrl = DEFAULT_CDN_URL;

  if (page <= 1) {
    const query = type ? `?type=${encodeURIComponent(type)}` : "";
    const archiveUrl = buildLocaleUrl(`/archive${query}`, baseUrl);
    const html = await fetchHtml(archiveUrl, providerContext, signal);
    const pageData = extractInertiaPage(html, providerContext.cheerio);
    cdnUrl = pageData?.props?.cdn_url || DEFAULT_CDN_URL;
    const titles = pageData?.props?.titles || [];
    const posts = mapTitlesToPosts(titles, baseUrl, cdnUrl, type);
    if (posts.length > 0) return posts;
  }

  try {
    const params = new URLSearchParams();
    if (type) {
      params.set("type", type);
    }
    if (offset > 0) {
      params.set("offset", String(offset));
    }
    const apiUrl = `${baseUrl.replace(/\/+$/, "")}/api/archive${
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
    console.error("streamingunity archive fallback error", err);
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
    const type = normalizeType(parsed.params.get("type"));
    const sliderKey = resolveSliderKey(parsed.path);

    if (sliderKey) {
      return await fetchHomePosts({
        baseUrl,
        sliderKey,
        type,
        providerContext,
        signal,
        page,
      });
    }

    if (parsed.path.startsWith("archive")) {
      return await fetchArchivePosts({
        baseUrl,
        type,
        providerContext,
        signal,
        page,
      });
    }

    return await fetchArchivePosts({
      baseUrl,
      type,
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
