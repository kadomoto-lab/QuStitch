import { Upload } from "lucide-react"
import { useRef } from "react"
import { Button } from "@/components/ui/button"
import { SAMPLE_FILES } from "@/data/sampleFiles"
import { useCompactHeader } from "@/hooks/useCompactHeader"
import { LANGUAGE_NAMES, type Language } from "@/i18n/messages"
import { useI18n } from "@/i18n/useI18n"

interface AppHeaderProps {
  subtitle: string
  action: {
    label: string
    onClick: () => void
    disabled?: boolean
  }
  selectedSample: string
  onSampleChange: (sampleId: string) => void
  onFileSelected: (file: File) => void
}

const SELECT_CLASS =
  "h-10 rounded-lg border border-blue-200 bg-white/80 px-3 text-sm shadow-sm backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-blue-400"

const LANGUAGES: Language[] = ["en", "ja"]

/** Sticky header with the view switch, language and sample selectors, and JSON upload. */
export function AppHeader({
  subtitle,
  action,
  selectedSample,
  onSampleChange,
  onFileSelected,
}: AppHeaderProps) {
  const { t, language, setLanguage } = useI18n()
  const isCompact = useCompactHeader()
  const fileInputRef = useRef<HTMLInputElement>(null)

  return (
    <header
      className={`sticky top-0 z-10 border-b border-blue-200/50 bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 transition-all ${
        isCompact ? "py-3" : "pb-6 pt-2"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex-1">
          <h1
            className={`bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text font-bold tracking-tight text-transparent transition-all ${
              isCompact ? "text-xl" : "text-3xl"
            }`}
          >
            {t.common.appTitle}
          </h1>
          {!isCompact && <p className="mt-2 text-slate-600">{subtitle}</p>}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={action.onClick}
            disabled={action.disabled}
            className="border-blue-200 hover:bg-blue-50"
          >
            {action.label}
          </Button>
          <span className="text-slate-300">|</span>
          <select
            value={language}
            onChange={(event) => setLanguage(event.target.value as Language)}
            className={SELECT_CLASS}
            aria-label={t.header.language}
          >
            {LANGUAGES.map((code) => (
              <option key={code} value={code}>
                {LANGUAGE_NAMES[code]}
              </option>
            ))}
          </select>
          <span className="text-slate-300">|</span>
          <select
            value={selectedSample}
            onChange={(event) => onSampleChange(event.target.value)}
            className={SELECT_CLASS}
            aria-label={t.header.sample}
          >
            {SAMPLE_FILES.map((sample) => (
              <option key={sample.id} value={sample.id}>
                {sample.name}
              </option>
            ))}
          </select>
          <span className="text-slate-300">|</span>
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            className="gap-2 border-blue-200 hover:bg-blue-50"
          >
            <Upload className="h-4 w-4" />
            {t.common.uploadJson}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) onFileSelected(file)
              event.target.value = ""
            }}
            className="hidden"
          />
        </div>
      </div>
    </header>
  )
}
