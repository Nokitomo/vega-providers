import { ProviderContext } from "../types";

const BASE_HOST = "https://www.animeunity.so";
const BASE_HOST_NO_WWW = "https://animeunity.so";

const DEFAULT_HEADERS: Record<string, string> = {
  Accept: "application/json",
  "User-Agent":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
};

type AnimeunitySession = {
  xsrfToken?: string;
  session?: string;
};

function decodeHtmlAttribute(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function extractCookieValue(raw: string, name: string): string | undefined {
  const match = new RegExp(`${name}=([^;]+)`).exec(raw);
  return match?.[1];
}

async function getSession(
  axios: ProviderContext["axios"]
): Promise<AnimeunitySession> {
  try {
    const response = await axios.get(`${BASE_HOST}/`, {
      headers: DEFAULT_HEADERS,
      timeout: 10000,
    });
    const raw = response.headers?.["set-cookie"];
    const cookieHeader = Array.isArray(raw) ? raw.join("; ") : raw || "";
    if (!cookieHeader) {
      return {};
    }
    const xsrf = extractCookieValue(cookieHeader, "XSRF-TOKEN");
    const session = extractCookieValue(cookieHeader, "animeunity_session");
    return {
      xsrfToken: xsrf ? decodeURIComponent(xsrf) : undefined,
      session,
    };
  } catch (_) {
    return {};
  }
}

function buildSessionHeaders(session: AnimeunitySession): Record<string, string> {
  const headers: Record<string, string> = {
    ...DEFAULT_HEADERS,
    Origin: BASE_HOST,
    Referer: `${BASE_HOST}/`,
  };
  if (session.xsrfToken) {
    headers["X-XSRF-TOKEN"] = session.xsrfToken;
  }
  const parts: string[] = [];
  if (session.xsrfToken) {
    parts.push(`XSRF-TOKEN=${session.xsrfToken}`);
  }
  if (session.session) {
    parts.push(`animeunity_session=${session.session}`);
  }
  if (parts.length > 0) {
    headers["Cookie"] = parts.join("; ");
  }
  return headers;
}

function normalizeImageUrl(url?: string): string {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (host.includes("animeworld.so") || host.includes("forbiddenlol.cloud")) {
      const filename = parsed.pathname.split("/").pop() || "";
      if (filename) {
        return `https://img.animeunity.so/anime/${filename}`;
      }
    }
  } catch (_) {
    return url;
  }
  return url;
}

function buildAnimeLink(id?: number | string, slug?: string): string {
  if (!id) return "";
  if (!slug) {
    return `${BASE_HOST}/anime/${id}`;
  }
  return `${BASE_HOST}/anime/${id}-${slug}`;
}

export {
  BASE_HOST,
  BASE_HOST_NO_WWW,
  DEFAULT_HEADERS,
  decodeHtmlAttribute,
  getSession,
  buildSessionHeaders,
  normalizeImageUrl,
  buildAnimeLink,
};
