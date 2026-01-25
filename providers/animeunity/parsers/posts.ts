import { Post, ProviderContext } from "../../types";
import { buildAnimeLink, decodeHtmlAttribute, normalizeImageUrl } from "../utils";

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

export function normalizeCalendarDay(value?: string): string | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;
  return CALENDAR_DAY_MAP[normalized] || value;
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

export function toPost(
  anime: any,
  baseHost: string,
  extra?: Partial<Post>
): Post | null {
  const id = anime?.id;
  const slug = anime?.slug;
  const title = pickTitle(anime);
  const image = normalizeImageUrl(anime?.imageurl || anime?.imageUrl);
  const link = buildAnimeLink(baseHost, id, slug);
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
      const raw =
        (episode as any).number ??
        (episode as any).episode ??
        (episode as any).id;
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
      const nested = extractEpisodeNumber(
        (value as any).number ?? (value as any).episode ?? (value as any).id
      );
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

export function extractLatestEpisodeLabel(item: any): string | undefined {
  let number = extractEpisodeNumberFromMap(item);
  if (number == null && item?.episode != null) {
    if (item.episode && typeof item.episode === "object") {
      number = extractEpisodeNumber(
        (item.episode as any).number ??
          (item.episode as any).episode ??
          (item.episode as any).id
      );
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

export function extractCalendarEpisodeLabel(item: any): string | undefined {
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

export function parseLatestPostsFromHtml(
  html: string,
  cheerio: ProviderContext["cheerio"],
  baseHost: string
): Post[] {
  const $ = cheerio.load(html);
  const raw = $("layout-items").attr("items-json") || "";
  if (!raw) return [];
  const data = JSON.parse(raw);
  const items = data?.data || [];
  const posts: Post[] = [];
  items.forEach((item: any) => {
    const episodeLabel = extractLatestEpisodeLabel(item);
    const episodeId = item?.id;
    const post = toPost(item?.anime ?? item, baseHost, {
      episodeLabel,
      episodeId,
    });
    if (post) {
      posts.push(post);
    }
  });
  return posts;
}

export function parseTopPostsFromHtml(
  html: string,
  cheerio: ProviderContext["cheerio"],
  baseHost: string
): Post[] {
  const rawFromHtml =
    html.match(/<top-anime[^>]*animes="([\s\S]*?)"\s*><\/top-anime>/i)?.[1] ||
    "";
  const $ = cheerio.load(html);
  const raw = rawFromHtml || $("top-anime").attr("animes") || "";
  if (!raw) return [];
  let data: any | null = null;
  let candidate = raw;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      data = JSON.parse(candidate);
      break;
    } catch (_) {
      candidate = decodeHtmlAttribute(candidate);
    }
  }
  if (!data) {
    return [];
  }
  const items = data?.data || [];
  const posts: Post[] = [];
  items.forEach((item: any) => {
    const post = toPost(item, baseHost);
    if (post) {
      posts.push(post);
    }
  });
  return posts;
}

export function parseCalendarPostsFromHtml(
  html: string,
  cheerio: ProviderContext["cheerio"],
  baseHost: string
): Post[] {
  const $ = cheerio.load(html);
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
      const post = toPost(data, baseHost, { day, episodeLabel });
      if (post) {
        posts.push(post);
      }
    } catch (_) {
      return;
    }
  });
  return posts;
}

export function parseArchiveRecords(records: any[], baseHost: string): Post[] {
  const posts: Post[] = [];
  records.forEach((item: any) => {
    const post = toPost(item, baseHost);
    if (post) {
      posts.push(post);
    }
  });
  return posts;
}
