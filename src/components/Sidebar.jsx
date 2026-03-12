import React, { useState, useRef, useEffect } from 'react'
import { useNotesStore, buildFolderTree } from '../store/useNotesStore'

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

// Inline rename input
function RenameInput({ initial, onConfirm, onCancel }) {
  const [val, setVal] = useState(initial)
  const ref = useRef(null)
  useEffect(() => { ref.current?.select() }, [])
  const confirm = () => { if (val.trim()) onConfirm(val.trim()); else onCancel() }
  return (
    <input
      ref={ref}
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onBlur={confirm}
      onKeyDown={(e) => {
        if (e.key === 'Enter') confirm()
        if (e.key === 'Escape') onCancel()
      }}
      onClick={(e) => e.stopPropagation()}
      className="flex-1 bg-zinc-800 text-zinc-100 text-sm px-1.5 py-0.5 rounded focus:outline-none focus:ring-1 focus:ring-accent-500 min-w-0"
    />
  )
}

// Context menu
function ContextMenu({ x, y, items, onClose }) {
  const ref = useRef(null)
  useEffect(() => {
    const handler = (e) => { if (!ref.current?.contains(e.target)) onClose() }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])
  return (
    <div
      ref={ref}
      style={{ top: y, left: x }}
      className="fixed z-50 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl py-1 min-w-[160px]"
    >
      {items.map((item) =>
        item === 'divider' ? (
          <div key="div" className="my-1 border-t border-zinc-800" />
        ) : (
          <button
            key={item.label}
            onClick={() => { item.action(); onClose() }}
            className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${
              item.danger
                ? 'text-red-400 hover:bg-red-500/10'
                : 'text-zinc-300 hover:bg-zinc-800'
            }`}
          >
            {item.label}
          </button>
        )
      )}
    </div>
  )
}

// A single folder row + its children (recursive)
function FolderRow({ folder, depth, onClose }) {
  const {
    activeNoteId,
    activeFolderId,
    expandedFolders,
    toggleFolderExpanded,
    setActiveNote,
    setActiveFolderId,
    createNote,
    createFolder,
    renameFolder,
    deleteFolder,
    getNotesInFolder,
  } = useNotesStore()

  const [renaming, setRenaming] = useState(false)
  const [contextMenu, setContextMenu] = useState(null)
  const notes = getNotesInFolder(folder.id)
  const isExpanded = expandedFolders[folder.id] ?? false
  const isActive = activeFolderId === folder.id

  const handleContextMenu = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY })
  }

  const handleFolderClick = () => {
    toggleFolderExpanded(folder.id)
    setActiveFolderId(isActive ? null : folder.id)
  }

  const handleNoteClick = (id) => {
    setActiveNote(id)
    onClose?.()
  }

  return (
    <div>
      {/* Folder header */}
      <div
        className={`group flex items-center gap-1 rounded-md px-2 py-1.5 cursor-pointer transition-colors select-none ${
          isActive ? 'bg-accent-500/10 text-zinc-200' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
        }`}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
        onClick={handleFolderClick}
        onContextMenu={handleContextMenu}
      >
        {/* Chevron */}
        <svg
          className={`w-3 h-3 shrink-0 transition-transform text-zinc-600 ${isExpanded ? 'rotate-90' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>

        {/* Folder icon */}
        <svg className="w-3.5 h-3.5 shrink-0 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          {isExpanded
            ? <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6A2.25 2.25 0 016 3.75h3.879a1.5 1.5 0 011.06.44l2.122 2.12a1.5 1.5 0 001.06.44H18A2.25 2.25 0 0120.25 9v.776" />
            : <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
          }
        </svg>

        {/* Name */}
        {renaming ? (
          <RenameInput
            initial={folder.name}
            onConfirm={(name) => { renameFolder(folder.id, name); setRenaming(false) }}
            onCancel={() => setRenaming(false)}
          />
        ) : (
          <span className="flex-1 text-sm truncate">{folder.name}</span>
        )}

        {/* Note count badge */}
        {notes.length > 0 && !renaming && (
          <span className="text-xs text-zinc-600 tabular-nums">{notes.length}</span>
        )}

        {/* Add note button (hover) */}
        {!renaming && (
          <button
            title="New note in folder"
            onClick={(e) => { e.stopPropagation(); createNote(folder.id) }}
            className="opacity-0 group-hover:opacity-100 w-4 h-4 flex items-center justify-center text-zinc-500 hover:text-zinc-200 transition-all shrink-0"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          </button>
        )}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          items={[
            { label: 'New Note', action: () => createNote(folder.id) },
            { label: 'New Subfolder', action: () => createFolder('New Folder', folder.id) },
            'divider',
            { label: 'Rename', action: () => setRenaming(true) },
            'divider',
            { label: 'Delete Folder', danger: true, action: () => {
              if (confirm(`Delete folder "${folder.name}" and unfile its notes?`)) deleteFolder(folder.id)
            }},
          ]}
        />
      )}

      {/* Expanded content */}
      {isExpanded && (
        <div>
          {/* Sub-folders */}
          {folder.children?.map((child) => (
            <FolderRow key={child.id} folder={child} depth={depth + 1} onClose={onClose} />
          ))}
          {/* Notes in this folder */}
          {notes.map((note) => (
            <NoteRow
              key={note.id}
              note={note}
              depth={depth + 1}
              isActive={activeNoteId === note.id}
              onClick={() => handleNoteClick(note.id)}
            />
          ))}
          {notes.length === 0 && folder.children?.length === 0 && (
            <p
              className="text-xs text-zinc-700 italic"
              style={{ paddingLeft: `${24 + (depth + 1) * 16}px`, paddingTop: '4px', paddingBottom: '4px' }}
            >
              Empty
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function NoteRow({ note, depth, isActive, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left flex items-center gap-1.5 rounded-md py-1.5 pr-3 transition-colors group ${
        isActive ? 'bg-accent-500/15 text-zinc-100' : 'text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300'
      }`}
      style={{ paddingLeft: `${12 + depth * 16}px` }}
    >
      <svg className="w-3 h-3 shrink-0 text-zinc-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      </svg>
      <span className="flex-1 text-sm truncate">{note.title}</span>
      <span className="text-xs text-zinc-700 shrink-0">{timeAgo(note.updatedAt)}</span>
    </button>
  )
}

export default function Sidebar({ onClose }) {
  const {
    activeNoteId,
    activeFolderId,
    searchQuery,
    activeTag,
    folders,
    setActiveNote,
    setSearchQuery,
    setActiveTag,
    setActiveFolderId,
    createNote,
    createFolder,
    getAllTags,
    getFilteredNotes,
    getUnfiledNotes,
  } = useNotesStore()

  const tags = getAllTags()
  const filteredNotes = getFilteredNotes()
  const unfiledNotes = getUnfiledNotes()
  const [tagsOpen, setTagsOpen] = useState(false)
  const [newFolderInput, setNewFolderInput] = useState(false)
  const folderTree = buildFolderTree(folders)

  const isSearching = searchQuery.trim() || activeTag

  const handleNoteClick = (id) => {
    setActiveNote(id)
    onClose?.()
  }

  return (
    <aside className="flex flex-col h-full bg-surface-900 border-r border-zinc-800 w-64 shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-5 pb-3 shrink-0">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-accent-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
          </svg>
          <span className="font-semibold text-zinc-100 tracking-tight">Notes</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => createNote()}
            title="New unfiled note"
            className="w-7 h-7 flex items-center justify-center rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          </button>
          <button
            onClick={() => setNewFolderInput(true)}
            title="New folder"
            className="w-7 h-7 flex items-center justify-center rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 10.5v6m3-3H9m4.06-7.19l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="px-3 pb-3 shrink-0">
        <div className="relative">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="text"
            placeholder="Search notes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-surface-800 text-zinc-300 placeholder-zinc-600 text-sm rounded-md pl-8 pr-3 py-1.5 border border-zinc-800 focus:outline-none focus:border-accent-500 focus:ring-1 focus:ring-accent-500/30 transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Tags */}
      {tags.length > 0 && (
        <div className="px-3 pb-2 shrink-0">
          <button
            onClick={() => setTagsOpen((v) => !v)}
            className="flex items-center gap-1 text-xs font-medium text-zinc-600 hover:text-zinc-400 uppercase tracking-wider mb-1.5 transition-colors w-full"
          >
            <svg
              className={`w-3 h-3 transition-transform ${tagsOpen ? 'rotate-90' : ''}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
            Tags
          </button>
          {tagsOpen && (
            <div className="flex flex-wrap gap-1.5">
              {activeTag && (
                <button
                  onClick={() => setActiveTag(null)}
                  className="text-xs px-2 py-0.5 rounded-full bg-accent-500/20 text-accent-400 border border-accent-500/30 hover:bg-accent-500/30 transition-colors"
                >
                  ✕ clear
                </button>
              )}
              {tags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => setActiveTag(activeTag === tag ? null : tag)}
                  className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                    activeTag === tag
                      ? 'bg-accent-500/20 text-accent-400 border-accent-500/40'
                      : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:border-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="mx-3 border-t border-zinc-800 mb-1 shrink-0" />

      {/* Tree / search results */}
      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {isSearching ? (
          // Flat search results
          <div className="space-y-0.5 pt-1">
            <p className="text-xs text-zinc-600 px-2 pb-1">
              {filteredNotes.length} result{filteredNotes.length !== 1 ? 's' : ''}
            </p>
            {filteredNotes.length === 0 ? (
              <p className="text-zinc-700 text-xs text-center mt-6">No notes match.</p>
            ) : (
              filteredNotes.map((note) => (
                <NoteRow
                  key={note.id}
                  note={note}
                  depth={0}
                  isActive={activeNoteId === note.id}
                  onClick={() => handleNoteClick(note.id)}
                />
              ))
            )}
          </div>
        ) : (
          // Folder tree
          <div className="pt-1 space-y-0.5">
            {/* New folder input */}
            {newFolderInput && (
              <div className="px-2 py-1">
                <RenameInput
                  initial="New Folder"
                  onConfirm={(name) => { createFolder(name, null); setNewFolderInput(false) }}
                  onCancel={() => setNewFolderInput(false)}
                />
              </div>
            )}

            {/* Folder tree */}
            {folderTree.map((folder) => (
              <FolderRow key={folder.id} folder={folder} depth={0} onClose={onClose} />
            ))}

            {/* Unfiled notes */}
            {unfiledNotes.length > 0 && (
              <div className="mt-1">
                <button
                  onClick={() => setActiveFolderId(activeFolderId === '__unfiled__' ? null : '__unfiled__')}
                  className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md text-sm transition-colors ${
                    activeFolderId === '__unfiled__'
                      ? 'bg-accent-500/10 text-zinc-300'
                      : 'text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300'
                  }`}
                >
                  <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6A2.25 2.25 0 016 3.75h3.879a1.5 1.5 0 011.06.44l2.122 2.12a1.5 1.5 0 001.06.44H18A2.25 2.25 0 0120.25 9v.776" />
                  </svg>
                  <span className="flex-1 text-left">Unfiled</span>
                  <span className="text-xs text-zinc-600">{unfiledNotes.length}</span>
                </button>
                {activeFolderId === '__unfiled__' && unfiledNotes.map((note) => (
                  <NoteRow
                    key={note.id}
                    note={note}
                    depth={1}
                    isActive={activeNoteId === note.id}
                    onClick={() => handleNoteClick(note.id)}
                  />
                ))}
              </div>
            )}

            {folderTree.length === 0 && unfiledNotes.length === 0 && (
              <p className="text-zinc-700 text-xs text-center mt-8 px-4">
                No notes yet. Create one!
              </p>
            )}
          </div>
        )}
      </div>
    </aside>
  )
}
