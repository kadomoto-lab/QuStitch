import { useMemo, useState, type ReactNode } from "react"
import { detectLanguage, I18nContext, type I18nContextValue } from "./context"
import { messages, type Language } from "./messages"

interface LanguageProviderProps {
  children: ReactNode
  initialLanguage?: Language
}

export function LanguageProvider({ children, initialLanguage }: LanguageProviderProps) {
  const [language, setLanguage] = useState<Language>(initialLanguage ?? detectLanguage)
  const value = useMemo<I18nContextValue>(
    () => ({ language, setLanguage, t: messages[language] }),
    [language]
  )
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}
