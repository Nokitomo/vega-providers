const assert = require("assert");
const catalogModule = require("../dist/animeunity/catalog.js");
const filters = require("../dist/animeunity/filters.js");

const catalogByFilter = new Map(
  catalogModule.catalog.map((entry) => [entry.filter, entry])
);
assert(catalogByFilter.has("latest"));
assert(catalogByFilter.has("calendar"));
assert(catalogByFilter.has("top?status=ongoing"));
assert(catalogByFilter.has("top?status=upcoming"));
assert(catalogByFilter.has("top?order=rating"));
assert(catalogByFilter.has("archive?random=true"));
assert.strictEqual(catalogByFilter.get("archive?random=true").titleKey, "Random");

assert(catalogModule.genres.length > 40);
assert(
  catalogModule.genres.every(
    (genre) => genre.title && genre.titleKey && genre.filter
  )
);
assert.strictEqual(catalogModule.archiveFilters.random.titleKey, "Random");

assert.strictEqual(filters.normalizeArchiveType("Film"), "Movie");
assert.strictEqual(filters.normalizeArchiveType("TV Short"), "TV Short");
assert.strictEqual(filters.normalizeArchiveStatus("In corso"), "In Corso");
assert.strictEqual(filters.normalizeArchiveStatus("Completed"), "Terminato");
assert.strictEqual(filters.normalizeArchiveSeason("Fall"), "Autunno");
assert.strictEqual(filters.normalizeArchiveOrder("Popularity"), "Popolarità");
assert.strictEqual(filters.normalizeTopOrder("Most Viewed"), "most_viewed");
assert.strictEqual(
  filters.normalizeTopStatus("Coming Soon"),
  "In uscita prossimamente"
);
assert.strictEqual(filters.resolveArchiveGenreId("Sci-fi"), 40);

console.log("animeunity catalog filters: OK");
