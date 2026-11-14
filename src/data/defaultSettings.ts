import type { Settings } from '../types'

/**
 * Neutral defaults used only until real settings are loaded from Supabase (or entered in the admin).
 * Contains NO product, price, stock or contact data and no marketing claim: every business detail is empty
 * until the owner provides it.
 */
export const DEFAULT_SETTINGS: Settings = {
  id: 'settings',
  businessName: "AWANI L'GHOUL",
  tagline: '',
  phone: '',
  whatsapp: '',
  email: '',
  address: '',
  hours: '',
  promoText: { fr: '', ar: '', en: '' },
  lowStockThreshold: 10,
}
