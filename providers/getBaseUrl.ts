import { PASTEBIN_PROVIDERS, PASTEBIN_URL } from "./baseUrlRegistry";

// 1 hour
const expireTime = 60 * 60 * 1000;

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
    return normalizeBaseUrl(config.fallback);
  } catch (_) {
    return normalizeBaseUrl(config.fallback);
  }
}

export const getBaseUrl = async (providerValue: string) => {
  try {
    let baseUrl = "";
    const cacheKey = "CacheBaseUrl" + providerValue;
    const timeKey = "baseUrlTime" + providerValue;

    // const cachedUrl = cacheStorageService.getString(cacheKey);
    // const cachedTime = cacheStorageService.getObject<number>(timeKey);

    // if (cachedUrl && cachedTime && Date.now() - cachedTime < expireTime) {
    //   baseUrl = cachedUrl;
    // } else {
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
    // cacheStorageService.setString(cacheKey, baseUrl);
    // cacheStorageService.setObject(timeKey, Date.now());
    // }
    return baseUrl;
  } catch (error) {
    console.error(`Error fetching baseUrl: ${providerValue}`, error);
    return "";
  }
};
