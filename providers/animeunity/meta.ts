import { Info, Link, ProviderContext } from "../types";
import {
  BASE_HOST,
  DEFAULT_HEADERS,
  buildAnimeLink,
  decodeHtmlAttribute,
  normalizeImageUrl,
} from "./utils";

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
    const url = link.startsWith("http") ? link : `${BASE_HOST}/anime/${link}`;
    const res = await axios.get(url, {
      headers: DEFAULT_HEADERS,
      timeout: 15000,
    });
    const anime = parseAnimeFromHtml(res.data, cheerio);
    if (!anime) {
      throw new Error("Anime payload not found");
    }

    const title =
      anime?.title_eng || anime?.title || anime?.title_it || "Unknown";
    const synopsis = (anime?.plot || "").toString();
    const image = normalizeImageUrl(anime?.imageurl);
    const tags = [
      anime?.type,
      anime?.status,
      anime?.season,
      anime?.date ? String(anime.date) : "",
    ].filter(Boolean);

    const isMovie =
      typeof anime?.type === "string" &&
      anime.type.toLowerCase().includes("movie");

    const linkList: Link[] = [];
    if (anime?.id) {
      linkList.push({
        title: title,
        episodesLink: String(anime.id),
      });
    } else if (anime?.slug && anime?.id) {
      linkList.push({
        title: title,
        episodesLink: buildAnimeLink(anime.id, anime.slug),
      });
    }

    return {
      title,
      synopsis,
      image,
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
