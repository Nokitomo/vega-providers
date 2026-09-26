import { ProviderContext } from "../../types";
import { getProviderRuntimeCache } from "../mappings/runtimeCache";

export const TVDB_BASE_URL = "https://www.thetvdb.com";

const REQUEST_TIMEOUT_MS = 15000;
const HTML_SUCCESS_TTL_MS = 60 * 60 * 1000;
const HTML_FAILURE_TTL_MS = 30 * 60 * 1000;

type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

export type TvdbHtmlResponse = {
  html: string;
  url: string;
};

function buildTvdbUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return `${TVDB_BASE_URL}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;
}

function readResponseUrl(response: any, fallback: string): string {
  return (
    response?.request?.res?.responseUrl ||
    response?.request?.responseURL ||
    response?.request?._redirectable?._currentUrl ||
    fallback
  );
}

export async function fetchTvdbHtml(
  providerContext: ProviderContext,
  pathOrUrl: string,
  bypassCache = false,
): Promise<TvdbHtmlResponse | null> {
  const url = buildTvdbUrl(pathOrUrl);
  const cache = getProviderRuntimeCache(providerContext);
  const cacheKey = `animeunity:tvdb:html:${url}`;
  const pendingKey = `${cacheKey}:pending`;
  const cached = cache.get(cacheKey) as
    CacheEntry<TvdbHtmlResponse | null> | undefined;
  if (!bypassCache && cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const pending = cache.get(pendingKey) as
    Promise<TvdbHtmlResponse | null> | undefined;
  if (pending) return pending;

  const download = async (): Promise<TvdbHtmlResponse | null> => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await providerContext.axios.get(url, {
          timeout: REQUEST_TIMEOUT_MS,
          headers: {
            Accept: "text/html,application/xhtml+xml",
            "Accept-Language": "it,en;q=0.9,ja;q=0.7",
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/123 Safari/537.36",
          },
          responseType: "text",
        });
        const html = typeof response?.data === "string" ? response.data : "";
        return html.includes("TheTVDB") || html.includes("thetvdb")
          ? { html, url: readResponseUrl(response, url) }
          : null;
      } catch (error: any) {
        const status = Number(error?.response?.status);
        const retryable = status === 429 || status >= 500;
        if (!retryable || attempt > 0) return null;
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
    }
    return null;
  };

  const request = download()
    .then((value) => {
      cache.set(cacheKey, {
        expiresAt:
          Date.now() + (value ? HTML_SUCCESS_TTL_MS : HTML_FAILURE_TTL_MS),
        value,
      } as CacheEntry<TvdbHtmlResponse | null>);
      return value;
    })
    .finally(() => cache.delete(pendingKey));

  cache.set(pendingKey, request);
  return request;
}
