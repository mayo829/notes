import React, { useState } from 'react'
import Sidebar from './components/Sidebar'
import NoteEditor from './components/NoteEditor'
import NoteViewer from './components/NoteViewer'
import SaveBar from './components/SaveBar'
import { useNotesStore } from './store/useNotesStore'

export default function App() {
  const { getActiveNote, isEditing, createNote } = useNotesStore()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const note = getActiveNote()

  return (
    <div className="flex h-screen overflow-hidden bg-surface-950 text-zinc-200 font-sans">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-20 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar — always visible on md+, drawer on mobile */}
      <div className={`
        fixed md:static inset-y-0 left-0 z-30 md:z-auto
        transition-transform duration-200
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        <Sidebar onClose={() => setSidebarOpen(false)} />
      </div>

      {/* Main content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Save bar — always visible at top of main area */}
        <SaveBar />

        {/* Mobile top bar */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800 md:hidden shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          </button>
          <span className="font-semibold text-zinc-100 text-sm">
            {note?.title ?? 'Notes'}
          </span>
        </div>

        {/* Note area */}
        <div className="flex-1 overflow-hidden">
          {note ? (
            isEditing ? (
              <NoteEditor note={note} />
            ) : (
              <NoteViewer note={note} />
            )
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-zinc-600">
              <svg className="w-12 h-12 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
              <div className="text-center">
                <p className="text-sm font-medium text-zinc-500">No note selected</p>
                <p className="text-xs mt-1 text-zinc-700">Pick one from the sidebar or create a new one</p>
              </div>
              <button
                onClick={createNote}
                className="mt-2 px-4 py-2 rounded-lg bg-accent-500/20 text-accent-400 border border-accent-500/30 text-sm hover:bg-accent-500/30 transition-colors"
              >
                Create a note
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
