import { useCallback, useEffect } from 'react'
import { fr, type TKey } from './fr'
import { en } from './en'
import { ar } from './ar'
import { langStore } from '../state/cart'
import { useStore } from '../data/store'
import { formatDZD, loc } from '../lib/format'
import type { Lang, LocalText } from '../types'

export type { TKey }
const DICTS: Record<Lang, Record<TKey, string>> = { fr, en, ar }

export const LANGS: { code: Lang; label: string }[] = [
  { code: 'fr', label: 'Français' },
  { code: 'ar', label: 'العربية' },
  { code: 'en', label: 'English' },
]

export function useI18n() {
  const lang = useStore(langStore)
  const t = useCallback(
    (key: TKey, vars?: Record<string, string | number>) => {
      let s = DICTS[lang][key] ?? fr[key] ?? key
      if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v))
      return s
    },
    [lang],
  )
  return {
    lang,
    dir: lang === 'ar' ? ('rtl' as const) : ('ltr' as const),
    t,
    setLang: (l: Lang) => langStore.set(l),
    money: (n: number) => formatDZD(n, lang),
    L: (text: LocalText | undefined) => loc(text, lang),
  }
}

/** Keeps <html lang dir> in sync with the selected language. Mount once. */
export function useDocumentLang() {
  const lang = useStore(langStore)
  useEffect(() => {
    document.documentElement.lang = lang
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'
  }, [lang])
}
