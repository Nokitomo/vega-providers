import { Post, ProviderContext } from "../types";
import {
  parseArchiveRecords,
  parseCalendarPostsFromHtml,
  parseLatestPostsFromHtml,
  parseTopPostsFromHtml,
  toPost,
} from "./parsers/posts";
import {
  BASE_HOST,
  BASE_HOST_NO_WWW,
  DEFAULT_HEADERS,
  TIMEOUTS,
} from "./config";

const PAGE_SIZE = 30;

type AnimeunitySession = {
  xsrfToken?: string;
  session?: string;
};

function extractCookieValue(raw: string, name: string): string | undefined {
  const match = new RegExp(`${name}=([^;]+)`).exec(raw);
  return match?.[1];
}

function extractCsrfToken(html: string): string | undefined {
  const match = html.match(/name="csrf-token" content="([^"]+)"/i);
  return match?.[1];
}

async function getSession(
  axios: ProviderContext["axios"]
): Promise<AnimeunitySession & { csrfToken?: string }> {
  try {
    const response = await axios.get(`${BASE_HOST}/`, {
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

function buildSessionHeaders(session: AnimeunitySession & { csrfToken?: string }): Record<string, string> {
  const headers: Record<string, string> = {
    ...DEFAULT_HEADERS,
    Origin: BASE_HOST,
    Referer: `${BASE_HOST}/`,
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
  const suffix = page > 1 ? `?page=${page}` : "";
  const url = `${BASE_HOST_NO_WWW}/${suffix}`;
  const res = await axios.get(url, {
    headers: DEFAULT_HEADERS,
    timeout: TIMEOUTS.SHORT,
  });
  return parseLatestPostsFromHtml(res.data, cheerio, BASE_HOST);
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
  const query: string[] = [];
  if (popular) {
    query.push("popular=true");
  }
  if (page > 1) {
    query.push(`page=${page}`);
  }
  const url = `${BASE_HOST}/top-anime${query.length ? `?${query.join("&")}` : ""}`;
  const res = await axios.get(url, {
    headers: DEFAULT_HEADERS,
    timeout: TIMEOUTS.SHORT,
  });
  return parseTopPostsFromHtml(res.data, cheerio, BASE_HOST);
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
  const res = await axios.get(`${BASE_HOST}/calendario`, {
    headers: DEFAULT_HEADERS,
    timeout: TIMEOUTS.SHORT,
  });
  return parseCalendarPostsFromHtml(res.data, cheerio, BASE_HOST);
}

async function fetchArchive({
  page,
  providerContext,
}: {
  page: number;
  providerContext: ProviderContext;
}): Promise<Post[]> {
  const { axios } = providerContext;
  const session = await getSession(axios);
  const headers = buildSessionHeaders(session);
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
  const res = await axios.post(`${BASE_HOST}/archivio/get-animes`, payload, {
    headers: {
      ...headers,
      "Content-Type": "application/json",
    },
    timeout: TIMEOUTS.LONG,
    withCredentials: true,
  });
  const records = res.data?.records || [];
  return parseArchiveRecords(records, BASE_HOST);
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
  const session = await getSession(axios);
  const headers = buildSessionHeaders(session);
  const normalized = (searchQuery || "").trim();
  if (!normalized) {
    return [];
  }
  const posts: Post[] = [];
  const seen = new Set<string>();

  try {
    const liveRes = await axios.post(
      `${BASE_HOST}/livesearch`,
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
      const post = toPost(item, BASE_HOST);
      if (post && !seen.has(post.link)) {
        posts.push(post);
        seen.add(post.link);
      }
    });
  } catch (_) {
    // ignore and try archive search
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
    const res = await axios.post(`${BASE_HOST}/archivio/get-animes`, payload, {
      headers: {
        ...headers,
        "Content-Type": "application/json",
      },
      timeout: TIMEOUTS.LONG,
      withCredentials: true,
    });
    const records = res.data?.records || [];
    records.forEach((item: any) => {
      const post = toPost(item, BASE_HOST);
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
