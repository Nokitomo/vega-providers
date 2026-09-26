const LANGUAGE_NAME_TO_CODE: Record<string, string> = {
  english: "en",
  italiano: "it",
  italian: "it",
  japanese: "ja",
  日本語: "ja",
  spanish: "es",
  español: "es",
  french: "fr",
  français: "fr",
  german: "de",
  deutsch: "de",
  portuguese: "pt",
  português: "pt",
  korean: "ko",
  한국어: "ko",
  chinese: "zh",
  大陆简体: "zh",
  臺灣國語: "zh",
};

export function normalizeTvdbLanguage(value?: string): string | undefined {
  const text = String(value || "").trim();
  if (!text) return undefined;
  const lower = text.toLowerCase();
  if (/^[a-z]{2,3}(?:-[a-z]{2})?$/i.test(text)) {
    return lower.split("-")[0];
  }
  return LANGUAGE_NAME_TO_CODE[lower];
}

export function buildTvdbPosterLanguagePriority(
  originalLanguage?: string,
): string[] {
  return Array.from(
    new Set(
      ["it", "en", normalizeTvdbLanguage(originalLanguage)].filter(Boolean),
    ),
  ) as string[];
}

export function buildTvdbLogoLanguagePriority(): string[] {
  return ["it", "en"];
}

export function buildTvdbBackgroundLanguagePriority(
  originalLanguage?: string,
): string[] {
  return Array.from(
    new Set(
      ["it", "en", normalizeTvdbLanguage(originalLanguage)].filter(Boolean),
    ),
  ) as string[];
}
