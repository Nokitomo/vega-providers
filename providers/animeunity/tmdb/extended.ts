import { normalizeTmdbImageUrl } from "./images";
import {
  TmdbEpisodeGroupMetadata,
  TmdbPersonCredit,
  TmdbTranslationMetadata,
  TmdbVideoMetadata,
  TmdbWatchProviderMetadata,
} from "./types";

function cleanText(value: unknown): string | undefined {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text && text !== "—" ? text : undefined;
}

function parseCount(value: unknown): number | undefined {
  const match = String(value ?? "").match(/\d+/);
  const parsed = Number.parseInt(match?.[0] || "", 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseCredit(element: any, $: any, department?: string): TmdbPersonCredit | null {
  const item = $(element);
  const personLink = item.find('p > a[href^="/person/"]').first();
  const name = cleanText(personLink.text());
  if (!name) return null;
  const id = personLink.attr("href")?.match(/\/person\/(\d+)/)?.[1];
  const roleNode = item.find("p.character, p.episode_count_crew").first();
  const jobs = roleNode
    .find("a")
    .map((_: number, link: any) => cleanText($(link).text()))
    .get()
    .filter(Boolean) as string[];
  return {
    id: id ? Number.parseInt(id, 10) : undefined,
    name,
    role: cleanText(roleNode.clone().find("span").remove().end().text()),
    department,
    jobs: jobs.length ? Array.from(new Set(jobs)) : undefined,
    episodeCount: parseCount(roleNode.find("span").first().text()),
    profile: normalizeTmdbImageUrl(item.find("img.profile").attr("src")),
  };
}

export function parseTmdbCreditsPage(
  html: string,
  cheerio: any
): { cast: TmdbPersonCredit[]; crew: TmdbPersonCredit[] } {
  const $ = cheerio.load(html);
  const cast = $("ol.people.credits:not(.crew) > li")
    .map((_: number, element: any) => parseCredit(element, $))
    .get()
    .filter(Boolean) as TmdbPersonCredit[];
  const crew: TmdbPersonCredit[] = [];
  $(".crew_wrapper").each((_: number, wrapper: any) => {
    const department = cleanText($(wrapper).find("h4").first().text());
    $(wrapper)
      .find("ol.people.crew > li")
      .each((__: number, element: any) => {
        const credit = parseCredit(element, $, department);
        if (credit) crew.push(credit);
      });
  });
  return { cast, crew };
}

export function parseTmdbTranslationsPage(
  html: string,
  cheerio: any
): TmdbTranslationMetadata[] {
  const $ = cheerio.load(html);
  return $("table.media-translations")
    .map((_: number, tableElement: any) => {
      const table = $(tableElement);
      const container = table.parent();
      const language = String(container.attr("id") || "").trim();
      if (!/^[a-z]{2,3}(?:-[A-Z]{2})?$/.test(language)) return null;
      const readRow = (label: RegExp) => {
        const row = table
          .find("tr")
          .filter((__: number, element: any) =>
            label.test(cleanText($(element).find("td").first().text()) || "")
          )
          .first();
        const valueCell = row.find("td").eq(1);
        const paragraphs = valueCell
          .find("p")
          .map((__: number, element: any) => cleanText($(element).text()))
          .get()
          .filter(Boolean);
        return paragraphs.length > 0
          ? paragraphs.join("\n\n")
          : cleanText(valueCell.text());
      };
      return {
        language,
        title: readRow(/^name$|^nome$/i),
        tagline: readRow(/tagline|slogan/i),
        overview: readRow(/overview|trama|descrizione/i),
      } as TmdbTranslationMetadata;
    })
    .get()
    .filter(Boolean) as TmdbTranslationMetadata[];
}

export function parseTmdbVideosPage(
  html: string,
  cheerio: any,
  locale: string
): TmdbVideoMetadata[] {
  const $ = cheerio.load(html);
  return $(".video.card")
    .map((_: number, element: any) => {
      const card = $(element);
      const player = card.find("a.play_trailer[data-id]").first();
      const key = String(player.attr("data-id") || "").trim();
      const site = String(player.attr("data-site") || "").trim();
      if (!key || !site) return null;
      const external = card.find('.info h2 a[href^="http"]').first();
      const style = String(card.find(".wrapper").first().attr("style") || "");
      return {
        id: String(card.attr("id") || "").trim() || undefined,
        key,
        site,
        name:
          cleanText(player.attr("data-title")) ||
          cleanText(external.text()) ||
          key,
        language: locale,
        type: cleanText(card.find("h3.sub").text())?.split("•")[0]?.trim(),
        details: cleanText(card.find("h3.sub").text()),
        url: String(external.attr("href") || "").trim() || undefined,
        thumbnail: style.match(/url\(['"]?([^)'\"]+)/i)?.[1],
        channel: cleanText(card.find(".info .bg h4 a").text()),
        restrictedRegions: card
          .find(".restricted_region")
          .map((__: number, region: any) => cleanText($(region).text()))
          .get()
          .filter(Boolean),
      } as TmdbVideoMetadata;
    })
    .get()
    .filter(Boolean) as TmdbVideoMetadata[];
}

export function mergeTmdbVideos(groups: TmdbVideoMetadata[][]): TmdbVideoMetadata[] {
  const videos = new Map<string, TmdbVideoMetadata>();
  groups.flat().forEach((video) => {
    const key = `${video.site.toLowerCase()}:${video.key}`;
    if (!videos.has(key)) videos.set(key, video);
  });
  return Array.from(videos.values());
}

export function parseTmdbWatchProvidersPage(
  html: string,
  cheerio: any,
  region = "IT"
): TmdbWatchProviderMetadata[] {
  const $ = cheerio.load(html);
  const providers = new Map<string, TmdbWatchProviderMetadata>();
  $("li.ott_filter_best_price").each((_: number, element: any) => {
    const item = $(element);
    const link = item.find('a[href^="http"]').first();
    const title = cleanText(link.attr("title"));
    const name = title?.match(/\bon\s+(.+)$/i)?.[1] || title;
    if (!name) return;
    const trackingUrl = String(link.attr("href") || "").trim();
    let url = trackingUrl || undefined;
    try {
      url = new URL(trackingUrl).searchParams.get("r") || trackingUrl;
    } catch (_) {
      // Keep the original external URL.
    }
    const monetizationType = String(
      item.find("span.wrapper").attr("class") || ""
    )
      .split(/\s+/)
      .find((value) => value !== "wrapper");
    const category = cleanText(item.closest(".ott_provider").find("h3").first().text());
    const quality = item.hasClass("ott_filter_hd")
      ? "HD"
      : item.hasClass("ott_filter_sd")
        ? "SD"
        : undefined;
    const metadata = {
      name,
      category,
      monetizationType,
      quality,
      logo: normalizeTmdbImageUrl(link.find("img").attr("src")),
      url,
      region,
    };
    const key = `${name}:${category || ""}:${monetizationType || ""}`;
    if (!providers.has(key)) providers.set(key, metadata);
  });
  return Array.from(providers.values());
}

export function parseTmdbEpisodeGroupsPage(
  html: string,
  cheerio: any,
  mediaId: number
): TmdbEpisodeGroupMetadata[] {
  const $ = cheerio.load(html);
  const groups = $(".season_wrapper > section.season")
    .map((_: number, element: any) => {
      const item = $(element);
      const link = item.find('a[href*="/episode_group/"]').first();
      const id = link.attr("href")?.match(/\/episode_group\/([^?]+)/)?.[1];
      const name = cleanText(link.clone().find("span").remove().end().text());
      if (!id || !name) return null;
      const counts = String(item.find("h3").text()).match(/\d+/g) || [];
      return {
        id,
        name,
        type: cleanText(link.find("span").text())?.replace(/[()]/g, ""),
        groupCount: counts[0] ? Number.parseInt(counts[0], 10) : undefined,
        episodeCount: counts[1] ? Number.parseInt(counts[1], 10) : undefined,
        overview: cleanText(item.find("p").text()),
        sourceUrl: `https://www.themoviedb.org/tv/${mediaId}/episode_group/${id}`,
      } as TmdbEpisodeGroupMetadata;
    })
    .get()
    .filter(Boolean) as TmdbEpisodeGroupMetadata[];
  return Array.from(new Map(groups.map((group) => [group.id, group])).values());
}
