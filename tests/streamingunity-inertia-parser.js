const assert = require("assert");
const cheerio = require("cheerio");
const { extractInertiaPage, decodeHtmlEntities } = require("../dist/streamingunity/utils.js");

const previousParser = (html) => {
  const $ = cheerio.load(html);
  const raw = $("#app[data-page]").first().attr("data-page") ||
    $("div[data-page]").first().attr("data-page") || "";
  if (!raw) return null;
  const decoded = decodeHtmlEntities(raw);
  try { return JSON.parse(decoded); } catch (_) {
    try { return JSON.parse(decodeHtmlEntities(decoded)); } catch (_) { return null; }
  }
};

const payloads = [
  { props: { title: "A & B", synopsis: "A > B", episodes: [1, 2, 3] } },
  { props: { title: "l'été", artwork: "https://example.test/a?b=1&c=2" } },
];
const examples = [];
for (const payload of payloads) {
  const encoded = JSON.stringify(payload).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  examples.push(`<html><body><div class="app" data-page="${encoded}" id="app"></div></body></html>`);
  examples.push(`<div id='app' data-page='${JSON.stringify(payload).replace(/'/g, "&#39;")}'></div>`);
  examples.push(`<div id="app" data-page="${encoded.replace(/&quot;/g, "&amp;quot;")}"></div>`);
  examples.push(`<main id="app" data-page="${encoded}"></main>`);
  examples.push(`<main id="app" data-page="${encoded}"></main><div id="app" data-page="{&quot;props&quot;:{}}"></div>`);
  examples.push(`<div data-page="${encoded}"></div>`);
}
examples.push('<div id="app" data-page="{&quot;props&quot;:{&quot;title&quot;:&quot;A&nbsp;B&quot;}}"></div>');
examples.push('<div id="app" data-page="invalid"></div>');

let loads = 0;
const countedCheerio = { load: (...args) => { loads += 1; return cheerio.load(...args); } };
for (const html of examples) {
  assert.deepStrictEqual(extractInertiaPage(html, countedCheerio), previousParser(html));
}
assert.strictEqual(loads, 8, "normal app roots should avoid the full HTML parse");
console.log("streamingunity inertia parser: OK");
