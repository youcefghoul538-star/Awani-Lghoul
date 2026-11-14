import { useId, type ReactNode } from 'react'
import { useI18n } from '../i18n'
import { WILAYAS, wilayaLabel, wilayaValue } from '../data/wilayas'

interface FieldProps {
  label: string
  error?: string
  hint?: string
  required?: boolean
  children: (a: { id: string; describedBy?: string; invalid: boolean }) => ReactNode
}

/** Accessible label + control + hint/error wiring. */
export function Field({ label, error, hint, required, children }: FieldProps) {
  const id = useId()
  const msgId = `${id}-msg`
  const describedBy = error || hint ? msgId : undefined
  return (
    <div className={error ? 'field field--error' : 'field'}>
      <label htmlFor={id}>
        {label}
        {required && (
          <span className="req" aria-hidden="true">
            {' '}
            *
          </span>
        )}
      </label>
      {children({ id, describedBy, invalid: !!error })}
      {(error || hint) && (
        <div id={msgId} className={error ? 'field__msg field__msg--error' : 'field__msg'} role={error ? 'alert' : undefined}>
          {error || hint}
        </div>
      )}
    </div>
  )
}

export function WilayaSelect({
  id,
  value,
  onChange,
  invalid,
  describedBy,
}: {
  id: string
  value: string
  onChange: (v: string) => void
  invalid: boolean
  describedBy?: string
}) {
  const { t, lang } = useI18n()
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-invalid={invalid}
      aria-describedby={describedBy}
      autoComplete="address-level1"
    >
      <option value="">{t('checkout.wilayaPick')}</option>
      {WILAYAS.map((w) => (
        <option key={w.code} value={wilayaValue(w)}>
          {wilayaLabel(w, lang)}
        </option>
      ))}
    </select>
  )
}
