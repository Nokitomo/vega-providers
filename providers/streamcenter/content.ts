import { Info, Post } from "../types";
import {
  encodeRoute,
  StreamCenterSource,
} from "./routing";

export type AnimeIdentity = {
  title: string;
  anilistId?: number;
  malId?: number;
  dubbed?: boolean;
};

export type MetaRouteData = { url: string };

export type EpisodesRouteData = AnimeIdentity & {
  url: string;
};

export const wrapPost = (post: Post, source: StreamCenterSource): Post => ({
  ...post,
  link: encodeRoute<MetaRouteData>("meta", source, { url: post.link }),
  variants: post.variants?.map((variant) => ({
    ...variant,
    link: encodeRoute<MetaRouteData>("meta", source, { url: variant.link }),
  })),
});

export const wrapInfo = (
  info: Info,
  source: StreamCenterSource
): Info => {
  const identity: AnimeIdentity | null =
    source === "animeunity"
      ? {
          title: info.title,
          anilistId: info.extra?.ids?.anilistId,
          malId: info.extra?.ids?.malId,
          dubbed: Boolean(info.extra?.flags?.dub),
        }
      : null;

  return {
    ...info,
    related: info.related?.map((item) => ({
      ...item,
      link: encodeRoute<MetaRouteData>("meta", source, { url: item.link }),
    })),
    linkList: (info.linkList || []).map((group) => ({
      ...group,
      episodesLink: group.episodesLink
        ? encodeRoute<EpisodesRouteData>("episodes", source, {
            url: group.episodesLink,
            ...(identity || { title: info.title }),
          })
        : undefined,
      directLinks: group.directLinks?.map((item) => ({
        ...item,
        link: encodeRoute("stream", source, { url: item.link }),
      })),
    })),
  };
};

const normalizeTitle = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export const mergePosts = (groups: Post[][]): Post[] => {
  const output: Post[] = [];
  const seenLinks = new Set<string>();
  const seenTitles = new Set<string>();
  const maxLength = Math.max(0, ...groups.map((group) => group.length));

  for (let index = 0; index < maxLength; index += 1) {
    for (const group of groups) {
      const post = group[index];
      if (!post?.link || seenLinks.has(post.link)) continue;
      const titleKey = normalizeTitle(post.title || "");
      if (titleKey && seenTitles.has(titleKey)) continue;
      seenLinks.add(post.link);
      if (titleKey) seenTitles.add(titleKey);
      output.push(post);
    }
  }

  return output;
};
