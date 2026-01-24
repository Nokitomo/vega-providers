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

function extractCsrfToken(html: string): string | undefined {
  const match = html.match(/name="csrf-token" content="([^"]+)"/i);
  return match?.[1];
}

const CALENDAR_DAY_MAP: Record<string, string> = {
  lunedi: "Monday",
  "lunedì": "Monday",
  monday: "Monday",
  martedi: "Tuesday",
  "martedì": "Tuesday",
  tuesday: "Tuesday",
  mercoledi: "Wednesday",
  "mercoledì": "Wednesday",
  wednesday: "Wednesday",
  giovedi: "Thursday",
  "giovedì": "Thursday",
  thursday: "Thursday",
  venerdi: "Friday",
  "venerdì": "Friday",
  friday: "Friday",
  sabato: "Saturday",
  saturday: "Saturday",
  domenica: "Sunday",
  sunday: "Sunday",
  indeterminato: "Undetermined",
  indeterminata: "Undetermined",
  undetermined: "Undetermined",
};

function normalizeCalendarDay(value?: string): string | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;
  return CALENDAR_DAY_MAP[normalized] || value;
}

async function getSession(
  axios: ProviderContext["axios"]
): Promise<AnimeunitySession & { csrfToken?: string }> {
  try {
    const response = await axios.get(`${BASE_HOST}/`, {
      headers: DEFAULT_HEADERS,
      timeout: 10000,
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

function toPost(anime: any, extra?: Partial<Post>): Post | null {
  const id = anime?.id;
  const slug = anime?.slug;
  const title = pickTitle(anime);
  const image = normalizeImageUrl(anime?.imageurl || anime?.imageUrl);
  const link = buildAnimeLink(id, slug);
  if (!title || !image || !link) {
    return null;
  }
  return { title, image, link, ...extra };
}

function extractEpisodeNumber(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    return value >= 0 ? value : null;
  }
  const text = String(value).trim();
  if (!text) return null;
  const match = text.match(/\d+/);
  if (!match) return null;
  const parsed = Number.parseInt(match[0], 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function extractEpisodeNumberFromEpisodes(episodes: any[]): number | null {
  let maxValue: number | null = null;
  episodes.forEach((episode) => {
    if (episode && typeof episode === "object") {
      const raw = (episode as any).number ?? (episode as any).episode ?? (episode as any).id;
      const candidate = extractEpisodeNumber(raw);
      if (candidate != null && (maxValue == null || candidate > maxValue)) {
        maxValue = candidate;
      }
    }
  });
  return maxValue;
}

function extractEpisodeNumberFromEpisodesDynamic(episodes: any): number | null {
  if (Array.isArray(episodes)) {
    return extractEpisodeNumberFromEpisodes(episodes);
  }
  if (typeof episodes === "string") {
    try {
      const decoded = JSON.parse(episodes);
      if (Array.isArray(decoded)) {
        return extractEpisodeNumberFromEpisodes(decoded);
      }
      if (decoded && typeof decoded === "object" && Array.isArray(decoded.data)) {
        return extractEpisodeNumberFromEpisodes(decoded.data);
      }
    } catch (_) {
      return null;
    }
  }
  if (episodes && typeof episodes === "object" && Array.isArray(episodes.data)) {
    return extractEpisodeNumberFromEpisodes(episodes.data);
  }
  return null;
}

function extractEpisodeNumberFromMap(data: any): number | null {
  if (!data || typeof data !== "object") {
    return null;
  }
  const keys = [
    "number",
    "ep",
    "episodio",
    "episode",
    "episode_number",
    "ep_number",
    "episode_num",
    "last_episode",
    "last_episode_number",
    "last_episode_num",
  ];
  for (const key of keys) {
    if (!(key in data)) {
      continue;
    }
    const value = (data as any)[key];
    if (value && typeof value === "object") {
      const nested = extractEpisodeNumber((value as any).number ?? (value as any).episode ?? (value as any).id);
      if (nested != null) {
        return nested;
      }
    }
    const candidate = extractEpisodeNumber(value);
    if (candidate != null) {
      return candidate;
    }
  }
  return null;
}

function buildEpisodeLabel(value: number | null | undefined): string | undefined {
  if (value == null) {
    return undefined;
  }
  return `Ep. ${value}`;
}

function extractLatestEpisodeLabel(item: any): string | undefined {
  let number = extractEpisodeNumberFromMap(item);
  if (number == null && item?.episode != null) {
    if (item.episode && typeof item.episode === "object") {
      number = extractEpisodeNumber((item.episode as any).number ?? (item.episode as any).episode ?? (item.episode as any).id);
    } else {
      number = extractEpisodeNumber(item.episode);
    }
  }
  if (number == null) {
    number = extractEpisodeNumberFromEpisodesDynamic(item?.episodes);
  }
  if (number == null && item?.anime && typeof item.anime === "object") {
    number = extractEpisodeNumberFromMap(item.anime);
    if (number == null) {
      number = extractEpisodeNumberFromEpisodesDynamic(item.anime.episodes);
    }
  }
  return buildEpisodeLabel(number);
}

function extractCalendarEpisodeLabel(item: any): string | undefined {
  let publishedCount = extractEpisodeNumberFromEpisodesDynamic(item?.episodes);
  if (publishedCount == null && Number.isFinite(item?.real_episodes_count)) {
    publishedCount = item.real_episodes_count;
  }
  if (publishedCount != null && publishedCount >= 0) {
    return `Ep. ${publishedCount + 1}`;
  }
  const fallback = item?.episodes_count ?? item?.episode_count;
  return buildEpisodeLabel(extractEpisodeNumber(fallback));
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
    timeout: 10000,
  });
  const $ = cheerio.load(res.data);
  const raw = $("layout-items").attr("items-json") || "";
  if (!raw) return [];
  const data = JSON.parse(raw);
  const items = data?.data || [];
  const posts: Post[] = [];
  items.forEach((item: any) => {
    const episodeLabel = extractLatestEpisodeLabel(item);
    const episodeId = item?.id;
    const post = toPost(item?.anime ?? item, { episodeLabel, episodeId });
    if (post) {
      posts.push(post);
    }
  });
  return posts;
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
  const params = new URLSearchParams();
  if (popular) {
    params.set("popular", "true");
  }
  if (page > 1) {
    params.set("page", String(page));
  }
  const url = `${BASE_HOST}/top-anime${
    params.toString() ? `?${params.toString()}` : ""
  }`;
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
      const day = normalizeCalendarDay(
        typeof data?.day === "string" ? data.day : undefined
      );
      const episodeLabel = extractCalendarEpisodeLabel(data);
      const post = toPost(data, { day, episodeLabel });
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
    withCredentials: true,
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
        timeout: 10000,
        withCredentials: true,
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
      withCredentials: true,
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
