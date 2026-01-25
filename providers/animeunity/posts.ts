import { Post, ProviderContext } from "../types";
import {
  parseArchiveRecords,
  parseCalendarPostsFromHtml,
  parseLatestPostsFromHtml,
  parseTopPostsFromHtml,
  toPost,
} from "./parsers/posts";
import {
  DEFAULT_HEADERS,
  DEFAULT_BASE_HOST,
  DEFAULT_BASE_HOST_NO_WWW,
  TIMEOUTS,
} from "./config";
import {
  normalizeArchiveOrder,
  normalizeArchiveSeason,
  normalizeArchiveStatus,
  normalizeArchiveType,
  normalizeTopOrder,
  normalizeTopStatus,
  resolveArchiveGenreId,
} from "./filters";

const PAGE_SIZE = 30;

type AnimeunitySession = {
  xsrfToken?: string;
  session?: string;
};

type ArchiveFilters = {
  title?: string;
  type?: string;
  year?: number;
  order?: string;
  status?: string;
  genres?: Array<Record<string, any>>;
  dubbed?: boolean;
  season?: string;
};

type QueryParams = {
  get: (key: string) => string | null;
  has: (key: string) => boolean;
  size: number;
};

const HTML_HEADERS: Record<string, string> = {
  ...DEFAULT_HEADERS,
  Accept: "text/html,application/xhtml+xml",
};

const SESSION_TTL_MS = 5 * 60 * 1000;

type CachedSession = AnimeunitySession & { csrfToken?: string; fetchedAt: number };

let hasLoggedBaseUrl = false;
let cachedSession: CachedSession | null = null;

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

function decodeQueryValue(value: string): string {
  const sanitized = value.replace(/\+/g, " ");
  try {
    return decodeURIComponent(sanitized);
  } catch (_) {
    return sanitized;
  }
}

function parseQueryParams(rawQuery?: string): QueryParams {
  if (!rawQuery) {
    return {
      get: () => null,
      has: () => false,
      size: 0,
    };
  }

  const map = new Map<string, string[]>();
  rawQuery
    .split("&")
    .map((part) => part.trim())
    .filter(Boolean)
    .forEach((part) => {
      const eqIndex = part.indexOf("=");
      const rawKey = eqIndex >= 0 ? part.slice(0, eqIndex) : part;
      const rawValue = eqIndex >= 0 ? part.slice(eqIndex + 1) : "";
      const key = decodeQueryValue(rawKey);
      if (!key) return;
      const value = decodeQueryValue(rawValue);
      const existing = map.get(key) || [];
      existing.push(value);
      map.set(key, existing);
    });

  return {
    get: (key: string) => {
      const values = map.get(key);
      return values && values.length > 0 ? values[0] : null;
    },
    has: (key: string) => map.has(key),
    size: map.size,
  };
}

function parseFilterParams(filter: string): {
  key: string;
  params: QueryParams;
} {
  const queryIndex = filter.indexOf("?");
  const key = queryIndex >= 0 ? filter.slice(0, queryIndex) : filter;
  const rawQuery =
    queryIndex >= 0 ? filter.slice(queryIndex + 1) : "";
  const params = parseQueryParams(rawQuery);
  return {
    key: key || filter,
    params,
  };
}

function normalizeParamValue(value: string | null): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function parseBooleanParam(value: string | null): boolean | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (
    normalized === "true" ||
    normalized === "1" ||
    normalized === "yes" ||
    normalized === "dubbed" ||
    normalized === "ita" ||
    normalized === "italian"
  ) {
    return true;
  }
  if (normalized === "false" || normalized === "0" || normalized === "no") {
    return false;
  }
  return undefined;
}

function parseNumberParam(value: string | null): number | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeGenreEntry(item: any): Record<string, any> | undefined {
  if (item == null) return undefined;
  if (typeof item === "number" && Number.isFinite(item)) {
    return { id: item };
  }
  if (typeof item === "string") {
    const trimmed = item.trim();
    if (!trimmed) return undefined;
    const parsed = Number.parseInt(trimmed, 10);
    if (Number.isFinite(parsed)) {
      return { id: parsed };
    }
    const resolved = resolveArchiveGenreId(trimmed);
    if (resolved != null) {
      return { id: resolved, name: trimmed };
    }
    return { name: trimmed };
  }
  if (typeof item === "object") {
    if ("id" in item) {
      return item as Record<string, any>;
    }
    if ("name" in item && typeof item.name === "string") {
      const trimmed = item.name.trim();
      if (!trimmed) return undefined;
      const resolved = resolveArchiveGenreId(trimmed);
      if (resolved != null) {
        return { id: resolved, name: trimmed };
      }
      return { name: trimmed };
    }
  }
  return undefined;
}

function parseGenresParam(
  value: string | null
): Array<Record<string, any>> | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  let decoded = trimmed;
  try {
    decoded = decodeURIComponent(trimmed);
  } catch (_) {
    decoded = trimmed;
  }
  if (decoded.startsWith("[")) {
    try {
      const parsed = JSON.parse(decoded);
      if (Array.isArray(parsed)) {
        const normalized = parsed
          .map(normalizeGenreEntry)
          .filter(Boolean) as Array<Record<string, any>>;
        return normalized.length > 0 ? normalized : undefined;
      }
    } catch (_) {
      // fall back to comma parsing
    }
  }
  const parts = decoded
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return undefined;
  const normalized = parts
    .map(normalizeGenreEntry)
    .filter(Boolean) as Array<Record<string, any>>;
  return normalized.length > 0 ? normalized : undefined;
}

function buildArchiveFilters(params: QueryParams): ArchiveFilters {
  return {
    title: normalizeParamValue(params.get("title")),
    type: normalizeArchiveType(params.get("type")),
    year: parseNumberParam(params.get("year")),
    order: normalizeArchiveOrder(params.get("order")),
    status: normalizeArchiveStatus(params.get("status")),
    genres: parseGenresParam(params.get("genres")),
    dubbed: parseBooleanParam(params.get("dubbed")),
    season: normalizeArchiveSeason(params.get("season")),
  };
}

async function resolveBaseUrls(
  providerContext: ProviderContext
): Promise<{ baseHost: string; baseHostNoWww: string }> {
  if (!hasLoggedBaseUrl) {
    const resolvedLog = await providerContext.getBaseUrl("animeunity");
    const logValue = normalizeBaseUrl(resolvedLog || DEFAULT_BASE_HOST);
    if (resolvedLog) {
      console.log("[animeunity] baseUrl pastebin", logValue);
    } else {
      console.log("[animeunity] baseUrl fallback", DEFAULT_BASE_HOST);
    }
    hasLoggedBaseUrl = true;
  }
  const resolved =
    (await providerContext.getBaseUrl("animeunity")) || DEFAULT_BASE_HOST;
  const baseHost = normalizeBaseUrl(resolved);
  const baseHostNoWww = baseHost.includes("://www.")
    ? baseHost.replace("://www.", "://")
    : baseHost || DEFAULT_BASE_HOST_NO_WWW;
  return {
    baseHost,
    baseHostNoWww,
  };
}

function extractCookieValue(raw: string, name: string): string | undefined {
  const match = new RegExp(`${name}=([^;]+)`).exec(raw);
  return match?.[1];
}

function extractCsrfToken(html: string): string | undefined {
  const match = html.match(/name="csrf-token" content="([^"]+)"/i);
  return match?.[1];
}

function isSessionValid(
  session: (AnimeunitySession & { csrfToken?: string }) | null | undefined
): boolean {
  return Boolean(session?.xsrfToken || session?.csrfToken || session?.session);
}

async function getSession(
  axios: ProviderContext["axios"],
  baseHost: string
): Promise<AnimeunitySession & { csrfToken?: string }> {
  try {
    const response = await axios.get(`${baseHost}/`, {
      headers: HTML_HEADERS,
      timeout: TIMEOUTS.SHORT,
    });
    const csrfToken =
      typeof response.data === "string" ? extractCsrfToken(response.data) : "";
    const raw = response.headers?.["set-cookie"];
    const cookieHeader = Array.isArray(raw) ? raw.join("; ") : raw || "";
    if (!cookieHeader) {
      return { csrfToken };
    }
    const xsrf = extractCookieValue(cookieHeader, "XSRF-TOKEN");
    const session = extractCookieValue(cookieHeader, "animeunity_session");
    return {
      xsrfToken: xsrf ? decodeURIComponent(xsrf) : undefined,
      session,
      csrfToken,
    };
  } catch (_) {
    return {};
  }
}

async function getCachedSession(
  axios: ProviderContext["axios"],
  baseHost: string,
  forceRefresh = false
): Promise<AnimeunitySession & { csrfToken?: string }> {
  if (
    !forceRefresh &&
    cachedSession &&
    Date.now() - cachedSession.fetchedAt < SESSION_TTL_MS &&
    isSessionValid(cachedSession)
  ) {
    return cachedSession;
  }

  const session = await getSession(axios, baseHost);
  if (isSessionValid(session)) {
    cachedSession = { ...session, fetchedAt: Date.now() };
  }
  return cachedSession || session;
}

function buildSessionHeaders(
  session: AnimeunitySession & { csrfToken?: string },
  baseHost: string
): Record<string, string> {
  const headers: Record<string, string> = {
    ...DEFAULT_HEADERS,
    Origin: baseHost,
    Referer: `${baseHost}/`,
  };
  const token = session.xsrfToken || session.csrfToken;
  if (token) {
    headers["X-XSRF-TOKEN"] = token;
  }
  const parts: string[] = [];
  if (token) {
    parts.push(`XSRF-TOKEN=${token}`);
  }
  if (session.session) {
    parts.push(`animeunity_session=${session.session}`);
  }
  if (parts.length > 0) {
    headers["Cookie"] = parts.join("; ");
  }
  return headers;
}

async function fetchLatest({
  page,
  providerContext,
}: {
  page: number;
  providerContext: ProviderContext;
}): Promise<Post[]> {
  const { axios, cheerio } = providerContext;
  const { baseHost, baseHostNoWww } = await resolveBaseUrls(providerContext);
  const suffix = page > 1 ? `?page=${page}` : "";
  const url = `${baseHostNoWww}/${suffix}`;
  const res = await axios.get(url, {
    headers: DEFAULT_HEADERS,
    timeout: TIMEOUTS.SHORT,
  });
  return parseLatestPostsFromHtml(res.data, cheerio, baseHost);
}

async function fetchTop({
  page,
  providerContext,
  popular,
  status,
  type,
  order,
}: {
  page: number;
  providerContext: ProviderContext;
  popular?: boolean;
  status?: string;
  type?: string;
  order?: string;
}): Promise<Post[]> {
  const { axios, cheerio } = providerContext;
  const { baseHost, baseHostNoWww } = await resolveBaseUrls(providerContext);

  const query: string[] = [];
  if (popular) {
    query.push("popular=true");
  }
  if (status) {
    query.push(`status=${encodeURIComponent(status)}`);
  }
  if (type) {
    query.push(`type=${encodeURIComponent(type)}`);
  }
  if (order) {
    query.push(`order=${encodeURIComponent(order)}`);
  }
  if (page > 1) {
    query.push(`page=${page}`);
  }

  const candidates: Array<{ url: string; host: string }> = [];
  const addCandidate = (host: string, trailingSlash: boolean) => {
    const suffix = trailingSlash ? "/top-anime/" : "/top-anime";
    const url = `${host}${suffix}${query.length ? `?${query.join("&")}` : ""}`;
    if (!candidates.find((item) => item.url === url)) {
      candidates.push({ url, host });
    }
  };

  addCandidate(baseHost, false);
  addCandidate(baseHost, true);
  if (baseHostNoWww !== baseHost) {
    addCandidate(baseHostNoWww, false);
    addCandidate(baseHostNoWww, true);
  }

  const fetchFromUrl = async (url: string, host: string): Promise<Post[]> => {
    const res = await axios.get(url, {
      headers: HTML_HEADERS,
      timeout: TIMEOUTS.SHORT,
      responseType: "text",
    });
    if (page === 1) {
      const html =
        typeof res.data === "string" ? res.data : JSON.stringify(res.data || "");
      const hasTopTag = html.includes("<top-anime");
      const hasAnimesAttr = html.includes("animes=");
      console.log("[animeunity][top] response", {
        url,
        status: res.status,
        length: html.length,
        hasTopTag,
        hasAnimesAttr,
      });
      if (!hasTopTag) {
        console.log("[animeunity][top] html sample", html.slice(0, 200));
      }
    }
    return parseTopPostsFromHtml(res.data, cheerio, host);
  };

  let lastError: any = null;
  for (const candidate of candidates) {
    try {
      const posts = await fetchFromUrl(candidate.url, candidate.host);
      if (posts.length > 0) {
        return posts;
      }
    } catch (err: any) {
      lastError = err;
      if (page === 1) {
        console.log("[animeunity][top] request error", {
          url: candidate.url,
          status: err?.response?.status,
          statusText: err?.response?.statusText,
          dataSample:
            typeof err?.response?.data === "string"
              ? err.response.data.slice(0, 200)
              : undefined,
        });
      }
    }
  }

  if (page === 1 && lastError) {
    console.log("[animeunity][top] exhausted candidates");
  }

  return [];
}

async function fetchPopular({
  page,
  providerContext,
}: {
  page: number;
  providerContext: ProviderContext;
}): Promise<Post[]> {
  return fetchTop({ page, providerContext, popular: true });
}

async function fetchCalendar({
  providerContext,
}: {
  providerContext: ProviderContext;
}): Promise<Post[]> {
  const { axios, cheerio } = providerContext;
  const { baseHost, baseHostNoWww } = await resolveBaseUrls(providerContext);

  const parseResponse = (data: unknown): Post[] => {
    if (typeof data !== "string" || !data.trim()) {
      return [];
    }
    return parseCalendarPostsFromHtml(data, cheerio, baseHost);
  };

  const fetchOnce = async (host: string): Promise<Post[]> => {
    const res = await axios.get(`${host}/calendario`, {
      headers: HTML_HEADERS,
      timeout: TIMEOUTS.SHORT,
    });
    return parseResponse(res.data);
  };

  let posts = await fetchOnce(baseHost);
  if (posts.length > 0) {
    return posts;
  }

  await getCachedSession(axios, baseHost, true);

  const fallbackHost = baseHostNoWww !== baseHost ? baseHostNoWww : baseHost;
  posts = await fetchOnce(fallbackHost);
  if (posts.length > 0 || fallbackHost === baseHost) {
    return posts;
  }

  return await fetchOnce(baseHost);
}

async function fetchArchive({
  page,
  providerContext,
  filters,
}: {
  page: number;
  providerContext: ProviderContext;
  filters?: ArchiveFilters;
}): Promise<Post[]> {
  const { axios } = providerContext;
  const { baseHost } = await resolveBaseUrls(providerContext);
  const offset = Math.max(0, (page - 1) * PAGE_SIZE);
  const normalizedTitle = filters?.title?.trim();
  const payload = {
    title: normalizedTitle ? normalizedTitle : false,
    type: filters?.type || false,
    year: filters?.year ?? false,
    order: filters?.order || false,
    status: filters?.status || false,
    genres: filters?.genres && filters.genres.length > 0 ? filters.genres : false,
    offset,
    dubbed: filters?.dubbed ?? false,
    season: filters?.season || false,
  };

  const requestRecords = async (
    session: AnimeunitySession & { csrfToken?: string }
  ): Promise<any[] | null> => {
    try {
      const headers = buildSessionHeaders(session, baseHost);
      const res = await axios.post(`${baseHost}/archivio/get-animes`, payload, {
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        timeout: TIMEOUTS.LONG,
        withCredentials: true,
      });
      const records = res?.data?.records;
      return Array.isArray(records) ? records : null;
    } catch (_) {
      return null;
    }
  };

  let session = await getCachedSession(axios, baseHost);
  let records = await requestRecords(session);

  if (!records) {
    session = await getCachedSession(axios, baseHost, true);
    records = await requestRecords(session);
  }

  return parseArchiveRecords(records || [], baseHost);
}

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
    const parsed = parseFilterParams(filter);
    switch (parsed.key) {
      case "latest":
        return await fetchLatest({ page, providerContext });
      case "top":
        {
          const popular = parseBooleanParam(parsed.params.get("popular")) || false;
          const status = normalizeTopStatus(parsed.params.get("status"));
          const type = normalizeArchiveType(parsed.params.get("type"));
          const order = normalizeTopOrder(parsed.params.get("order"));

          let posts = await fetchTop({
            page,
            providerContext,
            popular,
            status,
            type,
            order,
          });

          if (
            !popular &&
            posts.length === 0 &&
            (order === "rating" || order === "score")
          ) {
            const fallbackOrder = order === "rating" ? "score" : "rating";
            posts = await fetchTop({
              page,
              providerContext,
              popular,
              status,
              type,
              order: fallbackOrder,
            });
          }

          return posts;
        }
      case "popular":
        return await fetchPopular({ page, providerContext });
      case "calendar":
        return await fetchCalendar({ providerContext });
      case "archive":
        return await fetchArchive({
          page,
          providerContext,
          filters: parsed.params.size > 0 ? buildArchiveFilters(parsed.params) : undefined,
        });
      default:
        return await fetchLatest({ page, providerContext });
    }
  } catch (err) {
    console.error("animeunity posts error", err);
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
  if (signal?.aborted) return [];
  const { axios } = providerContext;
  const { baseHost } = await resolveBaseUrls(providerContext);
  const session = await getCachedSession(axios, baseHost);
  const headers = buildSessionHeaders(session, baseHost);
  const normalized = (searchQuery || "").trim();
  if (!normalized) {
    return [];
  }
  const posts: Post[] = [];
  const seen = new Set<string>();

  if (page <= 1) {
    try {
      const liveRes = await axios.post(
        `${baseHost}/livesearch`,
        `title=${encodeURIComponent(normalized)}`,
        {
          headers: {
            ...headers,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          timeout: TIMEOUTS.SHORT,
          withCredentials: true,
        }
      );
      const records = liveRes.data?.records || [];
      records.forEach((item: any) => {
        const post = toPost(item, baseHost);
        if (post && !seen.has(post.link)) {
          posts.push(post);
          seen.add(post.link);
        }
      });
    } catch (_) {
      // ignore and try archive search
    }
  }

  try {
    const offset = Math.max(0, (page - 1) * PAGE_SIZE);
    const payload = {
      title: normalized,
      type: false,
      year: false,
      order: false,
      status: false,
      genres: false,
      offset,
      dubbed: false,
      season: false,
    };
    const res = await axios.post(`${baseHost}/archivio/get-animes`, payload, {
      headers: {
        ...headers,
        "Content-Type": "application/json",
      },
      timeout: TIMEOUTS.LONG,
      withCredentials: true,
    });
    const records = res.data?.records || [];
    records.forEach((item: any) => {
      const post = toPost(item, baseHost);
      if (post && !seen.has(post.link)) {
        posts.push(post);
        seen.add(post.link);
      }
    });
  } catch (_) {
    // ignore
  }

  return posts;
};
