const assert = require("assert");
const {selectUnfailedLogo} = require("../dist/animeunity/logoFallback.js");

assert.strictEqual(
  selectUnfailedLogo("https://logos.test/preferred.png", ["https://logos.test/preferred.png"]),
  undefined,
);
assert.strictEqual(
  selectUnfailedLogo("https://logos.test/fallback.png", ["https://logos.test/preferred.png"]),
  "https://logos.test/fallback.png",
);
assert.strictEqual(selectUnfailedLogo("file:///logo.png", []), undefined);
assert.strictEqual(selectUnfailedLogo("http://logos.test/logo.png", []), undefined);
console.log("animeunity logo fallback: OK");
