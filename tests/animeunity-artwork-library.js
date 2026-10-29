const test = require('node:test');
const assert = require('node:assert/strict');
const cheerio = require('cheerio');
const {resolveTmdbArtworkLibrary} = require('../dist/animeunity/tmdb/artworkLibrary');
const {resolveTvdbArtworkLibrary} = require('../dist/animeunity/tvdb/artworkLibrary');
const {resolveTvdbEpisodeFallbacks} = require('../dist/animeunity/tvdb/episodeResolver');

test('TMDB inventory keeps all requested languages, source order, and specials', async () => {
  const calls = [];
  const rows = suffix => [
    {file_path: `/it-first-${suffix}.jpg`, iso_639_1: 'it', width: 300},
    {file_path: `/it-second-${suffix}.jpg`, iso_639_1: 'it', width: 2000},
    ...['en', 'ja', null].map(language => ({file_path: `/${language || 'none'}-${suffix}.jpg`, iso_639_1: language})),
  ];
  const context = {cheerio, kvStore: {get: async () => 'fixture-key'}, axios: {get: async (url, options) => {
    calls.push({url, params: options?.params});
    if (url.endsWith('/tv/123')) return {data: {id: 123, original_language: 'ja',
      seasons: [{season_number: 0}, {season_number: 1}]}};
    if (url.endsWith('/images')) return {data: {posters: rows('poster'), backdrops: rows('background'), logos: rows('logo')}};
    return {data: {}};
  }}};
  const result = await resolveTmdbArtworkLibrary({providerContext: context, id: 123, type: 'tv'});
  assert.deepEqual(Object.keys(result.series.poster), ['it', 'en', 'ja', 'xx']);
  assert.deepEqual(Object.keys(result.series.logo), ['it', 'en', 'xx']);
  assert.equal(result.series.poster.it.candidates.length, 2);
  assert.match(result.series.poster.it.selected.url, /it-first-poster/);
  assert.deepEqual(Object.keys(result.seasons), ['0', '1']);
  assert.deepEqual(Object.keys(result.seasons[0].images.poster), ['it', 'en', 'ja', 'xx']);
  assert.equal(result.seasons[1].logo.status, 'unsupported');
  assert.equal(result.seasons[1].background.inheritedFrom, 'series.background');
  assert(calls.every(call => call.url.startsWith('https://api.themoviedb.org/')));
  assert(calls.filter(call => call.url.endsWith('/images')).every(call => call.params.include_image_language.includes('null')));
});

for (const key of [undefined, 'invalid-fixture-key']) {
  test(`TMDB web inventory works with ${key ? 'failed' : 'absent'} API credentials`, async () => {
    const calls = [];
    const context = {cheerio, kvStore: {get: async () => key}, metadataTasks: {run: async (task, load) => {
      if (task.kind === 'artwork') return {originalLanguage: 'ja-JP'};
      if (task.kind === 'season-layout') return [{seasonNumber: 0}];
      return load();
    }}, axios: {get: async url => {
      calls.push(url);
      if (url.includes('api.themoviedb.org')) throw {response: {status: 401}};
      const language = new URL(url).searchParams.get('language').split('-')[0];
      return {data: `<html>The Movie Database<ul>
        <li class="card" data-image-id="first"><input data-language="${language}">
          <a href="https://image.tmdb.org/t/p/original/${language}.jpg">image</a></li>
        <li class="card" data-image-id="unknown">
          <a href="https://image.tmdb.org/t/p/original/unknown.jpg">image</a></li>
      </ul></html>`};
    }}};
    const result = await resolveTmdbArtworkLibrary({providerContext: context, id: 9, type: 'tv'});
    assert.deepEqual(Object.keys(result.series.poster), ['it', 'en', 'ja', 'xx']);
    for (const slot of Object.values(result.series.poster)) assert.equal(slot.candidates.length, 1);
    assert.match(result.seasons[0].images.poster.ja.selected.url, /ja.jpg$/);
    assert(calls.some(url => url.includes('/season/0/images/posters')));
    assert(!calls.some(url => url.includes('/season/0/images/logos')));
  });
}

test('TVDB inventory records real season posters and explicit series inheritance', async () => {
  const context = {cheerio, metadataTasks: {run: async (task, load) => {
    if (task.kind === 'artwork') return {poster: 'series-poster', logo: 'series-logo', background: 'series-background'};
    return load();
  }}, axios: {get: async url => {
    if (url.includes('tab=series')) return {data: `<html>TheTVDB
      <a href="/series/fixture/edit">edit</a>
      <a href="/series/fixture/seasons/official/0">Specials</a>
      <a href="/series/fixture/seasons/official/1">Season 1</a></html>`};
    if (url.includes('/artwork/')) return {data: `<html>TheTVDB
      <li class="list-group-item"><strong>Language</strong><span>English</span></li></html>`};
    return {data: `<html>TheTVDB<div id="artwork-posters">
      <a class="lightbox" rel="artwork_posters" data-id="poster-en"
      href="https://artworks.thetvdb.com/banners/season/en.jpg"></a></div></html>`};
  }}};
  const result = await resolveTvdbArtworkLibrary({providerContext: context, tvdbId: 1, mediaType: 'series'});
  assert.deepEqual(Object.keys(result.seasons), ['0', '1']);
  assert.equal(result.seasons[0].poster.status, 'available');
  assert.equal(result.seasons[1].logo.status, 'missing');
  assert.equal(result.seasons[1].logo.inheritedFrom, 'series.logo');
});

test('TVDB chooses Italian title and English synopsis independently', async () => {
  const context = {cheerio, axios: {get: async url => {
    if (url.includes('tab=series')) return {data: '<html>TheTVDB<a href="/series/fixture/edit">edit</a></html>'};
    if (url.includes('/seasons/')) return {data: '<html>TheTVDB<a href="/series/fixture/episodes/11">Episode 1</a></html>'};
    return {data: `<html>TheTVDB
      <div class="change_translation_text" data-language="ita" data-title="Titolo italiano"><p></p></div>
      <div class="change_translation_text" data-language="eng" data-title="English title"><p>English synopsis</p></div>
      <img src="https://artworks.thetvdb.com/banners/v4/episode/11/image.jpg"></html>`};
  }}};
  const rows = await resolveTvdbEpisodeFallbacks({providerContext: context, tvdbShowId: 10,
    seasonNumber: 1, episodeNumbers: [1]});
  assert.equal(rows[0].title, 'Titolo italiano');
  assert.equal(rows[0].synopsis, 'English synopsis');
  assert.equal(rows[0].titleLanguage, 'ita');
  assert.equal(rows[0].synopsisLanguage, 'eng');
});
