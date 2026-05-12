import { PASTEBIN_PROVIDERS, PASTEBIN_URL } from "./baseUrlRegistry";

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
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
    let baseUrl = "";
    const pastebinUrl = await getPastebinBaseUrl(providerValue);
    if (pastebinUrl) {
      baseUrl = pastebinUrl;
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
