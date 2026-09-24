const assert = require("assert");
const cheerio = require("cheerio");
const {
  buildLocalePriority,
  mergeTmdbEpisodes,
  mergeTmdbImages,
  normalizeTmdbImageUrl,
  parseTmdbCreditsPage,
  parseTmdbDetailsPage,
  parseTmdbEpisodeGroupsPage,
  parseTmdbExpandedEpisode,
  parseTmdbImageGallery,
  parseTmdbSeasonEpisodesPage,
  parseTmdbSeasonsPage,
  parseTmdbTranslationsPage,
  parseTmdbVideosPage,
  parseTmdbWatchProvidersPage,
  pickLocalizedText,
  resolveOriginalLocale,
  selectTmdbPreferredArtwork,
  resolveTmdbEpisodeExtendedMetadata,
  resolveTmdbMediaMetadata,
  resolveTmdbSeasonMetadata,
} = require("../dist/animeunity/tmdb/index.js");

const imageUrl = (name) => `https://image.tmdb.org/t/p/original/${name}`;

function detailsFixture({
  locale,
  title,
  overview,
  tagline,
}) {
  const schema = {
    "@type": "TVSeries",
    ...(title ? { name: title } : {}),
    ...(overview ? { description: overview } : {}),
    startDate: "2002-10-03",
    endDate: "2007-02-08",
    numberOfEpisodes: 220,
    genre: ["Animazione", "Action & Adventure"],
    countryOfOrigin: [{ name: "Japan" }],
    image: imageUrl("schema-poster.jpg"),
    aggregateRating: { ratingValue: 8.4, ratingCount: 5890 },
  };
  return `<!doctype html><html><head><title>The Movie Database</title>
    <script type="application/ld+json">${JSON.stringify(schema)}</script></head>
    <body data-locale="${locale}">
      <div id="original_header"><div class="tagline">${tagline || ""}</div>
        <div class="facts"><span class="certification">TV-PG</span></div></div>
      <section class="facts left_column">
        <p><strong>Original Language</strong> Japanese</p>
        <p><strong>Status</strong> Ended</p>
        <p><strong>Original Name</strong> NARUTO -ナルト-</p>
      </section>
      <section class="keywords"><li><a>Ninja</a></li></section>
      <section class="content_score"><div class="content_score"><div><p>95</p></div></div></section>
      <section class="top_billed"><div class="people scroller"><div class="card">
        <p><a href="/person/1">Actor One</a></p><p class="character">Hero</p>
        <p class="episode_count">220 episodes</p><img class="profile" src="${imageUrl("actor.jpg")}">
      </div></div></section>
    </body></html>`;
}

function galleryFixture(type, locale) {
  const file = `${type}-${locale.toLowerCase()}.png`;
  return `<!doctype html><html><head><title>The Movie Database</title></head><body>
    <ul><li class="card" data-image-id="${type}-${locale}">
      <div class="image_content"><img src="https://media.themoviedb.org/t/p/w300/${file}"></div>
      <a href="${imageUrl(file)}">original</a>
      <div class="meta"><a href="${imageUrl(file)}">1000x500</a></div>
      <input data-language="${locale.split("-")[0].toLowerCase()}">
      ${locale === "en-US" ? '<span class="primary_status circle-check"></span>' : ""}
    </li></ul></body></html>`;
}

function seasonsFixture(locale) {
  const names = {
    "it-IT": "Stagione 2",
    "en-US": "Season 2",
    "ja-JP": "シーズン2",
    "xx-XX": "",
  };
  return `<!doctype html><html><head><title>The Movie Database</title></head><body>
    <div class="season_wrapper"><div class="season">
      <a href="/tv/46260/season/2"><img class="poster" src="${imageUrl(`season-${locale}.jpg`)}"></a>
      <h2><a href="/tv/46260/season/2">${names[locale] || ""}</a></h2>
      <h4>2003 · 52 Episodes</h4><div class="season_overview">${locale === "it-IT" ? "La seconda stagione" : ""}</div>
    </div></div></body></html>`;
}

function episodeFixture(locale) {
  const content = {
    "it-IT": ["L'eremita dei rospi", "Naruto incontra Jiraiya."],
    "en-US": ["The Toad Sage", "Naruto meets Jiraiya."],
    "ja-JP": ["エロ仙人登場", "ナルトは自来也と出会う。"],
    "xx-XX": ["", ""],
  }[locale];
  return `<!doctype html><html><head><title>The Movie Database</title></head><body>
    <div class="episode_list"><div class="card" data-object-id="episode-hex-id">
      <img class="backdrop" src="https://media.themoviedb.org/t/p/w500/episode-53.jpg">
      <a data-episode-number="1" data-episode-id="episode-hex-id"></a>
      <div class="episode_title"><h3><a>${content[0]}</a></h3></div>
      <div class="overview"><p>${content[1]}</p></div>
      <span class="date">${locale === "it-IT" ? "6 novembre 2003" : "November 6, 2003"}</span>
      <span class="runtime">24m</span><span class="rating">71%</span>
    </div></div></body></html>`;
}

const expandedFixture = `<!doctype html><html><head><title>The Movie Database</title></head><body>
  <div class="expanded_info">
    <div class="crew"><p>Director <a href="/person/2">Director One</a></p>
      <p>Writer <a href="/person/3">Writer One</a></p></div>
    <div class="guest_stars"><a href="/person/4">Guest One</a></div>
  </div>
  <div class="episode_images"><img src="https://media.themoviedb.org/t/p/w500/extra-still.jpg"></div>
  </body></html>`;

const extendedFixture = `<!doctype html><html><head><title>The Movie Database</title></head><body>
  <ol class="people credits"><li><p><a href="/person/10">Actor</a></p>
    <p class="character">Hero <span>(12 episodes)</span></p><img class="profile" src="${imageUrl("actor.jpg")}"></li></ol>
  <div class="crew_wrapper"><h4>Writing</h4><ol class="people credits crew"><li>
    <p><a href="/person/11">Writer</a></p><p class="episode_count_crew"><a>Screenplay</a> <span>(4 episodes)</span></p>
  </li></ol></div>
  <div id="it-IT"><table class="media-translations">
    <tr><td>Name</td><td><h3>Titolo</h3></td></tr><tr><td>Taglines</td><td><p>Slogan</p></td></tr>
    <tr><td>Overview</td><td><div><p>Prima parte.</p><p>Seconda parte.</p></div></td></tr>
  </table></div>
  <div id="video-id" class="video card"><div class="wrapper" style="background-image:url('https://i.ytimg.com/vi/key/hqdefault.jpg')">
    <a class="play_trailer" data-id="key" data-site="YouTube" data-title="Trailer"></a></div>
    <div class="info"><h2><a href="https://youtube.com/watch?v=key">Trailer</a></h2><h3 class="sub">Trailer • 2m</h3>
    <p><span class="restricted_region">US</span></p><div class="bg"><h4><a>Channel</a></h4></div></div></div>
  <div class="ott_provider"><h3>Stream</h3><ul><li class="ott_filter_best_price ott_filter_hd"><a
    href="https://click.justwatch.com/a?r=https%3A%2F%2Fwatch.test%2Ftitle" title="Watch Title on Provider">
    <img src="${imageUrl("provider.png")}"></a><span class="wrapper flatrate"></span></li></ul></div>
  <div class="season_wrapper"><section class="panel season"><div class="season"><h2><a
    href="/tv/1/episode_group/group-id">Broadcast <span>(Original Air Date)</span></a></h2>
    <h3>2 Groups, 24 episodes</h3><p>Official grouping.</p></div></section></div>
  </body></html>`;

assert.strictEqual(resolveOriginalLocale("Japanese"), "ja-JP");
assert.deepStrictEqual(buildLocalePriority("ja-JP"), [
  "it-IT",
  "en-US",
  "ja-JP",
  "xx-XX",
]);
assert.deepStrictEqual(
  pickLocalizedText(
    [
      { locale: "it-IT", value: "" },
      { locale: "en-US", value: "" },
      { locale: "ja-JP", value: "" },
      { locale: "xx-XX", value: "Language neutral" },
    ],
    (item) => item.value,
    (item) => item.locale
  ),
  { value: "Language neutral", language: "xx-XX" }
);
assert.strictEqual(
  normalizeTmdbImageUrl("https://media.themoviedb.org/t/p/w500/test.jpg"),
  imageUrl("test.jpg")
);
assert.strictEqual(normalizeTmdbImageUrl("javascript:alert(1)"), undefined);

assert.deepStrictEqual(
  selectTmdbPreferredArtwork({
    tmdb: {
      logo: "https://tmdb.test/logo.png",
      poster: "https://tmdb.test/poster.jpg",
      background: "https://tmdb.test/background.jpg",
    },
    provider: {
      poster: "https://provider.test/poster.jpg",
      background: "https://provider.test/background.jpg",
    },
    cinemeta: {
      logo: "https://cinemeta.test/logo.png",
      poster: "https://cinemeta.test/poster.jpg",
    },
  }),
  {
    logo: "https://tmdb.test/logo.png",
    poster: "https://tmdb.test/poster.jpg",
    background: "https://tmdb.test/background.jpg",
  }
);
assert.deepStrictEqual(
  selectTmdbPreferredArtwork({
    provider: { poster: "https://provider.test/poster.jpg" },
    cinemeta: {
      logo: "https://cinemeta.test/logo.png",
      background: "https://cinemeta.test/background.jpg",
    },
  }),
  {
    logo: "https://cinemeta.test/logo.png",
    poster: "https://provider.test/poster.jpg",
    background: "https://cinemeta.test/background.jpg",
  }
);

const parsedDetails = parseTmdbDetailsPage(
  detailsFixture({ locale: "it-IT", title: "Naruto", overview: "Un giovane ninja." }),
  cheerio,
  "it-IT"
);
assert.strictEqual(parsedDetails.title, "Naruto");
assert.strictEqual(parsedDetails.numberOfEpisodes, 220);
assert.strictEqual(parsedDetails.originalTitle, "NARUTO -ナルト-");
assert.strictEqual(parsedDetails.rating, 8.4);
assert.deepStrictEqual(parsedDetails.keywords, ["Ninja"]);

const parsedGallery = parseTmdbImageGallery(
  galleryFixture("logo", "it-IT"),
  cheerio,
  "logo",
  "it"
);
assert.strictEqual(parsedGallery[0].language, "it");
assert.strictEqual(parsedGallery[0].width, 1000);
assert.strictEqual(parsedGallery[0].height, 500);
const sortedImages = mergeTmdbImages(
  [
    parsedGallery,
    parseTmdbImageGallery(galleryFixture("logo", "en-US"), cheerio, "logo", "en"),
  ],
  ["it-IT", "en-US"]
);
assert.strictEqual(sortedImages[0].language, "it");

const parsedSeasons = parseTmdbSeasonsPage(
  seasonsFixture("it-IT"),
  cheerio,
  "it-IT",
  46260
);
assert.strictEqual(parsedSeasons[0].seasonNumber, 2);
assert.strictEqual(parsedSeasons[0].year, 2003);
assert.strictEqual(parsedSeasons[0].episodeCount, 52);

const italianEpisodes = parseTmdbSeasonEpisodesPage(
  episodeFixture("it-IT"),
  cheerio,
  "it-IT",
  46260,
  2
);
const englishEpisodes = parseTmdbSeasonEpisodesPage(
  episodeFixture("en-US"),
  cheerio,
  "en-US",
  46260,
  2
);
const mergedEpisodes = mergeTmdbEpisodes([italianEpisodes, englishEpisodes]);
assert.strictEqual(mergedEpisodes[0].title.value, "L'eremita dei rospi");
assert.strictEqual(mergedEpisodes[0].overview.language, "it-IT");
assert.strictEqual(mergedEpisodes[0].runtimeMinutes, 24);
assert.strictEqual(mergedEpisodes[0].rating, 7.1);

const expanded = parseTmdbExpandedEpisode(expandedFixture, cheerio);
assert.strictEqual(expanded.directors[0].name, "Director One");
assert.strictEqual(expanded.writers[0].name, "Writer One");
assert.strictEqual(expanded.guestStars[0].name, "Guest One");
assert.strictEqual(expanded.stills[0].url, imageUrl("extra-still.jpg"));

const credits = parseTmdbCreditsPage(extendedFixture, cheerio);
assert.strictEqual(credits.cast[0].name, "Actor");
assert.strictEqual(credits.crew[0].department, "Writing");
assert.deepStrictEqual(credits.crew[0].jobs, ["Screenplay"]);
const translations = parseTmdbTranslationsPage(extendedFixture, cheerio);
assert.strictEqual(translations[0].title, "Titolo");
assert.strictEqual(translations[0].overview, "Prima parte.\n\nSeconda parte.");
const videos = parseTmdbVideosPage(extendedFixture, cheerio, "it-IT");
assert.strictEqual(videos[0].key, "key");
assert.deepStrictEqual(videos[0].restrictedRegions, ["US"]);
const watchProviders = parseTmdbWatchProvidersPage(extendedFixture, cheerio);
assert.strictEqual(watchProviders[0].name, "Provider");
assert.strictEqual(watchProviders[0].url, "https://watch.test/title");
const episodeGroups = parseTmdbEpisodeGroupsPage(extendedFixture, cheerio, 1);
assert.strictEqual(episodeGroups[0].groupCount, 2);
assert.strictEqual(episodeGroups[0].episodeCount, 24);

(async () => {
  const calls = [];
  const providerContext = {
    cheerio,
    axios: {
      get: async (url) => {
        calls.push(url);
        const parsed = new URL(url);
        const locale = parsed.searchParams.get("language") || "it-IT";
        const route = parsed.pathname;
        if (route.endsWith("/expanded_info")) return { data: expandedFixture };
        if (/\/season\/2\/images\/posters$/.test(route)) {
          return { data: galleryFixture("season-poster", locale) };
        }
        if (/\/season\/2$/.test(route)) return { data: episodeFixture(locale) };
        if (route.endsWith("/seasons")) return { data: seasonsFixture(locale) };
        if (
          route.endsWith("/cast") ||
          route.endsWith("/translations") ||
          route.endsWith("/videos") ||
          route.endsWith("/watch") ||
          route.endsWith("/episode_groups")
        ) {
          return { data: extendedFixture };
        }
        const imageType = route.match(/\/images\/(logos|posters|backdrops)$/)?.[1];
        if (imageType) return { data: galleryFixture(imageType, locale) };
        if (route === "/tv/46260") {
          const localized = {
            "it-IT": { locale, title: "", overview: "", tagline: "" },
            "en-US": { locale, title: "Naruto", overview: "English overview", tagline: "" },
            "ja-JP": { locale, title: "ナルト", overview: "日本語の概要", tagline: "Original tagline" },
            "xx-XX": { locale, title: "No language title", overview: "", tagline: "" },
          }[locale];
          return { data: detailsFixture(localized) };
        }
        throw new Error(`Unexpected TMDB URL: ${url}`);
      },
    },
  };

  const media = await resolveTmdbMediaMetadata({
    providerContext,
    id: 46260,
    type: "tv",
  });
  assert(media);
  assert.strictEqual(media.title.value, "Naruto");
  assert.strictEqual(media.title.language, "en-US");
  assert.strictEqual(media.overview.value, "English overview");
  assert.strictEqual(media.tagline.value, "Original tagline");
  assert.strictEqual(media.tagline.language, "ja-JP");
  assert.strictEqual(media.originalLanguage, "ja-JP");
  assert.strictEqual(media.logo, imageUrl("logos-it-it.png"));
  assert.strictEqual(media.seasons[0].name.value, "Stagione 2");
  assert.deepStrictEqual(media.crew, []);
  assert.deepStrictEqual(media.videos, []);
  assert.strictEqual(
    calls.some((url) => /\/(cast|translations|videos|watch|episode_groups)\?/.test(url)),
    false
  );

  const callsAfterFirstResolution = calls.length;
  const cachedMedia = await resolveTmdbMediaMetadata({
    providerContext,
    id: 46260,
    type: "tv",
  });
  assert.strictEqual(cachedMedia, media);
  assert.strictEqual(calls.length, callsAfterFirstResolution);

  const extendedMedia = await resolveTmdbMediaMetadata({
    providerContext,
    id: 46260,
    type: "tv",
    includeExtended: true,
  });
  assert.strictEqual(extendedMedia.crew[0].name, "Writer");
  assert.strictEqual(extendedMedia.videos[0].name, "Trailer");
  assert.strictEqual(extendedMedia.watchProviders[0].name, "Provider");
  assert.strictEqual(extendedMedia.episodeGroups[0].name, "Broadcast");

  const season = await resolveTmdbSeasonMetadata({
    providerContext,
    mediaId: 46260,
    seasonNumber: 2,
  });
  assert(season);
  assert.strictEqual(season.episodes.length, 1);
  assert.strictEqual(season.episodes[0].title.value, "L'eremita dei rospi");
  assert.strictEqual(season.posters[0].language, "it");
  assert.strictEqual(season.backgrounds[0].type, "still");

  const episode = await resolveTmdbEpisodeExtendedMetadata({
    providerContext,
    mediaId: 46260,
    seasonNumber: 2,
    episodeNumber: 1,
  });
  assert.strictEqual(episode.directors[0].name, "Director One");
  assert.strictEqual(episode.stills.length, 2);

  console.log("animeunity tmdb: OK");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
