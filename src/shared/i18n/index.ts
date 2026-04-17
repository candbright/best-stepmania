import { computed, ref } from "vue";
import en from "./en";
import zh from "./zh";

export type Locale = "en" | "zh-CN";
export type TranslationKey = keyof typeof en;

const LOCALE_STORAGE_KEY = "locale";

function safeGetStorageItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch (error) {
    console.error("Failed to read locale from localStorage:", error);
    return null;
  }
}

function safeSetStorageItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch (error) {
    console.error("Failed to persist locale to localStorage:", error);
  }
}

function parseStoredLocale(raw: string | null): Locale {
  if (raw === "en" || raw === "zh-CN") return raw;
  return "zh-CN";
}

const messages: Record<Locale, Record<string, string>> = {
  en: en as unknown as Record<string, string>,
  "zh-CN": zh as unknown as Record<string, string>,
};

const currentLocale = ref<Locale>(parseStoredLocale(safeGetStorageItem(LOCALE_STORAGE_KEY)));

export function useI18n() {
  function t(key: string): string {
    return messages[currentLocale.value]?.[key] ?? messages.en[key] ?? key;
  }

  function setLocale(locale: Locale) {
    currentLocale.value = locale;
    safeSetStorageItem(LOCALE_STORAGE_KEY, locale);
  }

  const locale = computed(() => currentLocale.value);

  return { t, locale, setLocale };
}

export { currentLocale };
