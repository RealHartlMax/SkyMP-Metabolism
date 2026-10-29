import fs from 'node:fs';
import path from 'node:path';
import de from '../locales/de.json';
import en from '../locales/en.json';
import { STATS, type MetabolismConfig, type MetabolismSnapshot, type Locale } from './domain/types';
import { check, keys, object } from './domain/validation';
import { severityFromValue } from './engine/thresholds';
export type TranslationKey = keyof typeof de;
export function createLocalizer(defaultLocale: Locale = 'de', overrides: unknown = {}) {
  object(overrides); keys(overrides, ['de', 'en']);
  const catalogs = { de: { ...de }, en: { ...en } };
  for (const language of ['de', 'en'] as const) {
    const values = overrides[language]; if (values === undefined) continue;
    object(values); keys(values, Object.keys(de));
    for (const [key, value] of Object.entries(values)) {
      check(typeof value === 'string' && value.trim().length > 0 && value.length <= 240 &&
        !/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u.test(value), 'Invalid locale string: ' + key);
      catalogs[language][key as TranslationKey] = value;
    }
  }
  for (const catalog of Object.values(catalogs)) {
    check(catalog.statusDescription.length <= 180, 'Chat description exceeds API limit');
    for (const stat of STATS) check((catalog[stat] + ' (' + catalog[(stat + 'Hint') as TranslationKey] + ')').length <= 160,
      'Translated widget label exceeds UI Core API limit');
  }
  function locale(value?: string): Locale {
    return value?.toLowerCase().startsWith('en') ? 'en' : value?.toLowerCase().startsWith('de') ? 'de' : defaultLocale;
  }
  return {
    locale,
    t(key: TranslationKey, language?: string) { return catalogs[locale(language)][key]; },
    number(value: number, language?: string) { return new Intl.NumberFormat(locale(language), { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(value); },
  };
}
export type Localizer = ReturnType<typeof createLocalizer>;
export function readLocaleFiles(directory: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const lang of ['de', 'en']) {
    const filename = path.join(directory, lang + '.json');
    if (!fs.existsSync(filename)) continue;
    check(fs.statSync(filename).size <= 16384, 'Locale exceeds 16 KiB: ' + lang);
    result[lang] = JSON.parse(fs.readFileSync(filename, 'utf8'));
  }
  return result;
}
export function statusLines(s: Readonly<MetabolismSnapshot>, c: MetabolismConfig, l: Localizer, locale: string) {
  return STATS.map(stat => ({ label: l.t(stat, locale), hint: l.t((stat + 'Hint') as TranslationKey, locale),
    value: l.number(s[stat], locale) + '/100', severity: severityFromValue(s[stat], c.thresholds),
  }));
}
