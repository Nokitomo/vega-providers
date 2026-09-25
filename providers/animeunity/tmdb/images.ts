import { TmdbImageMetadata, TmdbImageSize } from "./types";

const TMDB_IMAGE_PATH_PATTERN = /\/([A-Za-z0-9_-]+\.(?:avif|jpe?g|png|svg|webp))(?:\?.*)?$/i;

export function normalizeTmdbImageUrl(
  value: unknown,
  size: TmdbImageSize = "original"
): string | undefined {
  const text = typeof value === "string" ? value.trim() : "";
  if (
    !/^https:\/\/(?:image\.tmdb\.org|media\.themoviedb\.org)\//i.test(text)
  ) {
    return undefined;
  }
  const match = text.match(TMDB_IMAGE_PATH_PATTERN);
  return match?.[1]
    ? `https://image.tmdb.org/t/p/${size}/${match[1]}`
    : undefined;
}

export function parseTmdbImageGallery(
  html: string,
  cheerio: any,
  type: TmdbImageMetadata["type"],
  fallbackLanguage: string
): TmdbImageMetadata[] {
  const $ = cheerio.load(html);
  return $("li.card[data-image-id]")
    .map((_: number, element: any) => {
      const card = $(element);
      const image = card.find(".image_content img, a.image img").first();
      const originalLink = card
        .find('a[href*="image.tmdb.org/t/p/original/"]')
        .first();
      const url = normalizeTmdbImageUrl(originalLink.attr("href"));
      if (!url) return null;

      const languageInput = card.find("input[data-language]").first();
      const language =
        String(languageInput.attr("data-language") || "").trim().toLowerCase() ||
        fallbackLanguage;
      const dimensionText = card
        .find('.meta a[href*="image.tmdb.org/t/p/original/"]')
        .first()
        .text()
        .trim();
      const dimensions = dimensionText.match(/(\d+)\s*x\s*(\d+)/i);
      const width = Number.parseInt(dimensions?.[1] || image.attr("width") || "", 10);
      const height = Number.parseInt(dimensions?.[2] || image.attr("height") || "", 10);
      const addedBy = card.find('.meta a[href^="/u/"]').first().text().trim();
      const formatText = card
        .find(".meta label")
        .filter((__: number, label: any) => /format/i.test($(label).text()))
        .first()
        .next("p")
        .text()
        .trim();

      return {
        id: String(card.attr("data-image-id") || "").trim() || undefined,
        type,
        url,
        previewUrl: normalizeTmdbImageUrl(image.attr("src")),
        language: language === "xx" ? "xx" : language,
        width: Number.isFinite(width) ? width : undefined,
        height: Number.isFinite(height) ? height : undefined,
        format:
          formatText || url.split(".").pop()?.toUpperCase() || undefined,
        primary: card.find(".primary_status.circle-check").length > 0,
        addedBy: addedBy || undefined,
      } as TmdbImageMetadata;
    })
    .get()
    .filter(Boolean) as TmdbImageMetadata[];
}

export function mergeTmdbImages(
  groups: TmdbImageMetadata[][],
  languagePriority: string[]
): TmdbImageMetadata[] {
  const byUrl = new Map<string, TmdbImageMetadata>();
  groups.flat().forEach((image) => {
    if (!byUrl.has(image.url)) byUrl.set(image.url, image);
  });
  const priority = languagePriority.map((locale) => locale.split("-")[0]);
  priority.push("xx");
  return Array.from(byUrl.values()).sort((left, right) => {
    const leftIndex = priority.indexOf(left.language);
    const rightIndex = priority.indexOf(right.language);
    const leftPriority = leftIndex >= 0 ? leftIndex : priority.length;
    const rightPriority = rightIndex >= 0 ? rightIndex : priority.length;
    // TMDB already exposes gallery entries in popularity order. The stable sort
    // only groups languages and deliberately preserves that order inside each
    // language instead of re-ranking by resolution or the primary flag.
    return leftPriority - rightPriority;
  });
}
