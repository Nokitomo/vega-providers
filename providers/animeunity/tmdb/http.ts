import { ProviderContext } from "../../types";
import { getProviderRuntimeCache } from "../mappings/runtimeCache";

export const TMDB_BASE_URL = "https://www.themoviedb.org";

const REQUEST_TIMEOUT_MS = 15000;
const HTML_SUCCESS_TTL_MS = 60 * 60 * 1000;
const HTML_FAILURE_TTL_MS = 30 * 60 * 1000;

type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

export function tmdbLocalizedUrl(path: string, locale: string): string {
  return `${TMDB_BASE_URL}${path}?language=${encodeURIComponent(locale)}`;
}

export async function fetchTmdbHtml(
  providerContext: ProviderContext,
  path: string,
  locale: string,
  bypassCache = false
): Promise<string | null> {
  const url = tmdbLocalizedUrl(path, locale);
  const cache = getProviderRuntimeCache(providerContext);
  const cacheKey = `animeunity:tmdb:html:${url}`;
  const pendingKey = `${cacheKey}:pending`;
  const cached = cache.get(cacheKey) as CacheEntry<string | null> | undefined;
  if (!bypassCache && cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const pending = cache.get(pendingKey) as Promise<string | null> | undefined;
  if (pending) return pending;

  const download = async (): Promise<string | null> => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await providerContext.axios.get(url, {
          timeout: REQUEST_TIMEOUT_MS,
          headers: {
            Accept: "text/html,application/xhtml+xml",
            "Accept-Language": `${locale},it;q=0.9,en;q=0.8`,
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/123 Safari/537.36",
          },
          responseType: "text",
        });
        const html = typeof response?.data === "string" ? response.data : "";
        return html.includes("themoviedb") || html.includes("The Movie Database")
          ? html
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
    .then((html) => {
      cache.set(cacheKey, {
        expiresAt:
          Date.now() + (html ? HTML_SUCCESS_TTL_MS : HTML_FAILURE_TTL_MS),
        value: html,
      } as CacheEntry<string | null>);
      return html;
    })
    .finally(() => cache.delete(pendingKey));

  cache.set(pendingKey, request);
  return request;
}
