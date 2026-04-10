import { ProviderContext } from "../../types";
import { DEFAULT_BASE_URL } from "./constants";

export const normalizeBaseUrl = (value: string): string =>
  value.replace(/\/+$/, "");

export const resolveBaseUrl = async (
  providerContext: ProviderContext
): Promise<string> => {
  try {
    const resolved = await providerContext.getBaseUrl("altadefinizionez");
    if (resolved) {
      return normalizeBaseUrl(resolved);
    }
  } catch (_) {
    // ignore and fall back to default
  }
  return DEFAULT_BASE_URL;
};

export const resolveUrl = (href: string, baseUrl: string): string => {
  if (!href) return "";
  if (/^https?:\/\//i.test(href)) return href;
  return new URL(href, baseUrl).href;
};

export const normalizeStreamLink = (href: string, baseUrl: string): string => {
  if (!href) return "";
  if (href.startsWith("//")) return `https:${href}`;
  if (/^https?:\/\//i.test(href)) return href;
  return new URL(href, baseUrl).href;
};

export const normalizeMirrorUrl = (href: string): string => {
  if (!href) return "";
  try {
    const url = new URL(href);
    const host = url.hostname.toLowerCase();

    if (host === "dropload.tv" || host.endsWith(".dropload.tv")) {
      url.hostname = "dr0pstream.com";
    }

    if (
      url.hostname.toLowerCase() === "dr0pstream.com" &&
      /^\/embed-([a-z0-9]+)\.html$/i.test(url.pathname)
    ) {
      const match = url.pathname.match(/^\/embed-([a-z0-9]+)\.html$/i);
      if (match?.[1]) {
        url.pathname = `/g/${match[1]}`;
        url.search = "";
      }
    }

    return url.toString();
  } catch (_) {
    return href;
  }
};

export const resolveMediaUrl = (href: string, baseUrl: string): string => {
  if (!href) return "";
  if (href.startsWith("//")) return `https:${href}`;
  if (/^https?:\/\//i.test(href)) return href;
  return new URL(href, baseUrl).href;
};

export const decodeHtmlEntities = (value: string): string =>
  value.replace(/&amp;/g, "&");

export const normalizeUrlValue = (value: string): string =>
  decodeHtmlEntities(value.replace(/\\\//g, "/")).trim();

export const safeDecodeUrlComponent = (value: string): string => {
  try {
    return decodeURIComponent(value.replace(/\+/g, " "));
  } catch (_) {
    return value;
  }
};

export const extractQueryParamsFromUrl = (
  url: string
): Record<string, string> => {
  const params: Record<string, string> = {};
  if (!url) return params;
  const queryStart = url.indexOf("?");
  if (queryStart === -1) return params;
  const hashStart = url.indexOf("#", queryStart);
  const queryString =
    hashStart === -1
      ? url.slice(queryStart + 1)
      : url.slice(queryStart + 1, hashStart);
  if (!queryString) return params;
  for (const part of queryString.split("&")) {
    if (!part) continue;
    const [rawKey, rawValue = ""] = part.split("=");
    if (!rawKey) continue;
    const key = safeDecodeUrlComponent(rawKey);
    if (!key) continue;
    const value = safeDecodeUrlComponent(rawValue);
    params[key] = value;
  }
  return params;
};

export const appendQueryParams = (
  url: string,
  params: Record<string, string>
): string => {
  const normalized = normalizeUrlValue(url);
  if (!normalized) return normalized;
  const [baseWithQuery, hashPart] = normalized.split("#", 2);
  const base = baseWithQuery.split("?")[0];
  const existing = extractQueryParamsFromUrl(baseWithQuery);
  const merged: Record<string, string> = { ...existing };
  for (const [key, value] of Object.entries(params)) {
    if (value && !Object.prototype.hasOwnProperty.call(merged, key)) {
      merged[key] = value;
    }
  }
  const query = Object.entries(merged)
    .map(
      ([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`
    )
    .join("&");
  const rebuilt = query ? `${base}?${query}` : base;
  return hashPart ? `${rebuilt}#${hashPart}` : rebuilt;
};
