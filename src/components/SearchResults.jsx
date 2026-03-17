import React, { useState, useEffect, useMemo } from 'react'
import { useNotesStore } from '../store/useNotesStore'
import useSemanticSearch from '../hooks/useSemanticSearch'
import { highlightText } from '../utils/highlightText'

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

/** Extract a short excerpt around the first match in the note body. */
function getSnippet(content, query) {
  // Strip common markdown syntax for a cleaner display snippet
  const plain = content
    .replace(/#+\s*/g, '')
    .replace(/\*\*?|__?|~~|`/g, '')
    .replace(/\n+/g, ' ')
    .trim()

  if (!query || !query.trim()) return plain.slice(0, 150)

  const idx = plain.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return plain.slice(0, 150)

  const start = Math.max(0, idx - 50)
  const end = Math.min(plain.length, idx + query.length + 100)
  let snippet = plain.slice(start, end)
  if (start > 0) snippet = '…' + snippet
  if (end < plain.length) snippet += '…'
  return snippet
}

function ResultRow({ note, query, isActive, onClick, dimmed = false }) {
  const snippet = getSnippet(note.content, query)

  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-3.5 rounded-lg border transition-colors ${
        isActive
          ? 'bg-accent-500/10 border-accent-500/30'
          : dimmed
          ? 'bg-transparent border-zinc-800/50 hover:bg-zinc-800/40 hover:border-zinc-700/60'
          : 'bg-zinc-900/50 border-zinc-800 hover:bg-zinc-800/70 hover:border-zinc-700'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <span
          className={`font-medium text-sm leading-snug ${
            isActive ? 'text-zinc-100' : dimmed ? 'text-zinc-500' : 'text-zinc-200'
          }`}
        >
          {highlightText(note.title, query)}
        </span>
        <span className="text-xs text-zinc-600 shrink-0 mt-0.5 tabular-nums">
          {timeAgo(note.updatedAt)}
        </span>
      </div>

      {snippet && (
        <p
          className={`mt-1.5 text-xs leading-relaxed line-clamp-2 ${
            dimmed ? 'text-zinc-600' : 'text-zinc-500'
          }`}
        >
          {highlightText(snippet, query)}
        </p>
      )}

      {note.tags?.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {note.tags.map((tag) => (
            <span
              key={tag}
              className="text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-800 text-zinc-500 border border-zinc-700"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </button>
  )
}

const PAGE = 30

export default function SearchResults() {
  const {
    notes,
    activeNoteId,
    searchQuery,
    activeTag,
    setActiveNote,
    setSearchQuery,
    getFilteredNotes,
  } = useNotesStore()

  const filteredNotes = getFilteredNotes()
  const [visibleCount, setVisibleCount] = useState(PAGE)
  useEffect(() => { setVisibleCount(PAGE) }, [searchQuery, activeTag])

  const exactIds = useMemo(() => new Set(filteredNotes.map((n) => n.id)), [filteredNotes])
  const { results: semanticResults } = useSemanticSearch(notes, searchQuery, exactIds)

  const visibleNotes = filteredNotes.slice(0, visibleCount)
  const hasMore = filteredNotes.length > visibleCount

  // Open the note and clear search so the user can read it
  const handleResultClick = (id) => {
    setActiveNote(id)
    setSearchQuery('')
  }

  const isEmpty = filteredNotes.length === 0 && semanticResults.length === 0

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-6">
        {/* Header */}
        <div className="mb-5 flex items-baseline gap-2">
          <h2 className="text-sm font-semibold text-zinc-300">Search results</h2>
          {searchQuery && (
            <span className="text-sm text-zinc-500">
              for <span className="text-zinc-400 font-medium">"{searchQuery}"</span>
            </span>
          )}
          {activeTag && (
            <span className="text-sm text-zinc-500">
              tagged <span className="text-zinc-400 font-medium">"{activeTag}"</span>
            </span>
          )}
        </div>

        {/* ── Keyword / tag matches ── */}
        {filteredNotes.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center gap-1.5 mb-2.5">
              <svg
                className="w-3 h-3 text-emerald-500 shrink-0"
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              <span className="text-xs font-medium text-emerald-600 uppercase tracking-wider">
                {filteredNotes.length} match{filteredNotes.length !== 1 ? 'es' : ''}
              </span>
            </div>

            <div className="space-y-2">
              {visibleNotes.map((note) => (
                <ResultRow
                  key={note.id}
                  note={note}
                  query={searchQuery}
                  isActive={activeNoteId === note.id}
                  onClick={() => handleResultClick(note.id)}
                />
              ))}
            </div>

            {hasMore && (
              <button
                onClick={() => setVisibleCount((c) => c + PAGE)}
                className="w-full mt-2 py-2 text-xs text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 rounded-lg transition-colors border border-dashed border-zinc-800 hover:border-zinc-700"
              >
                Load {Math.min(PAGE, filteredNotes.length - visibleCount)} more
                <span className="ml-1 text-zinc-700">({filteredNotes.length - visibleCount} remaining)</span>
              </button>
            )}
          </div>
        )}

        {/* ── Related (semantic / BM25) ── */}
        {semanticResults.length > 0 && (
          <div className={filteredNotes.length > 0 ? 'pt-5 border-t border-zinc-800/60' : ''}>
            <div className="flex items-center gap-1.5 mb-2.5">
              <svg
                className="w-3 h-3 text-accent-500 shrink-0"
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
              <span className="text-xs font-medium text-accent-500/70 uppercase tracking-wider">Related</span>
            </div>
            <div className="space-y-2">
              {semanticResults.map((note) => (
                <ResultRow
                  key={note.id}
                  note={note}
                  query={searchQuery}
                  isActive={activeNoteId === note.id}
                  onClick={() => handleResultClick(note.id)}
                  dimmed
                />
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {isEmpty && (
          <div className="flex flex-col items-center justify-center py-20 text-zinc-600">
            <svg
              className="w-9 h-9 mb-3 opacity-25"
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <p className="text-sm">No notes match.</p>
          </div>
        )}
      </div>
    </div>
  )
}
