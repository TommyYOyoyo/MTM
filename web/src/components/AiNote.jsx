import { useEffect, useId, useRef, useState } from 'react'

const AI_NOTE = 'AI tools (Anthropic Claude, OpenAI ChatGPT, and Google Gemini) were used to assist in the code creation, debugging, and research-phase of this project. All results were reviewed and cross-referenced by the team.'

// tiny "AI" button in the footer --> click for our ai disclosure
export default function AiNote() {
  const [open, setOpen] = useState(false)
  const box = useRef(null)
  const noteId = useId()

  // close on outside click or escape
  useEffect(() => {
    if (!open) return undefined
    const onPointer = (event) => { if (!box.current?.contains(event.target)) setOpen(false) }
    const onKey = (event) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return <span className="ai-note" ref={box}>
    <button className="ai-note-button" type="button" aria-expanded={open} aria-controls={noteId} aria-label="AI disclosure" title="AI disclosure" onClick={() => setOpen((value) => !value)}>AI</button>
    {open && <span className="ai-note-card" id={noteId} role="note">{AI_NOTE}</span>}
  </span>
}
