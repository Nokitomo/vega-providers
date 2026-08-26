import { Post, ProviderContext } from "../types";
import {
  getPosts as getAnimePosts,
  getSearchPosts as getAnimeSearchPosts,
} from "../animeunity/posts";
import {
  getPosts as getStreamingPosts,
  getSearchPosts as getStreamingSearchPosts,
} from "../streamingunity/posts";
import { mergePosts, wrapPost } from "./content";
import { decodeRoute } from "./routing";

type PostsArgs = {
  filter: string;
  page: number;
  providerValue: string;
  signal: AbortSignal;
  providerContext: ProviderContext;
};

const settledPosts = (tasks: Array<Promise<Post[]>>): Promise<Post[][]> =>
  Promise.allSettled(tasks).then((results) =>
    results.map((result) =>
      result.status === "fulfilled" && Array.isArray(result.value)
        ? result.value
        : []
    )
  );

const mapStreamingArchiveFilter = (filter: string): string => {
  const [, rawQuery = ""] = String(filter || "archive").split("?", 2);
  const source = new URLSearchParams(rawQuery);
  const target = new URLSearchParams();
  const title = source.get("title");
  const year = source.get("year");
  const type = source.get("type");
  const order = source.get("order");
  if (title) target.set("search", title);
  if (year) target.set("year", year);
  if (type === "tv" || type === "movie") target.set("type", type);
  if (order === "rating") target.set("sort", "score");
  if (order === "popularity") target.set("sort", "views");
  if (order === "a-z" || order === "z-a") target.set("sort", "name");
  if (source.get("random")) target.set("random", source.get("random") || "true");
  return `archive${target.toString() ? `?${target.toString()}` : ""}`;
};

const hasAnimeOnlyFilters = (filter: string): boolean => {
  const [, rawQuery = ""] = String(filter || "").split("?", 2);
  const params = new URLSearchParams(rawQuery);
  const type = params.get("type");
  return (
    params.has("status") ||
    params.has("season") ||
    params.has("dubbed") ||
    params.has("genres") ||
    Boolean(type && type !== "tv" && type !== "movie")
  );
};

const getUnifiedArchive = (args: PostsArgs): Promise<Post[]> => {
  const animeTask = getAnimePosts({ ...args, providerValue: "animeunity" });
  const tasks: Array<Promise<Post[]>> = [animeTask];
  if (!hasAnimeOnlyFilters(args.filter)) {
    tasks.push(
      getStreamingPosts({
        ...args,
        filter: mapStreamingArchiveFilter(args.filter),
        providerValue: "streamingunity",
      })
    );
  }
  return settledPosts(tasks).then(([anime = [], streaming = []]) =>
    mergePosts([
      anime.map((post) => wrapPost(post, "animeunity")),
      streaming.map((post) => wrapPost(post, "streamingunity")),
    ])
  );
};

export const getPosts = function (args: PostsArgs): Promise<Post[]> {
  if (args.signal?.aborted) return Promise.resolve([]);
  const route = decodeRoute<{ url: string }>(args.filter, "filter");
  if (route?.data?.url) {
    const postsPromise =
      route.source === "animeunity"
        ? getAnimePosts({
            ...args,
            filter: route.data.url,
            providerValue: "animeunity",
          })
        : getStreamingPosts({
            ...args,
            filter: route.data.url,
            providerValue: "streamingunity",
          });
    return postsPromise.then((posts) =>
      posts.map((post) => wrapPost(post, route.source))
    );
  }

  const normalizedPath = String(args.filter || "")
    .split("?", 1)[0]
    .replace(/^\/+|\/+$/g, "")
    .toLowerCase();
  if (normalizedPath === "archive" || normalizedPath === "catalog/all") {
    const archiveFilter =
      normalizedPath === "catalog/all"
        ? `archive${args.filter.includes("?") ? `?${args.filter.split("?", 2)[1]}` : ""}`
        : args.filter;
    return getUnifiedArchive({ ...args, filter: archiveFilter });
  }

  if (normalizedPath === "calendar") {
    return getAnimePosts({
      ...args,
      filter: "calendar",
      providerValue: "animeunity",
    }).then((posts) =>
      posts.map((post) => wrapPost(post, "animeunity"))
    );
  }

  return getUnifiedArchive({ ...args, filter: "archive" });
};

export const getSearchPosts = function ({
  searchQuery,
  page,
  providerValue,
  signal,
  providerContext,
}: {
  searchQuery: string;
  page: number;
  providerValue: string;
  signal: AbortSignal;
  providerContext: ProviderContext;
}): Promise<Post[]> {
  if (signal?.aborted || !String(searchQuery || "").trim()) {
    return Promise.resolve([]);
  }
  return settledPosts([
    getAnimeSearchPosts({
      searchQuery,
      page,
      providerValue: "animeunity",
      signal,
      providerContext,
    }),
    getStreamingSearchPosts({
      searchQuery,
      page,
      providerValue: "streamingunity",
      signal,
      providerContext,
    }),
  ]).then(([anime = [], streaming = []]) =>
    mergePosts([
      anime.map((post) => wrapPost(post, "animeunity")),
      streaming.map((post) => wrapPost(post, "streamingunity")),
    ])
  );
};
