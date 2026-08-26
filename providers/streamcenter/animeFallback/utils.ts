const DIACRITICS = /[\u0300-\u036f]/g;

export const normalizeTitle = (title: string): string =>
  String(title || "")
    .normalize("NFD")
    .replace(DIACRITICS, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/\([^)]*\)/g, " ")
    .replace(
      /\b(movie|the movie|ita|sub ita|subita|tv|ona|ova|special|season|stagione)\b/g,
      " "
    )
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const editDistance = (
  first: string,
  second: string,
  maxDistance: number
): number => {
  if (Math.abs(first.length - second.length) > maxDistance) {
    return maxDistance + 1;
  }
  let previous = Array.from({ length: second.length + 1 }, (_, index) => index);
  let current = new Array<number>(second.length + 1).fill(0);
  for (let firstIndex = 0; firstIndex < first.length; firstIndex += 1) {
    current[0] = firstIndex + 1;
    let rowMinimum = current[0];
    for (let secondIndex = 0; secondIndex < second.length; secondIndex += 1) {
      current[secondIndex + 1] = Math.min(
        previous[secondIndex + 1] + 1,
        current[secondIndex] + 1,
        previous[secondIndex] +
          (first[firstIndex] === second[secondIndex] ? 0 : 1)
      );
      rowMinimum = Math.min(rowMinimum, current[secondIndex + 1]);
    }
    if (rowMinimum > maxDistance) return maxDistance + 1;
    [previous, current] = [current, previous];
  }
  return previous[second.length];
};

const isTypoMatch = (queryToken: string, titleToken: string): boolean => {
  if (queryToken.length < 4 || titleToken.length < 4) return false;
  const maximum = Math.min(queryToken.length, titleToken.length) <= 5 ? 1 : 2;
  return editDistance(queryToken, titleToken, maximum) <= maximum;
};

export const titleScore = (title: string, query: string): number => {
  const normalizedTitle = normalizeTitle(title);
  const normalizedQuery = normalizeTitle(query);
  if (!normalizedTitle || !normalizedQuery) return 0;
  if (normalizedTitle === normalizedQuery) return 160;
  if (normalizedTitle.startsWith(`${normalizedQuery} `)) return 140;
  if (` ${normalizedTitle} `.includes(` ${normalizedQuery} `)) return 120;
  if (` ${normalizedQuery} `.includes(` ${normalizedTitle} `)) return 110;

  const titleTokens = new Set(normalizedTitle.split(" ").filter((item) => item.length >= 2));
  const queryTokens = normalizedQuery.split(" ").filter((item) => item.length >= 2);
  if (titleTokens.size === 0 || queryTokens.length === 0) return 0;
  const exact = queryTokens.filter((item) => titleTokens.has(item)).length;
  const typo = queryTokens.filter(
    (item) =>
      !titleTokens.has(item) &&
      Array.from(titleTokens).some((candidate) => isTypoMatch(item, candidate))
  ).length;
  const matched = exact + typo;
  const required =
    queryTokens.length === 1
      ? 1
      : queryTokens.length === 2
        ? 2
        : Math.floor((queryTokens.length * 2 + 2) / 3);
  if (matched < required) return 0;
  const base =
    matched === queryTokens.length && titleTokens.size === queryTokens.length
      ? 105
      : matched === queryTokens.length
        ? 95
        : 75;
  const moviePenalty =
    /\bmovie\b/i.test(title) && !/\bmovie\b/i.test(query) ? 15 : 0;
  return Math.max(0, base + exact * 4 - typo * 3 - moviePenalty);
};

export const normalizeEpisodeNumber = (value: unknown): string | null => {
  const raw = String(value ?? "").trim().replace(",", ".");
  if (!raw) return null;
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed)) return null;
  return Number.isInteger(parsed) ? String(parsed) : String(parsed);
};

export const absoluteUrl = (baseUrl: string, value: string): string => {
  try {
    return new URL(String(value || "").trim(), `${baseUrl.replace(/\/+$/, "")}/`).toString();
  } catch (_) {
    return "";
  }
};

export const extractNumericId = (value: string, pattern: RegExp): number | undefined => {
  const match = String(value || "").match(pattern);
  const parsed = Number(match?.[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

export const mapWithConcurrency = async <T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>
): Promise<R[]> => {
  const output = new Array<R>(values.length);
  let cursor = 0;
  const workers = Array.from(
    { length: Math.max(1, Math.min(concurrency, values.length)) },
    async () => {
      while (cursor < values.length) {
        const index = cursor;
        cursor += 1;
        output[index] = await mapper(values[index]);
      }
    }
  );
  await Promise.all(workers);
  return output;
};

export const inferStreamType = (url: string): string =>
  /\.m3u8(?:$|[?#])/i.test(url) ? "m3u8" : "mp4";
