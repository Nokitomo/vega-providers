const assert = require("assert");
const cheerio = require("cheerio");

const { extractVixsrcData } = require("../dist/altadefinizionez/hosts/vixsrc.js");
const { extractMixdropData } = require("../dist/altadefinizionez/hosts/mixdrop.js");
const {
  extractDroploadData,
  extractDroploadCookies,
} = require("../dist/altadefinizionez/hosts/dropload.js");
const { extractSuperVideoData } = require("../dist/altadefinizionez/hosts/supervideo.js");
const { extractStreamHgData } = require("../dist/altadefinizionez/hosts/streamhg.js");
const {
  buildStreamHgRedirectUrl,
  extractDirectMediaCandidates,
} = require("../dist/altadefinizionez/utils/streamhg.js");

function createPackedHtml(payload) {
  return `eval(function(p,a,c,k,e,d){return p}('${payload}',36,0,'|'.split('|')))`;
}

async function run() {
  // vixsrc
  const vixHtml = `
    <script>
      window.masterPlaylist = {
        url: '/playlist/abc123.m3u8',
        params: {
          'token': 'tok-1',
          'expires': '9999'
        }
      };
      window.canPlayFHD = true;
    </script>
  `;
  const vixParsed = extractVixsrcData(
    vixHtml,
    "https://vixsrc.to/embed/abc?asn=it-1"
  );
  assert.ok(vixParsed.streamUrl.includes("/playlist/abc123.m3u8"));
  assert.ok(vixParsed.streamUrl.includes("token=tok-1"));
  assert.ok(vixParsed.streamUrl.includes("expires=9999"));
  assert.ok(vixParsed.streamUrl.includes("asn=it-1"));
  assert.ok(vixParsed.streamUrl.includes("h=1"));

  const vixFallback = extractVixsrcData(
    "window.downloadUrl='https://cdn.vix.test/movie.mp4'",
    "https://vixsrc.to/embed/abc"
  );
  assert.strictEqual(vixFallback.streamUrl, "");
  assert.strictEqual(vixFallback.fallbackUrl, "https://cdn.vix.test/movie.mp4");

  // mixdrop
  const mixdropPayload = String.raw`MDCore.wurl="https://cdn.mix.test/video.m3u8"`;
  const mixdropHtml = createPackedHtml(mixdropPayload);
  const mixdropParsed = extractMixdropData(mixdropHtml, "https://mixdrop.co/e/abc");
  assert.strictEqual(mixdropParsed.streamUrl, "https://cdn.mix.test/video.m3u8");

  // dropload
  const droploadPayload = String.raw`file:"https://cdn.drop.test/video.m3u8",tracks:[{file:"https://cdn.drop.test/sub_eng.vtt",label:"English",kind:"captions"}]`;
  const droploadHtml = createPackedHtml(droploadPayload);
  const droploadParsed = extractDroploadData(droploadHtml, "https://dr0pstream.com");
  assert.strictEqual(droploadParsed.streamUrl, "https://cdn.drop.test/video.m3u8");
  assert.ok(Array.isArray(droploadParsed.subtitles));
  assert.strictEqual(droploadParsed.subtitles.length, 1);
  assert.strictEqual(droploadParsed.subtitles[0].language, "en");

  const cookies = extractDroploadCookies(
    `$.cookie('token','abc123');document.cookie='session=xyz789; path=/';`
  );
  assert.strictEqual(cookies.token, "abc123");
  assert.strictEqual(cookies.session, "xyz789");

  // supervideo
  const superPayload = String.raw`file:"https://cdn.super.test/video.m3u8",tracks:[{file:"https://cdn.super.test/sub_ita.vtt",label:"Italian",kind:"captions"}]',36,0,'|`;
  const superHtml = `eval(function(p,a,c,k,e,d){return p}('${superPayload}'.split('|')))`;
  const superParsed = extractSuperVideoData(superHtml, "https://supervideo.tv");
  assert.strictEqual(superParsed.streamUrl, "https://cdn.super.test/video.m3u8");
  assert.strictEqual(superParsed.subtitles.length, 1);
  assert.strictEqual(superParsed.subtitles[0].language, "it");

  // streamhg: redirect
  const redirect = buildStreamHgRedirectUrl("https://dhcplay.com/e/abc123");
  assert.strictEqual(redirect, "https://vibuxer.com/e/abc123");

  // streamhg: direct candidates
  const directCandidates = extractDirectMediaCandidates(
    `const u='https://cdn.streamhg.test/main.m3u8?token=1';`,
    "https://streamhg.com/e/abc123"
  );
  assert.ok(directCandidates.length > 0);
  assert.ok(directCandidates[0].includes("main.m3u8"));

  // streamhg: extraction from external script (mocked axios)
  const streamhgUrl = await extractStreamHgData({
    html: `<html><head><script src="/assets/player.js"></script></head></html>`,
    pageUrl: "https://streamhg.com/e/abc123",
    signal: new AbortController().signal,
    providerContext: {
      axios: {
        get: async (url) => {
          if (String(url).includes("player.js")) {
            return {
              data: `var source="https://cdn.streamhg.test/from-script.m3u8";`,
            };
          }
          return { data: "" };
        },
      },
      cheerio,
      commonHeaders: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    },
  });
  assert.ok(streamhgUrl.includes("from-script.m3u8"));

  console.log("altadefinizionez fixtures: OK");
}

run().catch((error) => {
  console.error("altadefinizionez fixtures: FAILED");
  console.error(error);
  process.exit(1);
});
