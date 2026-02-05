import { ProviderContext } from "../types";

export const DEFAULT_BASE_URL = "https://streamingunity.tv";
export const DEFAULT_LOCALE = "it";
export const REQUEST_TIMEOUT = 15000;

export const normalizeBaseUrl = (value: string): string =>
  value.replace(/\/+$/, "");

export const resolveBaseUrl = async (
  providerContext: ProviderContext
): Promise<string> => {
  try {
    const resolved = await providerContext.getBaseUrl("streamingunity");
    if (resolved) {
      return normalizeBaseUrl(resolved);
    }
  } catch (_) {
    // ignore and fall back to default
  }
  return DEFAULT_BASE_URL;
};

const withLeadingSlash = (value: string): string =>
  value.startsWith("/") ? value : `/${value}`;

export const buildLocalePath = (path: string): string => {
  const normalized = path ? withLeadingSlash(path.trim()) : "";
  if (!normalized || normalized === "/") {
    return `/${DEFAULT_LOCALE}`;
  }
  if (normalized.startsWith(`/${DEFAULT_LOCALE}/`) || normalized === `/${DEFAULT_LOCALE}`) {
    return normalized;
  }
  return `/${DEFAULT_LOCALE}${normalized}`;
};

export const resolveUrl = (href: string, baseUrl: string): string => {
  if (!href) return "";
  if (/^https?:\/\//i.test(href)) return href;
  return new URL(href, baseUrl).href;
};

export const buildLocaleUrl = (path: string, baseUrl: string): string =>
  resolveUrl(buildLocalePath(path), baseUrl);

export const decodeHtmlEntities = (value: string): string =>
  value
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

export const extractInertiaPage = (
  html: string,
  cheerio: ProviderContext["cheerio"]
): { props?: any } | null => {
  if (!html) return null;
  const $ = cheerio.load(html);
  const raw =
    $("#app[data-page]").first().attr("data-page") ||
    $("div[data-page]").first().attr("data-page") ||
    "";
  if (!raw) return null;

  const decoded = decodeHtmlEntities(raw);
  try {
    return JSON.parse(decoded);
  } catch (_) {
    try {
      return JSON.parse(decodeHtmlEntities(decoded));
    } catch (err) {
      console.error("streamingunity data-page parse error", err);
      return null;
    }
  }
};

export const getTranslationValue = (
  translations: any[] | undefined,
  key: string,
  locale: string = DEFAULT_LOCALE
): string => {
  if (!Array.isArray(translations)) return "";
  const match = translations.find(
    (item) => item && item.key === key && item.locale === locale
  );
  return match?.value ? String(match.value).trim() : "";
};

export const resolveTitleName = (
  title: any,
  locale: string = DEFAULT_LOCALE
): string => {
  const translated = getTranslationValue(title?.translations, "name", locale);
  const fallback = title?.name || title?.original_name || "";
  return translated || String(fallback || "").trim();
};

export const resolveTitleSlug = (
  title: any,
  locale: string = DEFAULT_LOCALE
): string => {
  const translated = getTranslationValue(title?.translations, "slug", locale);
  return translated || String(title?.slug || "").trim();
};

export const buildImageUrl = (image: any, cdnUrl: string): string => {
  if (!image) return "";
  const raw =
    image.original_url_field || image.url || image.src || image.path || image.filename || "";
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  const normalizedCdn = cdnUrl ? cdnUrl.replace(/\/+$/, "") : "";
  if (!normalizedCdn) return raw;
  return `${normalizedCdn}/images/${String(raw).replace(/^\/+/, "")}`;
};

export const pickImageByType = (
  images: any[] | undefined,
  cdnUrl: string,
  types: string[],
  locale: string = DEFAULT_LOCALE
): string => {
  if (!Array.isArray(images) || images.length === 0) return "";
  const normalizedTypes = types.map((type) => type.toLowerCase());

  for (const type of normalizedTypes) {
    const matches = images.filter(
      (img) => String(img?.type || "").toLowerCase() === type
    );
    if (matches.length === 0) continue;
    const localized = matches.find(
      (img) => String(img?.lang || "").toLowerCase() === locale
    );
    const fallback = localized || matches.find((img) => !img?.lang) || matches[0];
    const url = buildImageUrl(fallback, cdnUrl);
    if (url) return url;
  }

  const fallback = images[0];
  return buildImageUrl(fallback, cdnUrl);
};

export const extractTitleId = (value: string): string => {
  if (!value) return "";
  const cleaned = value.split("::")[0];
  const match = cleaned.match(/\/(?:titles|watch)\/(\d+)/i) ||
    cleaned.match(/^(\d+)$/);
  return match?.[1] || "";
};

export const buildTitleUrl = (
  titleId: string | number,
  slug: string,
  baseUrl: string
): string => {
  const id = String(titleId || "").trim();
  if (!id) return "";
  const safeSlug = slug ? `-${slug}` : "";
  return buildLocaleUrl(`/titles/${id}${safeSlug}`, baseUrl);
};

export const normalizeText = (value: string): string =>
  String(value || "")
    .replace(/\s+/g, " ")
    .trim();
