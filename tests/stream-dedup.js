const assert = require("assert");
const { deduplicateStreams } = require("../dist/streamDedup.js");

const first = {
  server: "Server 1",
  link: "https://cdn.test/playlist/1?token=abc&amp;expires=123",
  type: "m3u8",
};
const duplicate = {
  server: "Duplicate",
  link: "https://cdn.test/playlist/1?token=abc&expires=123",
  type: "m3u8",
};
const alternateServer = {
  server: "Server 2",
  link: "https://cdn.test/playlist/1?token=abc&expires=123&ab=1",
  type: "m3u8",
};
const alternateOrder = {
  server: "Signed alternate",
  link: "https://cdn.test/playlist/1?expires=123&token=abc",
  type: "m3u8",
};

const output = deduplicateStreams([
  first,
  duplicate,
  alternateServer,
  alternateOrder,
  { server: "Invalid", link: "", type: "m3u8" },
]);

assert.deepStrictEqual(output, [first, alternateServer, alternateOrder]);
assert.strictEqual(output[0], first, "the first stream object must be preserved");
console.log("stream dedup: OK");
