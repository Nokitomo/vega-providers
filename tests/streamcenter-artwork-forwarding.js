const assert = require("assert");
const fs = require("fs");
const path = require("path");
const ts = require("typescript");
const routing = require("../dist/streamcenter/routing.js");

const source = fs.readFileSync(
  path.join(__dirname, "../providers/streamcenter/meta.ts"),
  "utf8"
);
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const artworkCalls = [];
const modules = {
  "../animeunity/meta": {
    getArtwork: async (args) => {
      artworkCalls.push(args);
      return { poster: "https://image.tmdb.org/t/p/w300/poster.jpg", resolved: true };
    },
  },
  "../streamingunity/meta": {},
  "./content": {},
  "./routing": routing,
};
const moduleExports = {};
new Function("require", "exports", compiled)(
  (id) => {
    assert(Object.hasOwn(modules, id), `Unexpected module: ${id}`);
    return modules[id];
  },
  moduleExports
);

(async () => {
  const providerContext = { kvStore: { get: async () => undefined } };
  const hints = { anilistId: 123, malId: 456, isMovie: false };
  const sourceLink = "https://www.animeunity.to/anime/42-example";
  const result = await moduleExports.getArtwork({
    link: routing.encodeRoute("meta", "animeunity", { url: sourceLink }),
    fields: ["poster"],
    failedUrls: ["https://cdn.example/failed.jpg"],
    hints,
    imageSize: "w300",
    providerContext,
  });
  assert.strictEqual(result.resolved, true);
  assert.deepStrictEqual(artworkCalls, [{
    link: sourceLink,
    fields: ["poster"],
    failedUrls: ["https://cdn.example/failed.jpg"],
    hints,
    imageSize: "w300",
    providerContext,
  }]);

  const streamingResult = await moduleExports.getArtwork({
    link: "https://streamingunity.example/it/titles/42-example",
    fields: ["poster"],
    providerContext,
  });
  assert.deepStrictEqual(streamingResult, { resolved: false });
  assert.strictEqual(artworkCalls.length, 1);
  console.log("StreamCenter artwork forwarding: OK");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
