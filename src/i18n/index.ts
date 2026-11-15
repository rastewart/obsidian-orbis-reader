import en, { TranslationKey, Translations } from './en';

declare const require: (id: string) => unknown;

let active: Translations = en;
let activeTokenAliases: Record<string, string> = {};
let activeFrontmatterAliases: Record<string, string> = {};
let activeLang = 'en';

export function initI18n(locale: string): void {
  const lang = locale.toLowerCase().split('-')[0]; // 'zh-cn' -> 'zh'
  try {
    // Dynamic require; esbuild bundles all locale files at build time.

    const mod = require(`./${lang}`) as {
      default: Partial<Translations>;
      tokenAliases?: Record<string, string>;
      frontmatterAliases?: Record<string, string>;
    };
    active = { ...en, ...mod.default }; // English fills any missing keys
    activeTokenAliases = mod.tokenAliases || {};
    activeFrontmatterAliases = mod.frontmatterAliases || {};
    activeLang = lang;
  } catch {
    active = en; // Unknown locale -> English
    activeTokenAliases = {};
    activeFrontmatterAliases = {};
    activeLang = 'en';
  }
}

/** The active UI language code (e.g. 'en'), resolved to a supported locale — 'en' today. Used to
 *  scope things like the system-voice list to the user's language. */
export function getActiveLang(): string {
  return activeLang;
}

export function t(key: TranslationKey, vars?: Record<string, string | number>): string {
  const raw = active[key] ?? en[key];
  if (!vars) return raw;
  return raw.replace(/\{\{(\w+)\}\}/g, (_, k: string) => String(vars[k] ?? ''));
}

export function resolveToken(rawToken: string): string {
  return activeTokenAliases[rawToken] ?? rawToken;
}

export function resolveFrontmatterKey(canonicalKey: string, setting: string): string {
  if (setting === 'english') return canonicalKey;
  const entry = Object.entries(activeFrontmatterAliases).find(([, v]) => v === canonicalKey);
  return entry ? entry[0] : canonicalKey;
}
