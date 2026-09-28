import {Post, ProviderContext} from "../types";

const CINEMETA_BASE = "https://v3-cinemeta.strem.io";

type CinemetaCatalogItem = {
  id?: string;
  imdb_id?: string;
  type?: string;
  name?: string;
  poster?: string;
  imdbRating?: string;
};

const toPost = (item: CinemetaCatalogItem): Post | undefined => {
  const id = item.id || item.imdb_id;
  const type = item.type === "series" ? "series" : "movie";
  if (!id || !item.name || !item.poster) return undefined;
  return {
    title: item.name,
    link: `${CINEMETA_BASE}/meta/${type}/${id}.json`,
    image: item.poster,
    provider: "torrentio",
    rating: item.imdbRating,
  };
};

const fetchCatalog = async ({
  type,
  catalog,
  page,
  searchQuery,
  signal,
  providerContext,
}: {
  type: "movie" | "series";
  catalog: string;
  page: number;
  searchQuery?: string;
  signal: AbortSignal;
  providerContext: ProviderContext;
}): Promise<Post[]> => {
  const extras = searchQuery
    ? `search=${encodeURIComponent(searchQuery)}`
    : `skip=${Math.max(0, page - 1) * 100}`;
  const response = await providerContext.axios.get(
    `${CINEMETA_BASE}/catalog/${type}/${catalog}/${extras}.json`,
    {signal},
  );
  return ((response.data?.metas || []) as CinemetaCatalogItem[])
    .map(toPost)
    .filter((post): post is Post => Boolean(post));
};

export const getPosts = async function ({
  filter,
  page,
  signal,
  providerContext,
}: {
  filter: string;
  page: number;
  providerValue: string;
  signal: AbortSignal;
  providerContext: ProviderContext;
}): Promise<Post[]> {
  const [requestedType, requestedCatalog] = String(filter || "movie/top").split("/");
  const type = requestedType === "series" ? "series" : "movie";
  const catalog = requestedCatalog || "top";
  return fetchCatalog({type, catalog, page, signal, providerContext});
};

export const getSearchPosts = async function ({
  searchQuery,
  page,
  signal,
  providerContext,
}: {
  searchQuery: string;
  page: number;
  providerValue: string;
  signal: AbortSignal;
  providerContext: ProviderContext;
}): Promise<Post[]> {
  const query = searchQuery.trim();
  if (!query) return [];
  const [movies, series] = await Promise.all([
    fetchCatalog({
      type: "movie",
      catalog: "top",
      page,
      searchQuery: query,
      signal,
      providerContext,
    }).catch(() => []),
    fetchCatalog({
      type: "series",
      catalog: "top",
      page,
      searchQuery: query,
      signal,
      providerContext,
    }).catch(() => []),
  ]);
  return [...movies, ...series];
};
