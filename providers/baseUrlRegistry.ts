export const PASTEBIN_URL = "https://pastebin.com/raw/KgQ4jTy6";

export type PastebinProviderConfig = {
  match: RegExp;
  fallback: string;
};

export const PASTEBIN_PROVIDERS: Record<string, PastebinProviderConfig> = {
  animeunity: {
    match: /(?:^|\\.)animeunity\\./i,
    fallback: "https://www.animeunity.so",
  },
  streamingunity: {
    match: /(?:^|\\.)streamingunity\\./i,
    fallback: "https://streamingunity.tv",
  },
  guardaserietv: {
    match: /(?:^|\\.)guardaserietv\\./i,
    fallback: "https://guardaserietv.biz",
  },
};
