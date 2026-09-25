import { TmdbLocalizedText } from "./types";

const ORIGINAL_LANGUAGE_LOCALES: Record<string, string> = {
  arabic: "ar-SA",
  arabo: "ar-SA",
  chinese: "zh-CN",
  cinese: "zh-CN",
  english: "en-US",
  inglese: "en-US",
  french: "fr-FR",
  francese: "fr-FR",
  german: "de-DE",
  tedesco: "de-DE",
  hindi: "hi-IN",
  italian: "it-IT",
  italiano: "it-IT",
  japanese: "ja-JP",
  giapponese: "ja-JP",
  korean: "ko-KR",
  coreano: "ko-KR",
  portuguese: "pt-BR",
  portoghese: "pt-BR",
  russian: "ru-RU",
  russo: "ru-RU",
  spanish: "es-ES",
  spagnolo: "es-ES",
  thai: "th-TH",
  thailandese: "th-TH",
};

export const TMDB_PRIMARY_LOCALE = "it-IT";
export const TMDB_ENGLISH_LOCALE = "en-US";
export const TMDB_NO_LANGUAGE_LOCALE = "xx-XX";

export function resolveOriginalLocale(
  originalLanguageName?: string
): string | undefined {
  const normalized = String(originalLanguageName || "").trim().toLowerCase();
  return ORIGINAL_LANGUAGE_LOCALES[normalized];
}

export function buildLocalePriority(originalLocale?: string): string[] {
  return Array.from(
    new Set(
      [
        TMDB_PRIMARY_LOCALE,
        TMDB_ENGLISH_LOCALE,
        originalLocale,
        TMDB_NO_LANGUAGE_LOCALE,
      ].filter((locale): locale is string => !!locale)
    )
  );
}

export function languageCodeFromLocale(locale: string): string {
  if (locale === TMDB_NO_LANGUAGE_LOCALE) return "xx";
  return locale.split("-")[0]?.toLowerCase() || "xx";
}

export function pickLocalizedText<T>(
  values: T[],
  readValue: (value: T) => string | undefined,
  readLocale: (value: T) => string
): TmdbLocalizedText | undefined {
  for (const item of values) {
    const value = String(readValue(item) || "").trim();
    if (value) return { value, language: readLocale(item) };
  }
  return undefined;
}
