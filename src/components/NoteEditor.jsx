import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useNotesStore } from '../store/useNotesStore'
import { useCodeMirror } from '../hooks/useCodeMirror'

function FolderPicker({ currentFolderId, folders, onSelect }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const current = folders.find((f) => f.id === currentFolderId)

  useEffect(() => {
    const handler = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 px-2 py-1 rounded-md hover:bg-zinc-800 transition-colors border border-transparent hover:border-zinc-700"
      >
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
        </svg>
        {current ? current.name : 'Unfiled'}
        <svg className="w-3 h-3 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl py-1 min-w-[160px]">
          <button
            onClick={() => { onSelect(null); setOpen(false) }}
            className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${
              !currentFolderId ? 'text-accent-400' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
            }`}
          >
            Unfiled
          </button>
          {folders.length > 0 && <div className="my-1 border-t border-zinc-800" />}
          {folders.map((f) => (
            <button
              key={f.id}
              onClick={() => { onSelect(f.id); setOpen(false) }}
              className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${
                currentFolderId === f.id ? 'text-accent-400' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
              }`}
            >
              {f.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function NoteEditor({ note }) {
  const { updateNote, deleteNote, moveNote, setIsEditing, folders } = useNotesStore()
  const [title, setTitle] = useState(note.title)
  const [tagInput, setTagInput] = useState('')
  const [tags, setTags] = useState(note.tags)
  const saveTimer = useRef(null)
  const contentRef = useRef(note.content)
  const editorContainerRef = useRef(null)

  // Sync local state when switching notes
  useEffect(() => {
    setTitle(note.title)
    setTags(note.tags)
    contentRef.current = note.content
  }, [note.id])

  const scheduleSave = useCallback((changes) => {
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      updateNote(note.id, changes)
    }, 400)
  }, [note.id, updateNote])

  const handleContentChange = useCallback((value) => {
    contentRef.current = value
    scheduleSave({ title, content: value, tags })
  }, [title, tags, scheduleSave])

  const handleTitleChange = (e) => {
    setTitle(e.target.value)
    scheduleSave({ title: e.target.value, content: contentRef.current, tags })
  }

  const addTag = (e) => {
    e.preventDefault()
    const t = tagInput.trim().toLowerCase().replace(/\s+/g, '-')
    if (t && !tags.includes(t)) {
      const next = [...tags, t]
      setTags(next)
      updateNote(note.id, { title, content: contentRef.current, tags: next })
    }
    setTagInput('')
  }

  const removeTag = (tag) => {
    const next = tags.filter((t) => t !== tag)
    setTags(next)
    updateNote(note.id, { title, content: contentRef.current, tags: next })
  }

  const handleDelete = () => {
    if (confirm(`Delete "${note.title}"?`)) {
      deleteNote(note.id)
    }
  }

  // Mount CodeMirror
  useCodeMirror({
    containerRef: editorContainerRef,
    value: note.content,
    onChange: handleContentChange,
  })

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-zinc-800 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-600 font-mono">editing</span>
          <span className="text-zinc-800">·</span>
          <FolderPicker
            currentFolderId={note.folderId}
            folders={folders}
            onSelect={(folderId) => moveNote(note.id, folderId)}
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsEditing(false)}
            className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 px-2.5 py-1.5 rounded-md hover:bg-zinc-800 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Preview
          </button>
          <button
            onClick={handleDelete}
            className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-red-400 px-2.5 py-1.5 rounded-md hover:bg-red-500/10 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
            </svg>
            Delete
          </button>
        </div>
      </div>

      {/* Title */}
      <div className="px-6 pt-5 pb-2 shrink-0">
        <input
          type="text"
          value={title}
          onChange={handleTitleChange}
          placeholder="Note title"
          className="w-full bg-transparent text-2xl font-semibold text-zinc-100 placeholder-zinc-700 focus:outline-none"
        />
      </div>

      {/* Tags */}
      <div className="px-6 pb-3 shrink-0">
        <div className="flex flex-wrap items-center gap-1.5">
          {tags.map((tag) => (
            <span key={tag} className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-accent-500/15 text-accent-400 border border-accent-500/30">
              {tag}
              <button onClick={() => removeTag(tag)} className="hover:text-red-400 transition-colors leading-none">×</button>
            </span>
          ))}
          <form onSubmit={addTag} className="flex items-center">
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              placeholder="+ add tag"
              className="text-xs bg-transparent text-zinc-500 placeholder-zinc-700 focus:outline-none focus:text-zinc-300 w-20 focus:w-28 transition-all"
            />
          </form>
        </div>
      </div>

      <div className="mx-6 border-t border-zinc-800 mb-0 shrink-0" />

      {/* CodeMirror editor */}
      <div className="flex-1 overflow-hidden px-3 py-3">
        <div
          ref={editorContainerRef}
          className="h-full [&_.cm-editor]:h-full [&_.cm-editor]:outline-none [&_.cm-scroller]:h-full [&_.cm-scroller]:overflow-auto"
        />
      </div>
    </div>
  )
}
