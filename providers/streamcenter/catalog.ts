import {
  archiveFilters as animeArchiveFilters,
  catalog as animeCatalog,
  genres as animeGenres,
} from "../animeunity/catalog";
import {
  catalog as streamingCatalog,
  genres as streamingGenres,
} from "../streamingunity/catalog";
import { encodeFilterRoute } from "./routing";

const animeRows = new Map(animeCatalog.map((item) => [item.filter, item]));
const streamingRows = new Map(
  streamingCatalog.map((item) => [item.filter, item])
);

const sourceRow = (
  source: "animeunity" | "streamingunity",
  filter: string,
  title: string
) => {
  const item =
    source === "animeunity" ? animeRows.get(filter) : streamingRows.get(filter);
  return {
    title,
    filter: encodeFilterRoute(source, filter),
    staleTimeMs: item?.staleTimeMs,
  };
};

export const catalog = [
  {
    title: "StreamCenter · Archivio completo",
    filter: "archive",
    staleTimeMs: 6 * 60 * 60 * 1000,
  },
  sourceRow("animeunity", "latest", "Anime · Ultimi episodi"),
  sourceRow("animeunity", "top?popular=true", "Anime · Popolari"),
  sourceRow("animeunity", "top?status=ongoing", "Anime · In corso"),
  sourceRow("animeunity", "archive?order=rating", "Anime · Più votati"),
  sourceRow("animeunity", "archive?type=movie&order=rating", "Anime · Film"),
  {
    title: "Anime · Calendario",
    filter: "calendar",
    staleTimeMs: animeRows.get("calendar")?.staleTimeMs,
  },
  sourceRow("streamingunity", "browse/trending", "Film e serie · Di tendenza"),
  sourceRow(
    "streamingunity",
    "browse/latest",
    "Film e serie · Aggiunti di recente"
  ),
  sourceRow("streamingunity", "browse/top10", "Film e serie · Top 10 oggi"),
  sourceRow("streamingunity", "browse/upcoming", "Film e serie · In arrivo"),
  sourceRow("streamingunity", "archive?type=movie", "Film"),
  sourceRow("streamingunity", "archive?type=tv", "Serie TV"),
  {
    title: "StreamCenter · Scelti per te",
    filter: "catalog/all?random=true",
    staleTimeMs: 0,
  },
];

export const genres = [
  ...animeGenres.map((item) => ({
    title: `Anime · ${item.title}`,
    filter: encodeFilterRoute("animeunity", item.filter),
  })),
  ...streamingGenres.map((item) => ({
    title: `Film e serie · ${item.title}`,
    filter: encodeFilterRoute("streamingunity", item.filter),
  })),
];

// Vega currently renders the AnimeUnity filter fields (title, year, order,
// status, type, season, genres, dubbed and random). StreamCenter maps the
// common fields to both sources and keeps anime-only fields on AnimeUnity.
export const archiveFilters = animeArchiveFilters;
