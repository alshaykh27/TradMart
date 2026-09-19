import { ar } from "./ar";
import { en } from "./en";
import { defaultLocale, type Locale } from "./config";
import type { Dictionary } from "./dictionary";

const dictionaries: Record<Locale, Dictionary> = { ar, en };

export function getDictionary(locale: Locale = defaultLocale): Dictionary {
  return dictionaries[locale];
}

export { ar, en };
export { defaultLocale, direction, locales, localeNames } from "./config";
export type { Locale } from "./config";
export type { Dictionary } from "./dictionary";
