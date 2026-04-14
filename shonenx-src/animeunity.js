const mangayomiSources = [
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
    sourceCodeUrl: "",
    apiUrl: "",
    version: "__ANIMEUNITY_VERSION__",
    isManga: false,
    itemType: 1,
    isFullData: false,
    appMinVerReq: "0.5.0",
    additionalParams: "",
    sourceCodeLanguage: 1,
    notes: "generated from vega-providers",
  },
];

class DefaultExtension extends MProvider {
  constructor() {
    super();
    this.client = new Client();
    this.pageSize = 30;
    this.rangeSize = 120;
    this.specialLookahead = 30;
    this.sessionCache = null;
    this.sessionTtlMs = 5 * 60 * 1000;
  }

  get supportsLatest() {
    return true;
  }

  get baseUrl() {
    const sourceBase = this.source && this.source.baseUrl ? this.source.baseUrl : "";
    return this.normalizeBaseUrl(sourceBase || "https://www.animeunity.so");
  }

  getHeaders(url) {
    const base = this.baseUrl;
    const target = url && String(url).trim() ? String(url).trim() : base;
    return {
      Accept: "application/json",
      "User-Agent":
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
      Referer: base + "/",
      Origin: base,
      "X-Requested-With": "XMLHttpRequest",
      "Sec-Fetch-Site": "same-origin",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Dest": "empty",
      "Accept-Language": "it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7",
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
      "X-Target-Url": target,
    };
  }

  normalizeBaseUrl(value) {
    return String(value || "").replace(/\/+$/, "");
  }

  parseJsonSafe(raw, fallbackValue) {
    try {
      return JSON.parse(raw);
    } catch (e) {
      return fallbackValue;
    }
  }

  decodeSafe(value) {
    const text = String(value || "");
    if (!text) return "";
    try {
      return decodeURIComponent(text.replace(/\+/g, " "));
    } catch (e) {
      return text;
    }
  }

  toInt(value) {
    const parsed = Number.parseInt(String(value || ""), 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  toFloat(value) {
    const parsed = Number.parseFloat(String(value || "").replace(",", "."));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  extractAnimeId(url) {
    const direct = this.toInt(url);
    if (direct > 0) return direct;
    const text = String(url || "");
    const match = text.match(/\/anime\/(\d+)/);
    if (match && match[1]) return this.toInt(match[1]);
    return 0;
  }

  extractEpisodeId(url) {
    const direct = this.toInt(url);
    if (direct > 0) return String(direct);
    const text = String(url || "");
    const match = text.match(/(\d+)(?!.*\d)/);
    if (!match || !match[1]) return "";
    return String(this.toInt(match[1]));
  }

  pickTitle(anime) {
    if (!anime || typeof anime !== "object") return "";
    return (
      anime.title_eng ||
      anime.title ||
      anime.title_it ||
      anime.name ||
      ""
    ).toString();
  }

  decodeHtmlAttribute(value) {
    return String(value || "")
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">");
  }

  normalizeImageUrl(url) {
    const value = String(url || "").trim();
    if (!value) return "";
    if (value.includes("animeworld.so") || value.includes("forbiddenlol.cloud")) {
      const parts = value.split("/");
      const fileName = parts.length > 0 ? parts[parts.length - 1] : "";
      if (fileName) {
        return "https://img.animeunity.so/anime/" + fileName;
      }
    }
    return value;
  }

  buildAnimeLink(id, slug) {
    const animeId = this.toInt(id);
    if (!animeId) return "";
    const cleanSlug = String(slug || "").trim();
    if (!cleanSlug) return this.baseUrl + "/anime/" + animeId;
    return this.baseUrl + "/anime/" + animeId + "-" + cleanSlug;
  }

  mapStatus(rawStatus) {
    const status = String(rawStatus || "")
      .trim()
      .toLowerCase();
    if (!status) return 5;
    if (
      status.includes("complet") ||
      status.includes("terminat") ||
      status.includes("finished")
    ) {
      return 1;
    }
    if (
      status.includes("ongoing") ||
      status.includes("airing") ||
      status.includes("corso")
    ) {
      return 0;
    }
    return 5;
  }

  toGenres(rawGenres) {
    if (!Array.isArray(rawGenres)) return [];
    const list = [];
    for (let i = 0; i < rawGenres.length; i += 1) {
      const item = rawGenres[i];
      if (typeof item === "string" && item.trim()) {
        list.push(item.trim());
        continue;
      }
      if (item && typeof item === "object") {
        const name = String(item.name || "").trim();
        if (name) list.push(name);
      }
    }
    return Array.from(new Set(list));
  }

  toPost(anime) {
    if (!anime || typeof anime !== "object") return null;
    const id = anime.id;
    const title = this.pickTitle(anime);
    const link = this.buildAnimeLink(id, anime.slug);
    const imageUrl = this.normalizeImageUrl(anime.imageurl || anime.imageUrl);
    if (!title || !link || !imageUrl) return null;
    return {
      name: title,
      link: link,
      imageUrl: imageUrl,
    };
  }

  dedupeByLink(items) {
    const output = [];
    const seen = new Set();
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      if (!item || !item.link) continue;
      if (seen.has(item.link)) continue;
      seen.add(item.link);
      output.push(item);
    }
    return output;
  }

  extractCookieValue(rawCookie, name) {
    const text = String(rawCookie || "");
    if (!text) return "";
    const regex = new RegExp(name + "=([^;,\\s]+)");
    const match = text.match(regex);
    if (!match || !match[1]) return "";
    return this.decodeSafe(match[1]);
  }

  extractCsrfToken(html) {
    const match = String(html || "").match(
      /name=["']csrf-token["']\s+content=["']([^"']+)["']/i
    );
    return match && match[1] ? match[1] : "";
  }

  isSessionValid(session) {
    if (!session) return false;
    return Boolean(session.xsrfToken || session.session || session.csrfToken);
  }

  async fetchSessionFromHome() {
    const headers = this.getHeaders(this.baseUrl + "/");
    headers.Accept = "text/html,application/xhtml+xml";
    const response = await this.client.get(this.baseUrl + "/", headers);
    const html = String(response.body || "");
    const csrfToken = this.extractCsrfToken(html);

    const rawSetCookie =
      (response.headers &&
        (response.headers["set-cookie"] ||
          response.headers["Set-Cookie"] ||
          response.headers["set-Cookie"])) ||
      "";
    const cookieHeader = Array.isArray(rawSetCookie)
      ? rawSetCookie.join("; ")
      : String(rawSetCookie || "");

    return {
      xsrfToken: this.extractCookieValue(cookieHeader, "XSRF-TOKEN"),
      session: this.extractCookieValue(cookieHeader, "animeunity_session"),
      csrfToken: csrfToken,
      fetchedAt: Date.now(),
    };
  }

  async getSession(forceRefresh) {
    if (
      !forceRefresh &&
      this.sessionCache &&
      Date.now() - this.sessionCache.fetchedAt < this.sessionTtlMs &&
      this.isSessionValid(this.sessionCache)
    ) {
      return this.sessionCache;
    }

    const fetched = await this.fetchSessionFromHome();
    if (this.isSessionValid(fetched)) {
      this.sessionCache = fetched;
      return fetched;
    }

    return this.sessionCache || fetched;
  }

  buildSessionHeaders(baseHeaders, session) {
    const headers = Object.assign({}, baseHeaders || {});
    const token = (session && (session.xsrfToken || session.csrfToken)) || "";
    if (token) {
      headers["X-XSRF-TOKEN"] = token;
    }
    const cookies = [];
    if (token) cookies.push("XSRF-TOKEN=" + token);
    if (session && session.session) {
      cookies.push("animeunity_session=" + session.session);
    }
    if (cookies.length > 0) {
      headers.Cookie = cookies.join("; ");
    }
    return headers;
  }

  async requestArchive({ page, title, order, status, type, genres, dubbed, season }) {
    const payload = {
      title: title ? String(title).trim() : false,
      type: type || false,
      year: false,
      order: order || false,
      status: status || false,
      genres: Array.isArray(genres) && genres.length > 0 ? genres : false,
      offset: Math.max(0, (Math.max(1, page) - 1) * this.pageSize),
      dubbed: dubbed === true,
      season: season || false,
    };
    let session = await this.getSession(false);
    let headers = this.getHeaders(this.baseUrl);
    headers["Content-Type"] = "application/json";
    headers = this.buildSessionHeaders(headers, session);

    let response = await this.client.post(
      this.baseUrl + "/archivio/get-animes",
      headers,
      payload
    );
    let data = this.parseJsonSafe(response.body, { records: [], tot: 0 });
    let records = Array.isArray(data.records) ? data.records : [];

    if (!records.length) {
      session = await this.getSession(true);
      headers = this.getHeaders(this.baseUrl);
      headers["Content-Type"] = "application/json";
      headers = this.buildSessionHeaders(headers, session);
      response = await this.client.post(
        this.baseUrl + "/archivio/get-animes",
        headers,
        payload
      );
      data = this.parseJsonSafe(response.body, { records: [], tot: 0 });
      records = Array.isArray(data.records) ? data.records : [];
    }
    const list = [];
    for (let i = 0; i < records.length; i += 1) {
      const post = this.toPost(records[i]);
      if (post) list.push(post);
    }
    const total = this.toInt(data.tot);
    const offset = payload.offset;
    const hasNextPage = total > offset + records.length;
    return { list: list, hasNextPage: hasNextPage };
  }

  async parseHomeLatest(page) {
    const targetUrl =
      page > 1 ? this.baseUrl + "/?page=" + page : this.baseUrl + "/";
    const headers = this.getHeaders(targetUrl);
    headers.Accept = "text/html,application/xhtml+xml";
    const response = await this.client.get(targetUrl, headers);
    const html = String(response.body || "");
    if (!html) return { list: [], hasNextPage: false };

    const match = html.match(/<layout-items[^>]*items-json="([^"]+)"/i);
    if (!match || !match[1]) return { list: [], hasNextPage: false };

    const decoded = this.decodeHtmlAttribute(match[1]);
    const payload = this.parseJsonSafe(decoded, { data: [] });
    const items = Array.isArray(payload.data) ? payload.data : [];
    const list = [];

    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      const anime = item && item.anime ? item.anime : item;
      const post = this.toPost(anime);
      if (post) list.push(post);
    }

    return {
      list: this.dedupeByLink(list),
      hasNextPage: list.length >= this.pageSize,
    };
  }

  async getPopular(page) {
    return this.requestArchive({
      page: page,
      order: "most_viewed",
    });
  }

  async getLatestUpdates(page) {
    const latest = await this.parseHomeLatest(page);
    if (latest.list.length > 0) return latest;
    return this.requestArchive({
      page: page,
      order: "most_viewed",
    });
  }

  async search(query, page) {
    const normalized = String(query || "").trim();
    if (!normalized) return this.getPopular(page);

    const list = [];

    if (page === 1) {
      let session = await this.getSession(false);
      let headers = this.getHeaders(this.baseUrl);
      headers["Content-Type"] = "application/x-www-form-urlencoded";
      headers = this.buildSessionHeaders(headers, session);
      const body = "title=" + encodeURIComponent(normalized);
      let response = await this.client.post(
        this.baseUrl + "/livesearch",
        headers,
        body
      );
      let data = this.parseJsonSafe(response.body, { records: [] });
      let records = Array.isArray(data.records) ? data.records : [];
      if (!records.length) {
        session = await this.getSession(true);
        headers = this.getHeaders(this.baseUrl);
        headers["Content-Type"] = "application/x-www-form-urlencoded";
        headers = this.buildSessionHeaders(headers, session);
        response = await this.client.post(this.baseUrl + "/livesearch", headers, body);
        data = this.parseJsonSafe(response.body, { records: [] });
        records = Array.isArray(data.records) ? data.records : [];
      }
      for (let i = 0; i < records.length; i += 1) {
        const post = this.toPost(records[i]);
        if (post) list.push(post);
      }
    }

    const archive = await this.requestArchive({
      page: page,
      title: normalized,
    });
    for (let i = 0; i < archive.list.length; i += 1) {
      list.push(archive.list[i]);
    }

    return {
      list: this.dedupeByLink(list),
      hasNextPage: archive.hasNextPage,
    };
  }

  async getDetail(url) {
    const animeId = this.extractAnimeId(url);
    if (!animeId) {
      return {
        name: "",
        link: "",
        imageUrl: "",
        description: "",
        genre: [],
        status: 5,
        chapters: [],
      };
    }

    const infoResponse = await this.client.get(
      this.baseUrl + "/info_api/" + animeId + "/",
      this.getHeaders(this.baseUrl + "/")
    );
    const info = this.parseJsonSafe(infoResponse.body, {});
    const episodesCount = this.toInt(info.episodes_count);
    const chapters = await this.fetchEpisodes(animeId, episodesCount);

    return {
      name: this.pickTitle(info) || "Anime " + animeId,
      link: this.buildAnimeLink(animeId, info.slug),
      imageUrl: this.normalizeImageUrl(info.imageurl || info.cover || info.imageurl_cover),
      description: String(info.plot || "").trim(),
      genre: this.toGenres(info.genres),
      status: this.mapStatus(info.status),
      chapters: chapters,
    };
  }

  async fetchEpisodes(animeId, episodesCount) {
    if (!episodesCount || episodesCount < 1) return [];
    const episodes = [];
    const seen = new Set();

    const requestedLast = Math.max(1, episodesCount);
    const last = requestedLast + this.specialLookahead;
    let start = 0;

    while (start <= last) {
      const end = Math.min(start + this.rangeSize - 1, last);
      const rangeUrl =
        this.baseUrl +
        "/info_api/" +
        animeId +
        "/1?start_range=" +
        start +
        "&end_range=" +
        end;
      const response = await this.client.get(rangeUrl, this.getHeaders(this.baseUrl + "/"));
      const data = this.parseJsonSafe(response.body, { episodes: [] });
      const list = Array.isArray(data.episodes) ? data.episodes : [];

      for (let i = 0; i < list.length; i += 1) {
        const item = list[i];
        const id = item && item.id ? String(item.id) : "";
        if (!id || seen.has(id)) continue;
        seen.add(id);
        const number = String(item.number || "").trim();
        const parsedNumber = this.toFloat(number);
        episodes.push({
          name: number ? "Episode " + number : "Episode",
          url: id,
          dateUpload: "",
          isFiller: false,
          scanlator: "",
          thumbnailUrl: "",
          description: "",
          duration: "",
          episodeNumber: Number.isFinite(parsedNumber) && parsedNumber > 0 ? parsedNumber : undefined,
        });
      }

      start = end + 1;
    }

    return episodes;
  }

  getOrigin(url) {
    const value = String(url || "");
    const match = value.match(/^(https?:\/\/[^\/?#]+)/i);
    return match && match[1] ? match[1] : "";
  }

  normalizeUrl(value) {
    return String(value || "")
      .replace(/\\u([0-9a-fA-F]{4})/g, function (_, code) {
        return String.fromCharCode(parseInt(code, 16));
      })
      .replace(/\\\//g, "/")
      .replace(/&amp;/g, "&")
      .trim();
  }

  extractFirstUrl(value) {
    const match = String(value || "").match(/https?:\/\/[^\s"'<>]+/);
    return match && match[0] ? this.normalizeUrl(match[0]) : "";
  }

  parseQuery(url) {
    const query = {};
    const text = String(url || "");
    const qIndex = text.indexOf("?");
    if (qIndex < 0) return query;
    const hashIndex = text.indexOf("#", qIndex);
    const rawQuery =
      hashIndex >= 0 ? text.slice(qIndex + 1, hashIndex) : text.slice(qIndex + 1);
    if (!rawQuery) return query;
    const parts = rawQuery.split("&");
    for (let i = 0; i < parts.length; i += 1) {
      const part = parts[i];
      if (!part) continue;
      const kv = part.split("=");
      const key = decodeURIComponent((kv[0] || "").replace(/\+/g, " "));
      const value = decodeURIComponent((kv[1] || "").replace(/\+/g, " "));
      if (!key) continue;
      query[key] = value;
    }
    return query;
  }

  appendQuery(url, params) {
    const source = this.normalizeUrl(url);
    if (!source) return source;
    const hashIndex = source.indexOf("#");
    const hash = hashIndex >= 0 ? source.slice(hashIndex) : "";
    const baseWithQuery = hashIndex >= 0 ? source.slice(0, hashIndex) : source;
    const qIndex = baseWithQuery.indexOf("?");
    const base = qIndex >= 0 ? baseWithQuery.slice(0, qIndex) : baseWithQuery;
    const merged = this.parseQuery(baseWithQuery);
    const keys = Object.keys(params || {});
    for (let i = 0; i < keys.length; i += 1) {
      const key = keys[i];
      if (!params[key]) continue;
      if (!Object.prototype.hasOwnProperty.call(merged, key)) {
        merged[key] = params[key];
      }
    }
    const queryString = Object.keys(merged)
      .map(function (key) {
        return encodeURIComponent(key) + "=" + encodeURIComponent(merged[key]);
      })
      .join("&");
    return queryString ? base + "?" + queryString + hash : base + hash;
  }

  resolveUrl(rawUrl, baseUrl) {
    const value = this.normalizeUrl(rawUrl);
    if (!value) return "";
    if (value.startsWith("http://") || value.startsWith("https://")) return value;
    if (value.startsWith("//")) return "https:" + value;
    const origin = this.getOrigin(baseUrl);
    if (!origin) return value;
    if (value.startsWith("/")) return origin + value;
    return origin + "/" + value;
  }

  extractDownloadUrl(html) {
    const direct = String(html || "").match(/window\.downloadUrl\s*=\s*['"]([^'"]+)['"]/);
    if (direct && direct[1]) return this.normalizeUrl(direct[1]);
    const alt = String(html || "").match(/(https?:\/\/[^\s"'<>]+(?:mp4|m3u8)[^\s"'<>]*)/i);
    if (alt && alt[1]) return this.normalizeUrl(alt[1]);
    return "";
  }

  extractVixCloudStreams(html, embedUrl) {
    const output = [];
    const headers = {
      Accept: "*/*",
      "User-Agent": this.getHeaders(embedUrl)["User-Agent"],
      Referer: embedUrl,
      Origin: this.getOrigin(embedUrl),
    };

    const streamListMatch = String(html || "").match(/window\.streams\s*=\s*(\[[\s\S]*?\]);/);
    let streamList = [];
    if (streamListMatch && streamListMatch[1]) {
      try {
        streamList = JSON.parse(streamListMatch[1]);
      } catch (e) {
        streamList = [];
      }
    }

    const masterUrlMatch = String(html || "").match(
      /window\.masterPlaylist\s*=\s*{[\s\S]*?url\s*:\s*['"]([^'"]+)['"]/
    );
    const masterUrl = masterUrlMatch && masterUrlMatch[1] ? this.normalizeUrl(masterUrlMatch[1]) : "";

    const params = {};
    const tokenMatch = String(html || "").match(/['"]token['"]\s*:\s*'([^']+)'/);
    const expiresMatch = String(html || "").match(/['"]expires['"]\s*:\s*'([^']+)'/);
    const asnMatch = String(html || "").match(/['"]asn['"]\s*:\s*'([^']+)'/);
    if (tokenMatch && tokenMatch[1]) params.token = tokenMatch[1];
    if (expiresMatch && expiresMatch[1]) params.expires = expiresMatch[1];
    if (asnMatch && asnMatch[1]) params.asn = asnMatch[1];

    const embedParams = this.parseQuery(embedUrl);
    if (!params.token && embedParams.token) params.token = embedParams.token;
    if (!params.expires && embedParams.expires) params.expires = embedParams.expires;
    if (!params.asn && embedParams.asn) params.asn = embedParams.asn;
    if (!params.h && (String(html || "").includes("canPlayFHD") || embedParams.canPlayFHD || embedParams.h === "1")) {
      params.h = "1";
    }

    for (let i = 0; i < streamList.length; i += 1) {
      const item = streamList[i];
      const rawUrl = item && item.url ? this.resolveUrl(item.url, embedUrl) : "";
      if (!rawUrl) continue;
      const playlistUrl = this.appendQuery(rawUrl, params);
      output.push({
        url: playlistUrl,
        originalUrl: playlistUrl,
        quality: (item && item.name ? "AnimeUnity " + item.name : "AnimeUnity") + " - m3u8",
        headers: headers,
      });
    }

    if (output.length === 0 && masterUrl) {
      const resolvedMaster = this.resolveUrl(masterUrl, embedUrl);
      if (resolvedMaster) {
        const playlist = this.appendQuery(resolvedMaster, params);
        output.push({
          url: playlist,
          originalUrl: playlist,
          quality: "AnimeUnity - Master",
          headers: headers,
        });
      }
    }

    const unique = [];
    const seen = new Set();
    for (let i = 0; i < output.length; i += 1) {
      const item = output[i];
      if (!item.url || seen.has(item.url)) continue;
      seen.add(item.url);
      unique.push(item);
    }
    return unique;
  }

  async getVideoList(url) {
    const episodeId = this.extractEpisodeId(url);
    if (!episodeId) return [];

    const embedEndpoint = this.baseUrl + "/embed-url/" + episodeId;
    const embedHeaders = this.getHeaders(embedEndpoint);
    embedHeaders.Accept = "text/html,application/xhtml+xml";
    const embedResponse = await this.client.get(embedEndpoint, embedHeaders);

    const locationHeader =
      (embedResponse.headers && (embedResponse.headers.location || embedResponse.headers.Location)) || "";
    const body = String(embedResponse.body || "").trim();
    const embedUrl = this.normalizeUrl(
      locationHeader || this.extractFirstUrl(body) || body
    );
    if (!embedUrl || !embedUrl.startsWith("http")) return [];

    const playerHeaders = this.getHeaders(embedUrl);
    playerHeaders.Accept = "text/html,application/xhtml+xml";
    playerHeaders.Referer = embedEndpoint;
    const playerResponse = await this.client.get(embedUrl, playerHeaders);
    const html = String(playerResponse.body || "");

    const streams = this.extractVixCloudStreams(html, embedUrl);
    const downloadUrl = this.extractDownloadUrl(html);
    if (downloadUrl) {
      streams.push({
        url: downloadUrl,
        originalUrl: downloadUrl,
        quality: "AnimeUnity - Download",
        headers: playerHeaders,
      });
    }

    const unique = [];
    const seen = new Set();
    for (let i = 0; i < streams.length; i += 1) {
      const item = streams[i];
      if (!item || !item.url || seen.has(item.url)) continue;
      seen.add(item.url);
      unique.push(item);
    }
    return unique;
  }

  getFilterList() {
    return [];
  }

  getSourcePreferences() {
    return [];
  }
}
