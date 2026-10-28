const assert = require('assert');
const path = require('path');
const cheerio = require('cheerio');
const {getMeta} = require('../dist/streamingunity/meta.js');
const {resolveTvdbArtworkMetadata} = require('../dist/animeunity/tvdb/index.js');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const page = props => `<div id="app" data-page="${JSON.stringify({props}).replace(/"/g, '&quot;')}"></div>`;
const title = {
  id: 77, slug: 'fixture', name: 'Provider title', plot: 'Trama provider',
  type: 'movie', tmdb_id: 55, tvdb_movie_id: 66, imdb_id: 'tt0000055',
  runtime: 90, release_date: '2025-01-01', score: 8, genres: [{name: 'Drama'}],
  images: [{type: 'poster', filename: 'poster.jpg'}, {type: 'background', filename: 'background.jpg'}],
};

function context() {
  const events = [];
  return {
    events,
    cheerio,
    getBaseUrl: async () => 'https://streamingunity.test',
    commonHeaders: {},
    kvStore: {get: async () => 'fixture-key'},
    axios: {get: async url => {
      if (url.includes('streamingunity.test')) return {data: page({title})};
      if (url.endsWith('/credits')) {
        events.push('credits-start');
        await delay(80);
        events.push('credits-end');
        return {data: {cast: [{id: 1, name: 'Actor'}]}};
      }
      if (url.endsWith('/images')) {
        events.push('images-start');
        await delay(80);
        return {data: {logos: [
          {file_path: '/english.png', iso_639_1: 'en', vote_average: 10},
          {file_path: '/italian.png', iso_639_1: 'it', vote_average: 1},
        ], posters: [], backdrops: []}};
      }
      if (url.endsWith('/translations')) return {data: {translations: []}};
      if (url.includes('api.themoviedb.org')) return {data: {
        id: 55, title: 'External title', overview: 'External plot', original_language: 'en',
        release_date: '2025-01-01', genres: [{name: 'Drama'}], runtime: 90,
      }};
      if (url.includes('thetvdb.com')) return {data: '<html></html>'};
      throw new Error('Unexpected fixture request');
    }},
  };
}

async function streaming() {
  const currentContext = context();
  const start = performance.now();
  const info = await getMeta({link: 'https://streamingunity.test/it/titles/77-fixture', purpose: 'hero', providerContext: currentContext});
  const currentMs = Math.round(performance.now() - start);
  assert(currentContext.events.indexOf('images-start') < currentContext.events.indexOf('credits-end'), 'Artwork must overlap missing cast resolution');
  assert.strictEqual(info.title, 'Fixture');
  assert.strictEqual(info.synopsis, 'Trama provider');
  assert.strictEqual(info.logo, 'https://image.tmdb.org/t/p/original/italian.png');
  assert.deepStrictEqual(info.cast, ['Actor']);
  assert.deepStrictEqual(info.linkList, []);
  if (process.env.HERO_BASELINE_DIR) {
    const baseline = require(path.join(process.env.HERO_BASELINE_DIR, 'before-streamingunity.cjs'));
    const baselineStart = performance.now();
    const old = await baseline.getMeta({link: 'https://streamingunity.test/it/titles/77-fixture', purpose: 'hero', providerContext: context()});
    const baselineMs = Math.round(performance.now() - baselineStart);
    assert.deepStrictEqual(info, old, 'Every returned field must match the previous implementation');
    console.log(JSON.stringify({fixture: 'streaming-hero', baselineMs, currentMs, equivalent: true}));
  }
}

async function tvdb() {
  const events = [];
  const detail = (language, id) => `<div class="thumbnail"><img src="https://artworks.thetvdb.com/${id}.png"></div><li><strong>Language</strong><span>${language}</span></li>`;
  const grid = (rel, id) => `<a class="lightbox" rel="${rel}" data-id="${id}" href="https://artworks.thetvdb.com/${id}.png"></a>`;
  const providerContext = {cheerio, axios: {get: async url => {
    if (url.includes('seasons/official')) {
      events.push('season-start'); await delay(80); events.push('season-end');
      return {data: grid('artwork_posters', 'season-en')};
    }
    if (url.includes('/artwork/')) {
      const id = url.split('/').pop(); events.push(id);
      if (id === 'logo-it') await delay(30);
      return {data: detail(id.endsWith('-it') ? 'Italian' : 'English', id)};
    }
    return {data: '<a href="/series/fixture/edit">Edit</a>' + grid('artwork_posters', 'series-it') + grid('artwork_clearlogo', 'logo-en') + grid('artwork_clearlogo', 'logo-it'), request: {res: {responseUrl: 'https://www.thetvdb.com/series/fixture'}}};
  }}};
  const info = await resolveTvdbArtworkMetadata({providerContext, tvdbId: 66, mediaType: 'series', seasonNumber: 1, fields: ['poster', 'logo']});
  assert(events.indexOf('logo-it') < events.indexOf('season-end'), 'Season lookup must not block the logo');
  assert.strictEqual(info.logo, 'https://artworks.thetvdb.com/logo-it.png', 'Slower Italian logo retains priority over English');
  assert.strictEqual(info.poster, 'https://artworks.thetvdb.com/season-en.png', 'Season poster retains priority over series poster');
  assert(!events.includes('series-it'), 'Series fallback remains lazy');
}

(async () => {await streaming(); await tvdb(); console.log('hero preparation: OK');})().catch(error => {console.error(error); process.exitCode = 1;});
