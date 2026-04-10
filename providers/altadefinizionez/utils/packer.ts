const PACKER_REGEX =
  /eval\(function\(p,a,c,k,e,d\)\{[\s\S]*?return p\}\(\s*(['"])([\s\S]*?)\1\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(['"])([\s\S]*?)\5\.split\('\|'\)\s*(?:,\s*[\s\S]*?)?\)\)/i;

const unescapePackerString = (value: string): string =>
  value.replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\\\/g, "\\");

export const unpackPacker = (html: string): string => {
  const match = html.match(PACKER_REGEX);
  if (!match) return "";

  const payload = unescapePackerString(match[2]);
  const base = Number.parseInt(match[3], 10);
  const count = Number.parseInt(match[4], 10);
  const dictionary = unescapePackerString(match[6]).split("|");

  if (
    !Number.isFinite(base) ||
    !Number.isFinite(count) ||
    base < 2 ||
    base > 36
  ) {
    return "";
  }

  let decoded = payload;
  for (let index = count - 1; index >= 0; index -= 1) {
    const value = dictionary[index];
    if (!value) continue;
    const token = index.toString(base);
    const regex = new RegExp(`\\b${token}\\b`, "g");
    decoded = decoded.replace(regex, value);
  }

  return decoded;
};

export const extractPackedStreamUrl = (decoded: string): string => {
  if (!decoded) return "";
  const m3u8Match = decoded.match(/https?:[^"'\s]+\.m3u8[^"'\s]*/i);
  if (m3u8Match) return m3u8Match[0];
  const mp4Match = decoded.match(/https?:[^"'\s]+\.mp4[^"'\s]*/i);
  return mp4Match ? mp4Match[0] : "";
};
