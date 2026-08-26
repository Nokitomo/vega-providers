import { Info, ProviderContext } from "../types";
import { getMeta as getAnimeMeta } from "../animeunity/meta";
import { getMeta as getStreamingMeta } from "../streamingunity/meta";
import { MetaRouteData, wrapInfo } from "./content";
import { decodeRoute } from "./routing";

const emptyInfo = (): Info => ({
  title: "",
  synopsis: "",
  image: "",
  imdbId: "",
  type: "movie",
  linkList: [],
});

export const getMeta = function ({
  link,
  provider,
  providerContext,
}: {
  link: string;
  provider: string;
  providerContext: ProviderContext;
}): Promise<Info> {
  const route = decodeRoute<MetaRouteData>(link, "meta");
  if (!route?.data?.url) return Promise.resolve(emptyInfo());

  const infoPromise =
    route.source === "animeunity"
      ? getAnimeMeta({ link: route.data.url, providerContext })
      : getStreamingMeta({
          link: route.data.url,
          provider,
          providerContext,
        });
  return infoPromise.then((info) => wrapInfo(info, route.source));
};
