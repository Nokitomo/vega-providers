const assert = require("assert");
const cheerio = require("cheerio");
const {
  extractMoviePathFromTvdbPage,
  extractSeriesPathFromTvdbPage,
  parseTvdbArtworkDetails,
  parseTvdbArtworkGrid,
  parseTvdbOriginalLanguage,
  resolveTvdbArtworkMetadata,
} = require("../dist/animeunity/tvdb/index.js");

const seriesPage = `
<!doctype html><html><body>
  <a href="/series/test-show/bulk_delete_artwork/series">Delete artwork</a>
  <ul>
    <li class="list-group-item clearfix"><strong>Original Language</strong><span>Japanese</span></li>
  </ul>
  <div id="artwork-clearlogo">
    <a class="lightbox" rel="artwork_clearlogo" data-id="logo-ja" href="https://artworks.thetvdb.com/banners/v4/series/1/clearlogo/ja.png"></a>
    <a class="lightbox" rel="artwork_clearlogo" data-id="logo-en" href="https://artworks.thetvdb.com/banners/v4/series/1/clearlogo/en.png"></a>
  </div>
  <div id="artwork-backgrounds">
    <a class="lightbox" rel="artwork_backgrounds" data-id="background-ja" href="https://artworks.thetvdb.com/banners/v4/series/1/backgrounds/ja.jpg"></a>
  </div>
</body></html>`;

const moviePage = `
<!doctype html><html><body>
  <h1>秒速5センチメートル</h1>
  <a href="/movies/test-movie/edit">Edit Movie</a>
  <ul>
    <li class="list-group-item clearfix"><strong>Original Language</strong><span>Japanese</span></li>
  </ul>
  <div id="artwork-posters">
    <a class="lightbox" rel="artwork_14" data-id="movie-poster-ja" href="https://artworks.thetvdb.com/banners/v4/movie/3000/posters/ja.jpg"></a>
    <a class="lightbox" rel="artwork_14" data-id="movie-poster-en" href="https://artworks.thetvdb.com/banners/v4/movie/3000/posters/en.jpg"></a>
  </div>
  <div id="artwork-backgrounds">
    <a class="lightbox" rel="artwork_15" data-id="movie-background-en" href="https://artworks.thetvdb.com/banners/v4/movie/3000/backgrounds/en.jpg"></a>
  </div>
</body></html>`;

const seasonPage = `
<!doctype html><html><body>
  <div id="artwork-posters">
    <a class="lightbox" rel="artwork_posters" data-id="poster-es" href="https://artworks.thetvdb.com/banners/v4/season/2/posters/es.jpg"></a>
    <a class="lightbox" rel="artwork_posters" data-id="poster-en" href="https://artworks.thetvdb.com/banners/v4/season/2/posters/en.jpg"></a>
  </div>
</body></html>`;

const detailPage = (url, language) => `
<!doctype html><html><body>
  <span class="thumbnail"><img src="${url}" class="img-responsive"></span>
  <ul class="list-group">
    <li class="list-group-item clearfix"><strong>Language</strong><span>${language}</span></li>
  </ul>
</body></html>`;

const emptyCache = () => {
  const values = new Map();
  return {
    getString: (key) => values.get(key),
    setString: (key, value) => values.set(key, value),
    delete: (key) => values.delete(key),
  };
};

assert.strictEqual(
  extractSeriesPathFromTvdbPage(
    seriesPage,
    "https://www.thetvdb.com/series/test-show",
  ),
  "/series/test-show",
);
assert.strictEqual(
  extractMoviePathFromTvdbPage(
    moviePage,
    "https://www.thetvdb.com/movies/test-movie",
  ),
  "/movies/test-movie",
);
assert.strictEqual(parseTvdbOriginalLanguage(seriesPage, cheerio), "ja");
assert.strictEqual(
  parseTvdbArtworkGrid(seasonPage, cheerio, "poster").length,
  2,
);
assert.strictEqual(
  parseTvdbArtworkDetails(
    detailPage("https://artworks.thetvdb.com/test/en.png", "English"),
    cheerio,
    { type: "logo", url: "https://artworks.thetvdb.com/test/en.png" },
  ).language,
  "en",
);

const requestedUrls = [];
const providerContext = {
  cheerio,
  cache: emptyCache(),
  axios: {
    get: async (url) => {
      requestedUrls.push(String(url));
      if (String(url).includes("?id=457078&tab=series")) {
        return {
          data: seriesPage,
          request: {
            res: { responseUrl: "https://www.thetvdb.com/series/test-show" },
          },
        };
      }
      if (String(url).endsWith("/dereferrer/movie/3000")) {
        return {
          data: moviePage,
          request: {
            res: { responseUrl: "https://www.thetvdb.com/movies/test-movie" },
          },
        };
      }
      if (String(url).endsWith("/series/test-show/seasons/official/2")) {
        return {
          data: seasonPage,
          request: { res: { responseUrl: String(url) } },
        };
      }
      if (String(url).endsWith("/artwork/poster-es")) {
        return {
          data: detailPage(
            "https://artworks.thetvdb.com/banners/v4/season/2/posters/es.jpg",
            "Spanish",
          ),
          request: { res: { responseUrl: String(url) } },
        };
      }
      if (String(url).endsWith("/artwork/poster-en")) {
        return {
          data: detailPage(
            "https://artworks.thetvdb.com/banners/v4/season/2/posters/en.jpg",
            "English",
          ),
          request: { res: { responseUrl: String(url) } },
        };
      }
      if (String(url).endsWith("/artwork/logo-ja")) {
        return {
          data: detailPage(
            "https://artworks.thetvdb.com/banners/v4/series/1/clearlogo/ja.png",
            "Japanese",
          ),
          request: { res: { responseUrl: String(url) } },
        };
      }
      if (String(url).endsWith("/artwork/logo-en")) {
        return {
          data: detailPage(
            "https://artworks.thetvdb.com/banners/v4/series/1/clearlogo/en.png",
            "English",
          ),
          request: { res: { responseUrl: String(url) } },
        };
      }
      if (String(url).endsWith("/artwork/background-ja")) {
        return {
          data: detailPage(
            "https://artworks.thetvdb.com/banners/v4/series/1/backgrounds/ja.jpg",
            "Japanese",
          ),
          request: { res: { responseUrl: String(url) } },
        };
      }
      if (String(url).endsWith("/artwork/movie-poster-ja")) {
        return {
          data: detailPage(
            "https://artworks.thetvdb.com/banners/v4/movie/3000/posters/ja.jpg",
            "Japanese",
          ),
          request: { res: { responseUrl: String(url) } },
        };
      }
      if (String(url).endsWith("/artwork/movie-poster-en")) {
        return {
          data: detailPage(
            "https://artworks.thetvdb.com/banners/v4/movie/3000/posters/en.jpg",
            "English",
          ),
          request: { res: { responseUrl: String(url) } },
        };
      }
      if (String(url).endsWith("/artwork/movie-background-en")) {
        return {
          data: detailPage(
            "https://artworks.thetvdb.com/banners/v4/movie/3000/backgrounds/en.jpg",
            "English",
          ),
          request: { res: { responseUrl: String(url) } },
        };
      }
      throw new Error(`Unexpected URL ${url}`);
    },
  },
};

(async () => {
  const metadata = await resolveTvdbArtworkMetadata({
    providerContext,
    tvdbShowId: 457078,
    seasonNumber: 2,
    fields: ["poster", "logo", "background"],
  });

  assert(metadata);
  assert.strictEqual(
    metadata.poster,
    "https://artworks.thetvdb.com/banners/v4/season/2/posters/en.jpg",
    "TVDB poster should prefer English over an earlier Spanish season poster",
  );
  assert.strictEqual(
    metadata.logo,
    "https://artworks.thetvdb.com/banners/v4/series/1/clearlogo/en.png",
    "TVDB logo must skip Japanese and accept English",
  );
  assert.strictEqual(
    metadata.background,
    "https://artworks.thetvdb.com/banners/v4/series/1/backgrounds/ja.jpg",
    "TVDB background may fall back to original language after Italian/English",
  );
  assert(
    requestedUrls.some((url) =>
      url.endsWith("/series/test-show/seasons/official/2"),
    ),
    "TVDB resolver must request the season page for seasonal posters",
  );

  const movieMetadata = await resolveTvdbArtworkMetadata({
    providerContext,
    tvdbMovieId: 3000,
    mediaType: "movie",
    fields: ["poster", "background"],
  });
  assert(movieMetadata);
  assert.strictEqual(movieMetadata.mediaType, "movie");
  assert.strictEqual(movieMetadata.tvdbMovieId, 3000);
  assert.strictEqual(
    movieMetadata.poster,
    "https://artworks.thetvdb.com/banners/v4/movie/3000/posters/en.jpg",
    "TVDB movie poster should prefer English over original Japanese",
  );
  assert.strictEqual(
    movieMetadata.background,
    "https://artworks.thetvdb.com/banners/v4/movie/3000/backgrounds/en.jpg",
  );

  console.log("animeunity tvdb: OK");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
