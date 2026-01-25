export const DEFAULT_BASE_HOST = "https://www.animeunity.so";
export const DEFAULT_BASE_HOST_NO_WWW = "https://animeunity.so";

export const DEFAULT_HEADERS: Record<string, string> = {
  Accept: "application/json",
  "User-Agent":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
};

export const STREAM_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
};

export const TIMEOUTS = {
  SHORT: 10000,
  LONG: 15000,
  RELATED: 60000,
};
