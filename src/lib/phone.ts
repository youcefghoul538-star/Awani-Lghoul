/** Normalise an Algerian number to local form (0XXXXXXXXX). Returns '' if it does not look valid. */
export function normalizeDzPhone(input: string): string {
  let s = input.replace(/[\s.\-()]/g, '')
  // Arabic-Indic digits → latin
  s = s.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
  if (s.startsWith('+213')) s = '0' + s.slice(4)
  else if (s.startsWith('00213')) s = '0' + s.slice(5)
  else if (s.startsWith('213') && s.length === 12) s = '0' + s.slice(3)
  return s
}

/** Mobile: 05/06/07 + 8 digits. Landline: 0 + [2-4] + 7 digits. */
export function isValidDzPhone(input: string): boolean {
  const s = normalizeDzPhone(input)
  return /^0[567]\d{8}$/.test(s) || /^0[234]\d{7}$/.test(s)
}

export function formatDzPhone(input: string): string {
  const s = normalizeDzPhone(input)
  if (/^0[567]\d{8}$/.test(s)) return s.replace(/^(\d{4})(\d{2})(\d{2})(\d{2})$/, '$1 $2 $3 $4')
  return s
}

export const isValidEmail = (s: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.trim())
