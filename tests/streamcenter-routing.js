const assert = require("assert");
const cheerio = require("cheerio");
const fs = require("fs");

const catalogModule = require("../dist/streamcenter/catalog.js");
const streamingCatalogModule = require("../dist/streamingunity/catalog.js");
const contentModule = require("../dist/streamcenter/content.js");
const routing = require("../dist/streamcenter/routing.js");
const animeWorld = require("../dist/streamcenter/animeFallback/animeWorld.js");
const animeSaturn = require("../dist/streamcenter/animeFallback/animeSaturn.js");

const executeLikeVega = (name) => {
  const moduleCode = fs.readFileSync(
    `dist/streamcenter/${name}.js`,
    "utf8",
  );
  const context = { exports: {}, console, Promise, Object, __awaiter: () => {} };
  return new Function(
    "context",
    `const exports = context.exports;
     const __awaiter = context.__awaiter;
     const Object = context.Object;
     const console = context.console;
     const Promise = context.Promise;
     ${moduleCode}
     return exports;`,
  )(context);
};

const expectedExports = {
  catalog: ["catalog", "genres", "archiveFilters"],
  posts: ["getPosts", "getSearchPosts"],
  meta: ["getMeta"],
  episodes: ["getEpisodes"],
  stream: ["getStream"],
};
Object.entries(expectedExports).forEach(([moduleName, names]) => {
  const moduleExports = executeLikeVega(moduleName);
  names.forEach((name) => {
    assert(name in moduleExports, `${moduleName}.${name} must load in Vega`);
  });
});

const route = routing.encodeRoute("meta", "animeunity", {
  url: "https://example.test/anime/42",
});
assert.deepStrictEqual(routing.decodeRoute(route, "meta"), {
  kind: "meta",
  source: "animeunity",
  data: { url: "https://example.test/anime/42" },
});
assert.strictEqual(routing.decodeRoute(route, "stream"), null);
assert.deepStrictEqual(
  routing.resolveMetaRoute("https://www.animeunity.so/anime/42-example"),
  {
    kind: "meta",
    source: "animeunity",
    data: { url: "https://www.animeunity.so/anime/42-example" },
  },
);
assert.deepStrictEqual(
  routing.resolveMetaRoute("https://streamingunity.vip/it/titles/42-example"),
  {
    kind: "meta",
    source: "streamingunity",
    data: { url: "https://streamingunity.vip/it/titles/42-example" },
  },
);
assert.deepStrictEqual(routing.resolveMetaRoute(route), {
  kind: "meta",
  source: "animeunity",
  data: { url: "https://example.test/anime/42" },
});
assert.strictEqual(routing.resolveMetaRoute("https://example.test/title/42"), null);
const wrappedPost = contentModule.wrapPost(
  {
    title: "Example",
    link: "https://www.animeunity.so/anime/42-example",
    image: "https://cdn.example/poster.jpg",
    variants: [
      {
        status: "dubbed",
        statusKey: "Dubbed",
        title: "Example (ITA)",
        link: "https://www.animeunity.so/anime/43-example-ita",
        image: "https://cdn.example/poster-ita.jpg",
      },
    ],
  },
  "animeunity",
);
assert.strictEqual(
  wrappedPost.link,
  "https://www.animeunity.so/anime/42-example",
);
assert.strictEqual(
  wrappedPost.variants[0].link,
  "https://www.animeunity.so/anime/43-example-ita",
);
const streamingUpcoming = streamingCatalogModule.catalog.find(
  (item) => item.filter === "browse/upcoming",
);
const streamCenterUpcoming = catalogModule.catalog.find((item) =>
  String(item.filter).includes("browse%2Fupcoming"),
);
assert.strictEqual(streamingUpcoming.staleTimeMs, 60 * 60 * 1000);
assert.strictEqual(streamCenterUpcoming.staleTimeMs, 60 * 60 * 1000);
assert(catalogModule.catalog.length >= 10, "catalog must expose curated rows");
assert(catalogModule.genres.length > 20, "genres must include both providers");
assert(catalogModule.archiveFilters.title, "unified archive filters must exist");

const worldSearch = animeWorld.parseAnimeWorldSearchHtml(
  `<div class="film-list"><div class="item">
    <div class="status"><span class="dub"></span></div>
    <a class="name" href="/play/example.abc" data-jtitle="Example">Example (ITA)</a>
  </div></div>`,
  "https://www.animeworld.ac",
  "Example",
  cheerio,
);
assert.strictEqual(worldSearch.length, 1);
assert.strictEqual(worldSearch[0].dubbed, true);

const worldPage = animeWorld.parseAnimeWorldPageHtml(
  `<a id="anilist-button" href="https://anilist.co/anime/21"></a>
   <a id="mal-button" href="https://myanimelist.net/anime/21"></a>
   <div class="widget servers"><div class="server" data-name="9">
     <a data-id="token-1" data-episode-num="1"></a>
   </div></div>`,
  "https://www.animeworld.ac/play/example.abc",
  "Example",
  false,
  cheerio,
);
assert(worldPage);
assert.strictEqual(worldPage.anilistId, 21);
assert.strictEqual(worldPage.episodes.get("1").episodeToken, "token-1");

const saturnPage = animeSaturn.parseAnimeSaturnPageHtml(
  `<a href="https://anilist.co/anime/21/"></a>
   <a href="https://myanimelist.net/anime/21/"></a>
   <a class="ep-tile" href="/episode/example-abc12/ep-1"></a>`,
  "https://www.animesaturn.net/anime/example-abc12",
  "Example",
  false,
  "https://www.animesaturn.net",
  cheerio,
);
assert(saturnPage);
assert.strictEqual(saturnPage.anilistId, 21);
assert.strictEqual(
  saturnPage.episodes.get("1").watchUrl,
  "https://www.animesaturn.net/anime/example-abc12/ep-1",
);

const key = "secret";
const plain = "https://cdn.example/video.m3u8";
const encoded = Buffer.from(
  Buffer.from(plain, "utf8").map((byte, index) =>
    byte ^ Buffer.from(key, "utf8")[index % key.length]
  ),
).toString("base64");
assert.strictEqual(animeSaturn.decodeAnimeSaturnPayload(encoded, key), plain);

console.log(
  JSON.stringify({
    catalog: catalogModule.catalog.length,
    genres: catalogModule.genres.length,
    routing: "ok",
    vegaRuntime: "ok",
    fallbackParsers: "ok",
  }),
);
