import React, { useRef, useState, useCallback, useEffect } from 'react'
import { useNotesStore, serialiseData } from '../store/useNotesStore'

function timeAgo(iso) {
  if (!iso) return null
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return new Date(iso).toLocaleDateString()
}

export default function SaveBar() {
  const { isDirty, lastSavedAt, importData } = useNotesStore()
  const fileRef = useRef(null)

  const [saving, setSaving] = useState(false)
  const [flash, setFlash] = useState(null) // { type: 'ok'|'err', msg }
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState(null)
  const [devMode, setDevMode] = useState(false)

  // Probe once on mount to see if the save server is available
  useEffect(() => {
    fetch('/api/save', { method: 'HEAD' })
      .then(() => setDevMode(true))
      .catch(() => setDevMode(false))
  }, [])

  const showFlash = (type, msg) => {
    setFlash({ type, msg })
    setTimeout(() => setFlash(null), 2500)
  }

  const handleSave = useCallback(async () => {
    const { notes, folders } = useNotesStore.getState()
    const payload = JSON.parse(serialiseData(notes, folders))

    setSaving(true)
    try {
      if (devMode) {
        const res = await fetch('/api/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) throw new Error('Server error')
        useNotesStore.setState({ isDirty: false, lastSavedAt: new Date().toISOString() })
        showFlash('ok', 'Saved ✓')
      } else {
        // Production / no server: download the file
        const blob = new Blob([serialiseData(notes, folders)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url; a.download = 'notes-data.json'; a.click()
        URL.revokeObjectURL(url)
        useNotesStore.setState({ isDirty: false, lastSavedAt: new Date().toISOString() })
        showFlash('ok', 'Downloaded notes-data.json')
      }
    } catch {
      showFlash('err', 'Save failed')
    } finally {
      setSaving(false)
    }
  }, [devMode])

  // Ctrl+S / Cmd+S shortcut
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        handleSave()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleSave])

  const handleImport = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true); setImportError(null)
    const reader = new FileReader()
    reader.onload = (ev) => {
      const ok = importData(ev.target.result)
      setImporting(false)
      if (!ok) setImportError('Invalid file format.')
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const dotClass = flash?.type === 'err' ? 'bg-red-500'
    : flash?.type === 'ok'  ? 'bg-emerald-500'
    : saving                ? 'bg-amber-400 animate-pulse'
    : isDirty               ? 'bg-amber-400'
    :                         'bg-emerald-500'

  const statusText = flash ? (
    <span className={flash.type === 'err' ? 'text-red-400' : 'text-emerald-400'}>
      {flash.msg}
    </span>
  ) : saving ? (
    <span className="text-zinc-500">Saving…</span>
  ) : isDirty ? (
    <span className="text-zinc-600">Unsaved changes</span>
  ) : lastSavedAt ? (
    <span className="text-zinc-600">Saved {timeAgo(lastSavedAt)}</span>
  ) : (
    <span className="text-zinc-700">Changes stored in browser</span>
  )

  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b border-zinc-800 bg-surface-950 shrink-0">
      {/* Status */}
      <div className="flex items-center gap-1.5 flex-1 min-w-0">
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 transition-colors ${dotClass}`} />
        <span className="text-xs truncate">{statusText}</span>
      </div>

      {importError && (
        <span className="text-xs text-red-400 truncate max-w-[160px]">{importError}</span>
      )}

      {/* Import */}
      <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={handleImport} />
      <button
        onClick={() => fileRef.current?.click()}
        disabled={importing}
        title="Load a notes-data.json into the app"
        className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-200 px-2.5 py-1.5 rounded-md hover:bg-zinc-800 border border-transparent hover:border-zinc-700 transition-colors disabled:opacity-40"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
        </svg>
        Import
      </button>

      {/* Save */}
      <button
        onClick={handleSave}
        disabled={saving}
        title={devMode ? 'Save to notes-data.json (Ctrl+S)' : 'Download notes-data.json (Ctrl+S)'}
        className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border transition-colors font-medium disabled:opacity-50 ${
          isDirty
            ? 'bg-accent-500/20 text-accent-400 border-accent-500/40 hover:bg-accent-500/30'
            : 'text-zinc-500 border-zinc-800 hover:text-zinc-300 hover:border-zinc-700 hover:bg-zinc-800'
        }`}
      >
        {saving ? (
          <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
          </svg>
        ) : (
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
        )}
        Save
      </button>
    </div>
  )
}
