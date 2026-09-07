import { useContext } from "react"
import { I18nContext, type I18nContextValue } from "./context"

/** Current language, a setter, and the message dictionary for that language. */
export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext)
  if (!context) throw new Error("useI18n must be used within a LanguageProvider")
  return context
}
