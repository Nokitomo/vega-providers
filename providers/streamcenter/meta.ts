import { ContentInventory, Info, Post, ProviderContext } from "../types";
import {
  getContentInventory as getAnimeContentInventory,
  getArtwork as getAnimeArtwork,
  getMeta as getAnimeMeta,
} from "../animeunity/meta";
import {
  getContentInventory as getStreamingContentInventory,
  getMeta as getStreamingMeta,
} from "../streamingunity/meta";
import { wrapInfo } from "./content";
import { resolveMetaRoute } from "./routing";

const emptyInfo = (): Info => ({
  title: "",
  synopsis: "",
  image: "",
  imdbId: "",
  type: "movie",
  linkList: [],
});

export const getContentInventory = ({
  link,
  providerContext,
}: {
  link: string;
  providerContext: ProviderContext;
}): Promise<ContentInventory> => {
  const route = resolveMetaRoute(link);
  if (!route?.data?.url) {
    return Promise.reject(new Error("Invalid StreamCenter metadata route"));
  }
  return route.source === "animeunity"
    ? getAnimeContentInventory({link: route.data.url, providerContext})
    : getStreamingContentInventory({link: route.data.url, providerContext});
};

export const getMeta = function ({
  link,
  provider,
  purpose = "full",
  providerContext,
}: {
  link: string;
  provider: string;
  purpose?: "full" | "hero";
  providerContext: ProviderContext;
}): Promise<Info> {
  const route = resolveMetaRoute(link);
  if (!route?.data?.url) return Promise.resolve(emptyInfo());

  const infoPromise =
    route.source === "animeunity"
      ? getAnimeMeta({ link: route.data.url, purpose, providerContext })
      : getStreamingMeta({
          link: route.data.url,
          provider,
          purpose,
          providerContext,
        });
  return infoPromise.then((info) => wrapInfo(info, route.source));
};

/** Lazy artwork recovery for StreamCenter's AnimeUnity routes. */
export const getArtwork = ({
  link,
  fields,
  failedUrls,
  hints,
  imageSize,
  providerContext,
}: {
  link: string;
  fields?: Array<"logo" | "poster" | "background">;
  failedUrls?: string[];
  hints?: Post["artworkHints"];
  imageSize?: "original" | "w300" | "w780";
  providerContext: ProviderContext;
}): Promise<{logo?: string; poster?: string; background?: string; resolved?: boolean}> => {
  const route = resolveMetaRoute(link);
  if (route?.source !== "animeunity" || !route.data?.url) {
    return Promise.resolve({resolved: false});
  }
  return getAnimeArtwork({
    link: route.data.url,
    fields,
    failedUrls,
    hints,
    imageSize,
    providerContext,
  });
};
