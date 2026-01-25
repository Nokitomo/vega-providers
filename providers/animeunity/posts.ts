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

const PAGE_SIZE = 30;

type AnimeunitySession = {
  xsrfToken?: string;
  session?: string;
};

let hasLoggedBaseUrl = false;

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
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

async function getSession(
  axios: ProviderContext["axios"],
  baseHost: string
): Promise<AnimeunitySession & { csrfToken?: string }> {
  try {
    const response = await axios.get(`${baseHost}/`, {
      headers: DEFAULT_HEADERS,
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
}: {
  page: number;
  providerContext: ProviderContext;
  popular: boolean;
}): Promise<Post[]> {
  const { axios, cheerio } = providerContext;
  const { baseHost } = await resolveBaseUrls(providerContext);
  const query: string[] = [];
  if (popular) {
    query.push("popular=true");
  }
  if (page > 1) {
    query.push(`page=${page}`);
  }
  const url = `${baseHost}/top-anime${query.length ? `?${query.join("&")}` : ""}`;
  const res = await axios.get(url, {
    headers: DEFAULT_HEADERS,
    timeout: TIMEOUTS.SHORT,
  });
  return parseTopPostsFromHtml(res.data, cheerio, baseHost);
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
  const { baseHost } = await resolveBaseUrls(providerContext);
  const res = await axios.get(`${baseHost}/calendario`, {
    headers: DEFAULT_HEADERS,
    timeout: TIMEOUTS.SHORT,
  });
  return parseCalendarPostsFromHtml(res.data, cheerio, baseHost);
}

async function fetchArchive({
  page,
  providerContext,
}: {
  page: number;
  providerContext: ProviderContext;
}): Promise<Post[]> {
  const { axios } = providerContext;
  const { baseHost } = await resolveBaseUrls(providerContext);
  const session = await getSession(axios, baseHost);
  const headers = buildSessionHeaders(session, baseHost);
  const offset = Math.max(0, (page - 1) * PAGE_SIZE);
  const payload = {
    title: false,
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
  return parseArchiveRecords(records, baseHost);
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
    switch (filter) {
      case "latest":
        return await fetchLatest({ page, providerContext });
      case "top":
        return await fetchTop({ page, providerContext, popular: false });
      case "popular":
        return await fetchPopular({ page, providerContext });
      case "calendar":
        return await fetchCalendar({ providerContext });
      case "archive":
        return await fetchArchive({ page, providerContext });
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
  const session = await getSession(axios, baseHost);
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
