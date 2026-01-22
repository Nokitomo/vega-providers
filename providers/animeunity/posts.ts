import { Post, ProviderContext } from "../types";

const BASE_HOST = "https://www.animeunity.so";
const BASE_HOST_NO_WWW = "https://animeunity.so";
const DEFAULT_HEADERS: Record<string, string> = {
  Accept: "application/json",
  "User-Agent":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
};

const PAGE_SIZE = 30;

type AnimeunitySession = {
  xsrfToken?: string;
  session?: string;
};

function decodeHtmlAttribute(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function extractCookieValue(raw: string, name: string): string | undefined {
  const match = new RegExp(`${name}=([^;]+)`).exec(raw);
  return match?.[1];
}

async function getSession(
  axios: ProviderContext["axios"]
): Promise<AnimeunitySession> {
  try {
    const response = await axios.get(`${BASE_HOST}/`, {
      headers: DEFAULT_HEADERS,
      timeout: 10000,
    });
    const raw = response.headers?.["set-cookie"];
    const cookieHeader = Array.isArray(raw) ? raw.join("; ") : raw || "";
    if (!cookieHeader) {
      return {};
    }
    const xsrf = extractCookieValue(cookieHeader, "XSRF-TOKEN");
    const session = extractCookieValue(cookieHeader, "animeunity_session");
    return {
      xsrfToken: xsrf ? decodeURIComponent(xsrf) : undefined,
      session,
    };
  } catch (_) {
    return {};
  }
}

function buildSessionHeaders(session: AnimeunitySession): Record<string, string> {
  const headers: Record<string, string> = {
    ...DEFAULT_HEADERS,
    Origin: BASE_HOST,
    Referer: `${BASE_HOST}/`,
  };
  if (session.xsrfToken) {
    headers["X-XSRF-TOKEN"] = session.xsrfToken;
  }
  const parts: string[] = [];
  if (session.xsrfToken) {
    parts.push(`XSRF-TOKEN=${session.xsrfToken}`);
  }
  if (session.session) {
    parts.push(`animeunity_session=${session.session}`);
  }
  if (parts.length > 0) {
    headers["Cookie"] = parts.join("; ");
  }
  return headers;
}

function normalizeImageUrl(url?: string): string {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (host.includes("animeworld.so") || host.includes("forbiddenlol.cloud")) {
      const filename = parsed.pathname.split("/").pop() || "";
      if (filename) {
        return `https://img.animeunity.so/anime/${filename}`;
      }
    }
  } catch (_) {
    return url;
  }
  return url;
}

function buildAnimeLink(id?: number | string, slug?: string): string {
  if (!id) return "";
  if (!slug) {
    return `${BASE_HOST}/anime/${id}`;
  }
  return `${BASE_HOST}/anime/${id}-${slug}`;
}

function pickTitle(anime: any): string {
  return (
    anime?.title_eng ||
    anime?.title ||
    anime?.title_it ||
    anime?.name ||
    ""
  );
}

function toPost(anime: any): Post | null {
  const id = anime?.id;
  const slug = anime?.slug;
  const title = pickTitle(anime);
  const image = normalizeImageUrl(anime?.imageurl || anime?.imageUrl);
  const link = buildAnimeLink(id, slug);
  if (!title || !image || !link) {
    return null;
  }
  return { title, image, link };
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
  const res = await axios.get(url, { headers: DEFAULT_HEADERS, timeout: 10000 });
  const $ = cheerio.load(res.data);
  const raw = $("layout-items").attr("items-json") || "";
  if (!raw) return [];
  const data = JSON.parse(raw);
  const items = data?.data || [];
  const posts: Post[] = [];
  items.forEach((item: any) => {
    const post = toPost(item?.anime ?? item);
    if (post) {
      posts.push(post);
    }
  });
  return posts;
}

async function fetchPopular({
  page,
  providerContext,
}: {
  page: number;
  providerContext: ProviderContext;
}): Promise<Post[]> {
  const { axios, cheerio } = providerContext;
  const params = new URLSearchParams({ popular: "true" });
  if (page > 1) {
    params.set("page", String(page));
  }
  const url = `${BASE_HOST}/top-anime?${params.toString()}`;
  const res = await axios.get(url, { headers: DEFAULT_HEADERS, timeout: 10000 });
  const $ = cheerio.load(res.data);
  const raw = $("top-anime").attr("animes") || "";
  if (!raw) return [];
  const data = JSON.parse(raw);
  const items = data?.data || [];
  const posts: Post[] = [];
  items.forEach((item: any) => {
    const post = toPost(item);
    if (post) {
      posts.push(post);
    }
  });
  return posts;
}

async function fetchCalendar({
  providerContext,
}: {
  providerContext: ProviderContext;
}): Promise<Post[]> {
  const { axios, cheerio } = providerContext;
  const res = await axios.get(`${BASE_HOST}/calendario`, {
    headers: DEFAULT_HEADERS,
    timeout: 10000,
  });
  const $ = cheerio.load(res.data);
  const posts: Post[] = [];
  $("calendario-item").each((_, element) => {
    const raw = $(element).attr("a") || "";
    if (!raw) return;
    const decoded = decodeHtmlAttribute(raw);
    try {
      const data = JSON.parse(decoded);
      const post = toPost(data);
      if (post) {
        posts.push(post);
      }
    } catch (_) {
      return;
    }
  });
  return posts;
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
    timeout: 15000,
  });
  const records = res.data?.records || [];
  const posts: Post[] = [];
  records.forEach((item: any) => {
    const post = toPost(item);
    if (post) {
      posts.push(post);
    }
  });
  return posts;
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
      new URLSearchParams({ title: normalized }).toString(),
      {
        headers: {
          ...headers,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        timeout: 10000,
      }
    );
    const records = liveRes.data?.records || [];
    records.forEach((item: any) => {
      const post = toPost(item);
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
      timeout: 15000,
    });
    const records = res.data?.records || [];
    records.forEach((item: any) => {
      const post = toPost(item);
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
