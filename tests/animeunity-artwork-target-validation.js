const assert = require('assert');
const cheerio = require('cheerio');
const {
  verifyArtworkTargets,
} = require('../dist/animeunity/artworkTargetValidation.js');

const target = (provider, id) => ({
  provider, id: String(id), raw: `${provider}:${id}`, ranges: {},
});
const resolution = targets => ({
  sourceDescriptors: [], targets, metadataTargets: targets,
  ids: {tvdbShowIds: targets.filter(item => item.provider === 'tvdb_show')
    .map(item => Number(item.id))},
});
const context = (pages, requests) => ({
  cheerio,
  axios: {get: async url => {
    requests.push(url);
    if (!pages[url]) throw new Error('Unavailable');
    return {data: pages[url], request: {res: {responseUrl: url}}};
  }},
});
const tvdb = title => `<!doctype html><title>TheTVDB</title><h1>${title}</h1>`;
const tmdb = title => `<!doctype html><title>themoviedb</title>
  <section id="original_header"><div class="title"><h2><a>${title}</a></h2></div></section>`;

(async () => {
  const bad = target('tvdb_show', 452665);
  const good = target('tvdb_show', 480909);
  const pages = {
    'https://www.thetvdb.com/?id=452665&tab=series': tvdb('The Big Bang Theory'),
    'https://www.thetvdb.com/?id=480909&tab=series': tvdb('Dark Machine the Animation'),
  };
  const requests = [];
  const checked = await verifyArtworkTargets({
    providerContext: context(pages, requests),
    mappingResolution: resolution([bad, good]),
    isMovie: false, titles: ['Dark Machine the Animation'],
  });
  assert.deepStrictEqual(checked.metadataTargets.map(item => item.id), ['480909']);
  assert.strictEqual(checked.targets.length, 2, 'episode mappings stay intact');
  assert.strictEqual(requests.length, 2);

  const uncertain = await verifyArtworkTargets({
    providerContext: context({}, []),
    mappingResolution: resolution([bad, good]),
    isMovie: false, titles: ['Dark Machine the Animation'],
  });
  assert.deepStrictEqual(uncertain.metadataTargets, [], 'unverifiable conflict falls back');

  const uncontestedRequests = [];
  const uncontested = resolution([good]);
  assert.strictEqual(await verifyArtworkTargets({
    providerContext: context({}, uncontestedRequests),
    mappingResolution: uncontested,
    isMovie: false, titles: ['Dark Machine the Animation'],
  }), uncontested);
  assert.deepStrictEqual(uncontestedRequests, [], 'normal mappings incur no extra requests');

  const movieBad = target('tmdb_movie', 1);
  const movieGood = target('tmdb_movie', 2);
  const moviePages = {
    'https://www.themoviedb.org/movie/1?language=en-US': tmdb('Other Movie'),
    'https://www.themoviedb.org/movie/1?language=it-IT': tmdb('Other Movie'),
    'https://www.themoviedb.org/movie/2?language=en-US': tmdb('Correct Movie'),
    'https://www.themoviedb.org/movie/2?language=it-IT': tmdb('Correct Movie'),
  };
  const movieChecked = await verifyArtworkTargets({
    providerContext: context(moviePages, []),
    mappingResolution: resolution([movieBad, movieGood]),
    isMovie: true, titles: ['Correct Movie'],
  });
  assert.deepStrictEqual(movieChecked.metadataTargets.map(item => item.id), ['2']);
  console.log('AnimeUnity artwork target validation: OK');
})().catch(error => {console.error(error); process.exitCode = 1;});
