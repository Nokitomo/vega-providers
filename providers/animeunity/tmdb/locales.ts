import { TmdbLocalizedText } from "./types";

const ORIGINAL_LANGUAGE_LOCALES: Record<string, string> = {
  arabic: "ar-SA",
  chinese: "zh-CN",
  english: "en-US",
  french: "fr-FR",
  german: "de-DE",
  hindi: "hi-IN",
  italian: "it-IT",
  japanese: "ja-JP",
  korean: "ko-KR",
  portuguese: "pt-BR",
  russian: "ru-RU",
  spanish: "es-ES",
  thai: "th-TH",
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
