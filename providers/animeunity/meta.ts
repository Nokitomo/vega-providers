import { Info, Link, ProviderContext } from "../types";

const BASE_HOST = "https://www.animeunity.so";
const DEFAULT_HEADERS: Record<string, string> = {
  Accept: "application/json",
  "User-Agent":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
};

function decodeHtmlAttribute(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
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

function extractAnimeId(link: string): number | null {
  if (!link) return null;
  const direct = parseInt(link, 10);
  if (Number.isFinite(direct)) {
    return direct;
  }
  const match = link.match(/\/anime\/(\d+)/);
  if (match?.[1]) {
    const parsed = parseInt(match[1], 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function parseAnimeFromHtml(html: string, cheerio: ProviderContext["cheerio"]) {
  const $ = cheerio.load(html);
  let raw =
    $("video-player").attr("anime") ||
    $("[anime]").first().attr("anime") ||
    "";
  if (!raw) {
    const match = html.match(/anime="([^"]+)"/);
    raw = match?.[1] || "";
  }
  if (!raw) return null;
  try {
    return JSON.parse(decodeHtmlAttribute(raw));
  } catch (_) {
    return null;
  }
}

export const getMeta = async function ({
  link,
  providerContext,
}: {
  link: string;
  providerContext: ProviderContext;
}): Promise<Info> {
  try {
    const { axios, cheerio } = providerContext;
    const animeId = extractAnimeId(link);
    if (!animeId) {
      throw new Error("Invalid anime id");
    }

    const infoRes = await axios.get(`${BASE_HOST}/info_api/${animeId}/`, {
      headers: DEFAULT_HEADERS,
      timeout: 15000,
    });
    const info = infoRes.data || {};
    const title =
      info?.title_eng || info?.title || info?.title_it || "Unknown";
    const synopsis = (info?.plot || "").toString();
    const image = normalizeImageUrl(info?.imageurl || info?.cover);
    let background = normalizeImageUrl(info?.imageurl_cover || info?.cover);

    if (!background) {
      try {
        const htmlRes = await axios.get(
          `${BASE_HOST}/anime/${animeId}-${info?.slug || ""}`,
          { headers: DEFAULT_HEADERS, timeout: 15000 }
        );
        const anime = parseAnimeFromHtml(htmlRes.data, cheerio);
        if (anime?.imageurl_cover) {
          background = normalizeImageUrl(anime.imageurl_cover);
        }
      } catch (_) {
        // ignore fallback errors
      }
    }

    const tags =
      info?.genres?.map((genre: any) => genre?.name).filter(Boolean) || [];

    const isMovie =
      typeof info?.type === "string" &&
      info.type.toLowerCase().includes("movie");

    const linkList: Link[] = [
      {
        title,
        episodesLink: String(animeId),
      },
    ];

    return {
      title,
      synopsis,
      image: background || image,
      imdbId: "",
      type: isMovie ? "movie" : "series",
      tags,
      linkList,
    };
  } catch (err) {
    console.error("animeunity meta error", err);
    return {
      title: "",
      synopsis: "",
      image: "",
      imdbId: "",
      type: "series",
      linkList: [],
    };
  }
};
