export type StreamCenterSource = "animeunity" | "streamingunity";
export type StreamCenterRouteKind = "filter" | "meta" | "episodes" | "stream";

export type StreamCenterRoute<T = unknown> = {
  kind: StreamCenterRouteKind;
  source: StreamCenterSource;
  data: T;
};

const ROUTE_PREFIX = "streamcenter:v1";

export const encodeRoute = <T>(
  kind: StreamCenterRouteKind,
  source: StreamCenterSource,
  data: T
): string =>
  `${ROUTE_PREFIX}:${kind}:${source}:${encodeURIComponent(JSON.stringify(data))}`;

export const decodeRoute = <T = unknown>(
  value: string,
  expectedKind?: StreamCenterRouteKind
): StreamCenterRoute<T> | null => {
  const raw = String(value || "");
  const prefix = `${ROUTE_PREFIX}:`;
  if (!raw.startsWith(prefix)) return null;

  const remainder = raw.slice(prefix.length);
  const firstSeparator = remainder.indexOf(":");
  const secondSeparator = remainder.indexOf(":", firstSeparator + 1);
  if (firstSeparator <= 0 || secondSeparator <= firstSeparator) return null;

  const kind = remainder.slice(0, firstSeparator) as StreamCenterRouteKind;
  const source = remainder.slice(
    firstSeparator + 1,
    secondSeparator
  ) as StreamCenterSource;
  if (
    !["filter", "meta", "episodes", "stream"].includes(kind) ||
    !["animeunity", "streamingunity"].includes(source) ||
    (expectedKind && kind !== expectedKind)
  ) {
    return null;
  }

  try {
    return {
      kind,
      source,
      data: JSON.parse(decodeURIComponent(remainder.slice(secondSeparator + 1))) as T,
    };
  } catch (_) {
    return null;
  }
};

export const resolveMetaRoute = (
  value: string
): StreamCenterRoute<{ url: string }> | null => {
  const legacyRoute = decodeRoute<{ url: string }>(value, "meta");
  if (legacyRoute?.data?.url) return legacyRoute;

  const raw = String(value || "").trim();
  if (!/^https?:\/\//i.test(raw)) return null;

  try {
    const hostname = new URL(raw).hostname.toLowerCase();
    const source: StreamCenterSource | null = /(?:^|\.)animeunity\./i.test(
      hostname
    )
      ? "animeunity"
      : /(?:^|\.)streamingunity\./i.test(hostname)
        ? "streamingunity"
        : null;
    return source
      ? { kind: "meta", source, data: { url: raw } }
      : null;
  } catch (_) {
    return null;
  }
};

export const encodeFilterRoute = (
  source: StreamCenterSource,
  filter: string
): string => encodeRoute("filter", source, { url: filter });
