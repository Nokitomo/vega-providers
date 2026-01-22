import { Post, ProviderContext } from "../types";
import {
  BASE_HOST,
  BASE_HOST_NO_WWW,
  DEFAULT_HEADERS,
  buildSessionHeaders,
  buildAnimeLink,
  decodeHtmlAttribute,
  getSession,
  normalizeImageUrl,
} from "./utils";

const PAGE_SIZE = 30;

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
