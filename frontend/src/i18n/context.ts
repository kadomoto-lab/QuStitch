import { createContext } from "react"
import type { Language, Messages } from "./messages"

export interface I18nContextValue {
  language: Language
  setLanguage: (language: Language) => void
  t: Messages
}

export const I18nContext = createContext<I18nContextValue | null>(null)

/** Pick Japanese for Japanese browsers, English otherwise. */
export function detectLanguage(): Language {
  if (typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("ja")) {
    return "ja"
  }
  return "en"
}
