import { PASTEBIN_PROVIDERS, PASTEBIN_URL } from "./baseUrlRegistry";

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

const ANIMEUNITY_HOST = /^(?:[a-z0-9-]+\.)*animeunity\.[a-z]{2,}$/i;
const REDIRECT_CACHE_MS = 60 * 60 * 1000;
let animeUnityResolved: { url: string; expiresAt: number } | null = null;

async function resolveAnimeUnityBaseUrl(value: string): Promise<string> {
  let candidate: URL;
  try {
    candidate = new URL(value);
  } catch (_) {
    return "";
  }
  if (candidate.protocol !== "https:" || !ANIMEUNITY_HOST.test(candidate.hostname)) {
    return "";
  }
  try {
    // Probe the root: redirects from info_api and embed-url lose their paths.
    const response = await fetch(`${candidate.origin}/`);
    const finalUrl = new URL(response.url || candidate.origin);
    if (finalUrl.protocol !== "https:" || !ANIMEUNITY_HOST.test(finalUrl.hostname)) {
      return "";
    }
    return finalUrl.origin;
  } catch (_) {
    return "";
  }
}

async function getPastebinBaseUrl(
  providerValue: string
): Promise<string | null> {
  const config = PASTEBIN_PROVIDERS[providerValue];
  if (!config) {
    return null;
  }
  try {
    const res = await fetch(PASTEBIN_URL);
    const text = await res.text();
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    for (const line of lines) {
      try {
        const host = new URL(line).hostname;
        if (config.match.test(host)) {
          return normalizeBaseUrl(line);
        }
      } catch (_) {
        continue;
      }
    }
    return config.fallback ? normalizeBaseUrl(config.fallback) : null;
  } catch (_) {
    return config.fallback ? normalizeBaseUrl(config.fallback) : null;
  }
}

export const getBaseUrl = async (providerValue: string) => {
  try {
    if (
      providerValue === "animeunity" &&
      animeUnityResolved &&
      animeUnityResolved.expiresAt > Date.now()
    ) {
      return animeUnityResolved.url;
    }
    let baseUrl = "";
    const pastebinUrl = await getPastebinBaseUrl(providerValue);
    if (pastebinUrl) {
      baseUrl = providerValue === "animeunity"
        ? await resolveAnimeUnityBaseUrl(pastebinUrl)
        : pastebinUrl;
      if (!baseUrl && providerValue === "animeunity") {
        baseUrl = await resolveAnimeUnityBaseUrl(
          PASTEBIN_PROVIDERS.animeunity.fallback || ""
        );
      }
      if (
        providerValue === "animeunity" &&
        baseUrl
      ) {
        animeUnityResolved = {
          url: baseUrl,
          expiresAt: Date.now() + REDIRECT_CACHE_MS,
        };
      }
      return baseUrl;
    }
    const baseUrlRes = await fetch(
      "https://himanshu8443.github.io/providers/modflix.json"
    );
    const baseUrlData = await baseUrlRes.json();
    baseUrl = baseUrlData[providerValue].url;
    return baseUrl;
  } catch (error) {
    console.error(`Error fetching baseUrl: ${providerValue}`, error);
    return "";
  }
};
