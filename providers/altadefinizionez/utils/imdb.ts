import { ProviderContext } from "../../types";

const extractImdbIdFromValue = (value: string): string => {
  if (!value) return "";
  const match = value.match(/tt\d{6,9}/i);
  return match ? match[0] : "";
};

export const extractImdbIdFromHtml = (
  html: string,
  cheerio: ProviderContext["cheerio"]
): string => {
  const direct = extractImdbIdFromValue(html);
  if (direct) return direct;

  const $ = cheerio.load(html || "");
  const iframeAttrCandidates = [
    "src",
    "data-src",
    "data-lazy-src",
    "data-original",
    "data-embed",
    "data-url",
  ];
  let found = "";

  $("iframe").each((_index, element) => {
    const node = $(element);
    for (const attr of iframeAttrCandidates) {
      found = extractImdbIdFromValue(node.attr(attr) || "");
      if (found) {
        return false;
      }
    }
  });

  if (found) return found;

  const dataImdbNode = $("[data-imdb], [data-imdb-id], [data-id-imdb]").first();
  if (dataImdbNode.length) {
    const dataAttrs = ["data-imdb", "data-imdb-id", "data-id-imdb"];
    for (const attr of dataAttrs) {
      found = extractImdbIdFromValue(dataImdbNode.attr(attr) || "");
      if (found) return found;
    }
  }

  const imdbLink = $('a[href*="imdb.com/title/"]').attr("href");
  found = extractImdbIdFromValue(imdbLink || "");
  return found;
};
