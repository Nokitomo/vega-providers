import { normalizeTmdbImageUrl } from "./images";
import { TmdbPageMetadata, TmdbPersonCredit } from "./types";

function cleanText(value: unknown): string | undefined {
  const text = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return text || undefined;
}

function parsePositiveInt(value: unknown): number | undefined {
  const parsed = Number.parseInt(String(value ?? "").replace(/[^0-9]/g, ""), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function parseSchema($: any): Record<string, unknown> {
  for (const element of $('script[type="application/ld+json"]').toArray()) {
    const raw = String($(element).html() || "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .trim();
    try {
      const value = JSON.parse(raw) as Record<string, unknown>;
      if (value?.["@type"] === "TVSeries" || value?.["@type"] === "Movie") {
        return value;
      }
    } catch (_) {
      // Ignore unrelated or malformed JSON-LD blocks.
    }
  }
  return {};
}

function parseFacts($: any): Record<string, string> {
  const facts: Record<string, string> = {};
  $("section.facts.left_column p").each((_: number, element: any) => {
    const row = $(element);
    const label = cleanText(row.find("strong").first().text());
    if (!label) return;
    const valueNode = row.clone();
    valueNode.find("strong").remove();
    const value = cleanText(valueNode.text());
    if (value) facts[label] = value;
  });
  return facts;
}

function readFact(
  facts: Record<string, string>,
  labels: RegExp
): string | undefined {
  const entry = Object.entries(facts).find(([label]) => labels.test(label));
  return entry?.[1];
}

function parseCast($: any): TmdbPersonCredit[] {
  return $("section.top_billed .people.scroller .card")
    .map((_: number, element: any) => {
      const card = $(element);
      const personLink = card.find('a[href^="/person/"]').first();
      const personId = personLink.attr("href")?.match(/\/person\/(\d+)/)?.[1];
      const name = cleanText(card.find("p > a").first().text());
      if (!name) return null;
      const episodeCount = parsePositiveInt(card.find("p.episode_count").text());
      return {
        id: personId ? Number.parseInt(personId, 10) : undefined,
        name,
        role: cleanText(card.find("p.character").text()),
        episodeCount,
        profile: normalizeTmdbImageUrl(card.find("img.profile").attr("src")),
      } as TmdbPersonCredit;
    })
    .get()
    .filter(Boolean) as TmdbPersonCredit[];
}

function parseNetworks($: any): TmdbPageMetadata["networks"] {
  return $("section.facts ul.networks li")
    .map((_: number, element: any) => {
      const link = $(element).find("a").first();
      const href = String(link.attr("href") || "");
      const match = href.match(/\/network\/(\d+)-([^?]+)/);
      const slugName = match?.[2]
        ?.split("-")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
      const image = link.find("img").first();
      return {
        id: match?.[1] ? Number.parseInt(match[1], 10) : undefined,
        name:
          cleanText(image.attr("alt")) ||
          cleanText(link.attr("title")) ||
          slugName,
        logo: normalizeTmdbImageUrl(image.attr("src")),
        url: href ? `https://www.themoviedb.org${href}` : undefined,
      };
    })
    .get();
}

function parseSocialLinks($: any): Record<string, string> {
  const links: Record<string, string> = {};
  $("section.facts .social_links a[href]").each((_: number, element: any) => {
    const href = String($(element).attr("href") || "").trim();
    if (!/^https?:\/\//i.test(href)) return;
    let key = "homepage";
    if (/x\.com|twitter\.com/i.test(href)) key = "twitter";
    else if (/facebook\.com/i.test(href)) key = "facebook";
    else if (/instagram\.com/i.test(href)) key = "instagram";
    else if (/justwatch\.com/i.test(href)) key = "justwatch";
    links[key] = href;
  });
  return links;
}

function parseBackground(html: string): string | undefined {
  const match = html.match(
    /background-image:\s*url\(['"]?(https:\/\/media\.themoviedb\.org\/t\/p\/[^/'"\s]*multi_faces\/[^)'"\s]+)['"]?\)/i
  );
  return normalizeTmdbImageUrl(match?.[1]);
}

export function parseTmdbDetailsPage(
  html: string,
  cheerio: any,
  locale: string
): TmdbPageMetadata {
  const $ = cheerio.load(html);
  const schema = parseSchema($);
  const facts = parseFacts($);
  const rating = schema.aggregateRating as Record<string, unknown> | undefined;
  const countries = Array.isArray(schema.countryOfOrigin)
    ? schema.countryOfOrigin
        .map((country) =>
          cleanText((country as Record<string, unknown> | undefined)?.name)
        )
        .filter((country): country is string => !!country)
    : [];
  const genres = Array.isArray(schema.genre)
    ? schema.genre.map(cleanText).filter((genre): genre is string => !!genre)
    : $(".header .facts .genres a")
        .map((_: number, element: any) => cleanText($(element).text()))
        .get()
        .filter(Boolean);
  const contentScore = parsePositiveInt(
    $("section.content_score .content_score > div p").first().text()
  );

  return {
    locale,
    title:
      cleanText(schema.name) ||
      cleanText($("#original_header .title h2 a").first().text()),
    originalTitle: readFact(facts, /original name|nome originale/i),
    overview: cleanText(schema.description),
    tagline: cleanText($("#original_header .tagline").first().text()),
    originalLanguageName: readFact(
      facts,
      /original language|lingua originale/i
    ),
    startDate: cleanText(schema.startDate),
    endDate: cleanText(schema.endDate),
    releaseDate: cleanText(schema.datePublished),
    certification: cleanText(
      $("#original_header .facts .certification").first().text()
    ),
    status: readFact(facts, /^status$|^stato$/i),
    mediaType: readFact(facts, /^type$|^tipo$/i),
    rating: Number.isFinite(Number(rating?.ratingValue))
      ? Number(rating?.ratingValue)
      : undefined,
    ratingCount: parsePositiveInt(rating?.ratingCount),
    contentScore,
    numberOfEpisodes: parsePositiveInt(schema.numberOfEpisodes),
    genres,
    countries,
    facts,
    keywords: $("section.keywords li a")
      .map((_: number, element: any) => cleanText($(element).text()))
      .get()
      .filter(Boolean),
    networks: parseNetworks($),
    socialLinks: parseSocialLinks($),
    cast: parseCast($),
    poster:
      normalizeTmdbImageUrl(schema.image) ||
      normalizeTmdbImageUrl($(".poster_wrapper img.poster").attr("src")),
    background: parseBackground(html),
    schema,
  };
}
