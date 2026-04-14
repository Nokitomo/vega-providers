const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const axios = require("axios");

const EXTENSION_FILE = path.join(
  __dirname,
  "..",
  "dist-shonenx",
  "javascript",
  "anime",
  "src",
  "it",
  "animeunity.js"
);

function toBodyString(data) {
  if (typeof data === "string") return data;
  if (data === null || data === undefined) return "";
  return JSON.stringify(data);
}

class MProvider {
  constructor() {
    this.source = {
      baseUrl: "https://www.animeunity.so",
      apiUrl: "",
    };
  }
}

class SharedPreferences {
  get() {
    return null;
  }
}

class Client {
  async get(url, headers) {
    const response = await axios.get(url, {
      headers: headers || {},
      validateStatus: () => true,
      maxRedirects: 0,
    });
    return {
      body: toBodyString(response.data),
      headers: response.headers || {},
      statusCode: response.status,
    };
  }

  async post(url, headers, body) {
    const response = await axios.post(url, body, {
      headers: headers || {},
      validateStatus: () => true,
      maxRedirects: 0,
    });
    return {
      body: toBodyString(response.data),
      headers: response.headers || {},
      statusCode: response.status,
    };
  }
}

async function run() {
  if (!fs.existsSync(EXTENSION_FILE)) {
    throw new Error(
      `Missing extension build output: ${EXTENSION_FILE}. Run npm run build first.`
    );
  }

  const code = fs.readFileSync(EXTENSION_FILE, "utf8");
  const sandbox = {
    console,
    MProvider,
    SharedPreferences,
    Client,
    setTimeout,
    clearTimeout,
  };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: EXTENSION_FILE });

  const ExtensionClass = vm.runInContext("DefaultExtension", sandbox);
  const extension = new ExtensionClass();

  const popular = await extension.getPopular(1);
  assert(popular && Array.isArray(popular.list), "popular.list must be an array");
  assert(popular.list.length > 0, "popular.list must not be empty");

  const search = await extension.search("naruto", 1, []);
  assert(search && Array.isArray(search.list), "search.list must be an array");
  assert(search.list.length > 0, "search.list must not be empty");

  const detail = await extension.getDetail(search.list[0].link);
  assert(detail && detail.name, "detail.name must exist");
  assert(Array.isArray(detail.chapters), "detail.chapters must be an array");
  assert(detail.chapters.length > 0, "detail.chapters must not be empty");

  const videos = await extension.getVideoList(detail.chapters[0].url);
  assert(Array.isArray(videos), "videos must be an array");
  assert(videos.length > 0, "videos must not be empty");

  console.log(
    JSON.stringify(
      {
        popularCount: popular.list.length,
        searchCount: search.list.length,
        title: detail.name,
        chaptersCount: detail.chapters.length,
        videosCount: videos.length,
        firstVideo: videos[0].url,
      },
      null,
      2
    )
  );
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});

