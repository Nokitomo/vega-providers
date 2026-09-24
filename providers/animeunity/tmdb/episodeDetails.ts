import { normalizeTmdbImageUrl } from "./images";
import { TmdbEpisodeMetadata, TmdbPersonCredit } from "./types";

function cleanText(value: unknown): string | undefined {
  const text = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return text || undefined;
}

function parsePeople(container: any, $: any): TmdbPersonCredit[] {
  return container
    .find('a[href^="/person/"]')
    .map((_: number, element: any) => {
      const link = $(element);
      const name = cleanText(link.text());
      if (!name) return null;
      const id = link.attr("href")?.match(/\/person\/(\d+)/)?.[1];
      return {
        id: id ? Number.parseInt(id, 10) : undefined,
        name,
      };
    })
    .get()
    .filter(Boolean) as TmdbPersonCredit[];
}

export function parseTmdbExpandedEpisode(
  html: string,
  cheerio: any
): Pick<TmdbEpisodeMetadata, "directors" | "writers" | "guestStars" | "stills"> {
  const $ = cheerio.load(html);
  const crewRows = $(".expanded_info .crew p").toArray();
  const directors = crewRows[0] ? parsePeople($(crewRows[0]), $) : [];
  const writers = crewRows[1] ? parsePeople($(crewRows[1]), $) : [];
  const guestStars = parsePeople($(".expanded_info .guest_stars"), $);
  const stills = $(".episode_images img")
    .map((_: number, element: any) => {
      const url = normalizeTmdbImageUrl($(element).attr("src"));
      return url
        ? {
            type: "still" as const,
            url,
            previewUrl: url,
            language: "xx",
          }
        : null;
    })
    .get()
    .filter(Boolean);
  return { directors, writers, guestStars, stills };
}
