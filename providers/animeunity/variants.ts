import { Post, PostVariant } from "../types";

const DIACRITICS_REGEX = /[\u0300-\u036f]/g;
const DUB_SUFFIX_REGEX = /\s*[\[(]\s*ita\s*[\])]\s*$/i;

export type AnimeVariantEntry = {
  anime: any;
  post: Post;
};

type VariantAvailability = {
  subbed: boolean;
  dubbed: boolean;
};

const toPositiveNumber = (value: unknown): number | undefined => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

export const stripAnimeDubSuffix = (value: string): string =>
  String(value || "").replace(DUB_SUFFIX_REGEX, "").trim();

export const normalizeAnimeVariantTitle = (value: string): string =>
  stripAnimeDubSuffix(value)
    .normalize("NFD")
    .replace(DIACRITICS_REGEX, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export const isDubbedAnimeVariant = (anime: any): boolean => {
  const rawDub = anime?.dub ?? anime?.dubbed ?? anime?.is_dubbed;
  if (rawDub === true || rawDub === 1 || rawDub === "1") return true;
  const title = String(
    anime?.title_eng || anime?.title || anime?.title_it || anime?.name || ""
  );
  return DUB_SUFFIX_REGEX.test(title);
};

export const buildAnimeVariantKey = (anime: any): string => {
  const anilistId = toPositiveNumber(anime?.anilist_id ?? anime?.anilistId);
  if (anilistId) return `anilist:${anilistId}`;
  const malId = toPositiveNumber(anime?.mal_id ?? anime?.malId);
  if (malId) return `mal:${malId}`;
  const title = String(
    anime?.title_eng || anime?.title || anime?.title_it || anime?.name || ""
  );
  return `title:${normalizeAnimeVariantTitle(title)}`;
};

const getEpisodesCount = (anime: any): number => {
  const candidates = [
    anime?.episodes_count,
    anime?.episode_count,
    anime?.real_episodes_count,
    Array.isArray(anime?.episodes) ? anime.episodes.length : undefined,
  ];
  for (const candidate of candidates) {
    const parsed = Number(candidate);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return 0;
};

const getEpisodeLabelNumber = (post: Post): number => {
  const param = Number(post.episodeLabelParams?.number);
  if (Number.isFinite(param)) return param;
  const match = String(post.episodeLabel || "").match(/\d+(?:[.,]\d+)?/);
  if (!match) return -1;
  const parsed = Number(match[0].replace(",", "."));
  return Number.isFinite(parsed) ? parsed : -1;
};

const preferEntry = (
  current: AnimeVariantEntry,
  candidate: AnimeVariantEntry
): AnimeVariantEntry => {
  const currentDubbed = isDubbedAnimeVariant(current.anime);
  const candidateDubbed = isDubbedAnimeVariant(candidate.anime);
  if (currentDubbed !== candidateDubbed) return currentDubbed ? candidate : current;
  const currentEpisodes = getEpisodesCount(current.anime);
  const candidateEpisodes = getEpisodesCount(candidate.anime);
  if (candidateEpisodes !== currentEpisodes) {
    return candidateEpisodes > currentEpisodes ? candidate : current;
  }
  return getEpisodeLabelNumber(candidate.post) > getEpisodeLabelNumber(current.post)
    ? candidate
    : current;
};

const toDubStatus = (
  availability: VariantAvailability
): Pick<Post, "dubStatus" | "dubStatusKey"> => {
  if (availability.subbed && availability.dubbed) {
    return { dubStatus: "both", dubStatusKey: "Subbed and dubbed" };
  }
  if (availability.dubbed) return { dubStatus: "dubbed", dubStatusKey: "Dubbed" };
  return { dubStatus: "subbed", dubStatusKey: "Subbed" };
};

const toPostVariant = (entry: AnimeVariantEntry): PostVariant => {
  const dubbed = isDubbedAnimeVariant(entry.anime);
  return {
    status: dubbed ? "dubbed" : "subbed",
    statusKey: dubbed ? "Dubbed" : "Subbed",
    title: stripAnimeDubSuffix(entry.post.title) || entry.post.title,
    link: entry.post.link,
    image: entry.post.image,
    episodeLabel: entry.post.episodeLabel,
    episodeLabelKey: entry.post.episodeLabelKey,
    episodeLabelParams: entry.post.episodeLabelParams,
    episodeId: entry.post.episodeId,
  };
};

const buildPostVariants = (entries: AnimeVariantEntry[]): PostVariant[] => {
  const preferredByStatus = new Map<"subbed" | "dubbed", AnimeVariantEntry>();
  entries.forEach((entry) => {
    const status = isDubbedAnimeVariant(entry.anime) ? "dubbed" : "subbed";
    const current = preferredByStatus.get(status);
    preferredByStatus.set(status, current ? preferEntry(current, entry) : entry);
  });
  return (["subbed", "dubbed"] as const)
    .map((status) => preferredByStatus.get(status))
    .filter((entry): entry is AnimeVariantEntry => Boolean(entry))
    .map(toPostVariant);
};

export const deduplicateAnimeVariantPosts = (
  entries: AnimeVariantEntry[]
): Post[] => {
  const groups = new Map<string, AnimeVariantEntry[]>();
  const order: string[] = [];
  entries.forEach((entry) => {
    if (!entry?.post || !entry?.anime) return;
    const key = buildAnimeVariantKey(entry.anime);
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    groups.get(key)!.push(entry);
  });

  return order.map((key) => {
    const variants = groups.get(key)!;
    const preferred = variants.reduce(preferEntry);
    const availability = {
      subbed: variants.some((entry) => !isDubbedAnimeVariant(entry.anime)),
      dubbed: variants.some((entry) => isDubbedAnimeVariant(entry.anime)),
    };
    const cleanTitle = stripAnimeDubSuffix(preferred.post.title);
    return {
      ...preferred.post,
      title: cleanTitle || preferred.post.title,
      variants: buildPostVariants(variants),
      ...toDubStatus(availability),
    };
  });
};
