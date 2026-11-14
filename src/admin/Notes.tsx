import { useState } from 'react'
import { formatDate } from '../lib/format'
import { uid } from '../lib/ids'
import type { Note } from '../types'

export function Notes({ notes, onAdd }: { notes: Note[]; onAdd: (n: Note) => void }) {
  const [text, setText] = useState('')
  return (
    <div className="notes">
      <h3>Notes internes</h3>
      <p className="muted small">Visibles uniquement par l’équipe.</p>
      <ul className="notes__list">
        {[...notes].reverse().map((n) => (
          <li key={n.id}>
            <small className="muted">{formatDate(n.at, 'fr')}</small>
            <div>{n.text}</div>
          </li>
        ))}
        {notes.length === 0 && <li className="muted">Aucune note.</li>}
      </ul>
      <div className="notes__add">
        <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Ajouter une note…" aria-label="Nouvelle note" />
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          disabled={!text.trim()}
          onClick={() => {
            onAdd({ id: uid('n'), at: new Date().toISOString(), text: text.trim() })
            setText('')
          }}
        >
          Ajouter
        </button>
      </div>
    </div>
  )
}
