const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT_DIR = __dirname;
const TEMPLATE_FILE = path.join(ROOT_DIR, "shonenx-src", "animeunity.js");
const MANIFEST_FILE = path.join(ROOT_DIR, "manifest.json");
const OUTPUT_DIR = path.join(ROOT_DIR, "dist-shonenx");
const OUTPUT_JS_FILE = path.join(
  OUTPUT_DIR,
  "javascript",
  "anime",
  "src",
  "it",
  "animeunity.js"
);
const OUTPUT_INDEX_FILE = path.join(OUTPUT_DIR, "anime_index.json");

function normalizeTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}

function getProviderVersion() {
  try {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_FILE, "utf8"));
    const provider = Array.isArray(manifest)
      ? manifest.find((item) => item && item.value === "animeunity")
      : null;
    if (provider && provider.version) {
      return String(provider.version);
    }
  } catch (error) {
    console.warn(
      `[shonenx] Unable to read animeunity version from manifest: ${error.message}`
    );
  }
  return "1.0.0";
}

function parseRepoFromRemote(remoteUrl) {
  const normalized = String(remoteUrl || "").trim();
  if (!normalized) return null;

  let match = normalized.match(/^https?:\/\/github\.com\/([^/]+)\/([^/.]+)(?:\.git)?$/i);
  if (match) {
    return `${match[1]}/${match[2]}`;
  }

  match = normalized.match(/^git@github\.com:([^/]+)\/([^/.]+)(?:\.git)?$/i);
  if (match) {
    return `${match[1]}/${match[2]}`;
  }

  return null;
}

function getRawBaseUrl() {
  if (process.env.SHONENX_RAW_BASE) {
    return normalizeTrailingSlash(process.env.SHONENX_RAW_BASE);
  }

  let remoteUrl = "";
  try {
    remoteUrl = execSync("git remote get-url origin", {
      cwd: ROOT_DIR,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch (_) {
    remoteUrl = "";
  }

  const repo = parseRepoFromRemote(remoteUrl);
  if (!repo) {
    return "http://localhost:3001";
  }

  const ref = (process.env.SHONENX_REF || "main").trim() || "main";
  return `https://raw.githubusercontent.com/${repo}/${ref}`;
}

function buildAnimeIndex(version, sourceCodeUrl) {
  return [
    {
      name: "AnimeUnity",
      id: 4225767024,
      baseUrl: "https://www.animeunity.so",
      lang: "it",
      typeSource: "single",
      iconUrl:
        "https://www.google.com/s2/favicons?sz=256&domain=https://www.animeunity.so",
      dateFormat: "",
      dateFormatLocale: "",
      isNsfw: false,
      hasCloudflare: false,
      sourceCodeUrl,
      apiUrl: "",
      version,
      isManga: false,
      itemType: 1,
      isFullData: false,
      appMinVerReq: "0.5.0",
      additionalParams: "",
      sourceCodeLanguage: 1,
      notes: "generated from vega-providers",
    },
  ];
}

function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
}

function buildShonenxAnimeunity() {
  if (!fs.existsSync(TEMPLATE_FILE)) {
    throw new Error(`Missing template file: ${TEMPLATE_FILE}`);
  }

  const version = getProviderVersion();
  const template = fs.readFileSync(TEMPLATE_FILE, "utf8");
  const rendered = template.replace(/__ANIMEUNITY_VERSION__/g, version);

  const rawBaseUrl = getRawBaseUrl();
  const sourceCodeUrl = `${normalizeTrailingSlash(
    rawBaseUrl
  )}/dist-shonenx/javascript/anime/src/it/animeunity.js`;
  const animeIndex = buildAnimeIndex(version, sourceCodeUrl);

  ensureDir(OUTPUT_JS_FILE);
  fs.writeFileSync(OUTPUT_JS_FILE, rendered.endsWith("\n") ? rendered : `${rendered}\n`);

  ensureDir(OUTPUT_INDEX_FILE);
  fs.writeFileSync(
    OUTPUT_INDEX_FILE,
    `${JSON.stringify(animeIndex, null, 2)}\n`
  );

  console.log("[shonenx] built animeunity extension output");
  console.log(`[shonenx] version: ${version}`);
  console.log(`[shonenx] index: ${OUTPUT_INDEX_FILE}`);
  console.log(`[shonenx] source: ${OUTPUT_JS_FILE}`);
  console.log(`[shonenx] sourceCodeUrl: ${sourceCodeUrl}`);
}

buildShonenxAnimeunity();

