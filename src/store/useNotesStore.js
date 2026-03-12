import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { v4 as uuidv4 } from 'uuid'
import SEED_DATA from '../data/notes-data.json'

function extractWikiLinks(content) {
  const matches = content.matchAll(/\[\[([^\]]+)\]\]/g)
  return [...matches].map((m) => m[1].trim())
}

// Returns a tree structure from flat folders array
export function buildFolderTree(folders) {
  const map = {}
  folders.forEach((f) => { map[f.id] = { ...f, children: [] } })
  const roots = []
  folders.forEach((f) => {
    if (f.parentId && map[f.parentId]) {
      map[f.parentId].children.push(map[f.id])
    } else {
      roots.push(map[f.id])
    }
  })
  return roots
}

function getAllDescendantIds(folders, folderId) {
  const result = [folderId]
  const children = folders.filter((f) => f.parentId === folderId)
  children.forEach((c) => result.push(...getAllDescendantIds(folders, c.id)))
  return result
}

// Serialise current state to the same shape as notes-data.json
export function serialiseData(notes, folders) {
  return JSON.stringify({ folders, notes }, null, 2)
}


export const useNotesStore = create(
  persist(
    (set, get) => ({
      notes: SEED_DATA.notes,
      folders: SEED_DATA.folders,
      activeNoteId: SEED_DATA.notes[0]?.id ?? null,
      activeFolderId: null,
      searchQuery: '',
      activeTag: null,
      isEditing: false,
      expandedFolders: Object.fromEntries(SEED_DATA.folders.map((f) => [f.id, true])),
      // Track unsaved changes since last export
      isDirty: false,
      lastSavedAt: null,

      setActiveNote: (id) => set({ activeNoteId: id, isEditing: false }),
      setSearchQuery: (q) => set({ searchQuery: q }),
      setActiveTag: (tag) => set({ activeTag: tag }),
      setActiveFolderId: (id) => set({ activeFolderId: id }),
      setIsEditing: (v) => set({ isEditing: v }),

      toggleFolderExpanded: (id) =>
        set((state) => ({
          expandedFolders: {
            ...state.expandedFolders,
            [id]: !state.expandedFolders[id],
          },
        })),

      // ── Save / Export ────────────────────────────────────────────
      exportData: () => {
        // Called externally after a successful write; just clears the dirty flag.
        set({ isDirty: false, lastSavedAt: new Date().toISOString() })
      },

      importData: (jsonString) => {
        try {
          const data = JSON.parse(jsonString)
          if (!Array.isArray(data.notes) || !Array.isArray(data.folders)) {
            throw new Error('Invalid format')
          }
          set({
            notes: data.notes,
            folders: data.folders,
            activeNoteId: data.notes[0]?.id ?? null,
            activeFolderId: null,
            expandedFolders: Object.fromEntries(data.folders.map((f) => [f.id, true])),
            isDirty: false,
            lastSavedAt: new Date().toISOString(),
          })
          return true
        } catch {
          return false
        }
      },

      markDirty: () => set({ isDirty: true }),

      // ── Folder CRUD ──────────────────────────────────────────────
      createFolder: (name, parentId = null) => {
        const id = uuidv4()
        set((state) => ({
          folders: [...state.folders, { id, name, parentId }],
          expandedFolders: { ...state.expandedFolders, [id]: true },
          isDirty: true,
        }))
        return id
      },

      renameFolder: (id, name) =>
        set((state) => ({
          folders: state.folders.map((f) => (f.id === id ? { ...f, name } : f)),
          isDirty: true,
        })),

      deleteFolder: (id) => {
        set((state) => {
          const toDelete = new Set(getAllDescendantIds(state.folders, id))
          const remainingFolders = state.folders.filter((f) => !toDelete.has(f.id))
          const updatedNotes = state.notes.map((n) =>
            toDelete.has(n.folderId) ? { ...n, folderId: null } : n
          )
          return {
            folders: remainingFolders,
            notes: updatedNotes,
            activeFolderId: toDelete.has(state.activeFolderId) ? null : state.activeFolderId,
            activeNoteId:
              state.activeNoteId &&
              toDelete.has(state.notes.find((n) => n.id === state.activeNoteId)?.folderId)
                ? (updatedNotes[0]?.id ?? null)
                : state.activeNoteId,
            isDirty: true,
          }
        })
      },

      moveFolder: (id, newParentId) =>
        set((state) => ({
          folders: state.folders.map((f) =>
            f.id === id ? { ...f, parentId: newParentId } : f
          ),
          isDirty: true,
        })),

      // ── Note CRUD ────────────────────────────────────────────────
      createNote: (folderId = null) => {
        const id = uuidv4()
        const now = new Date().toISOString()
        const note = {
          id,
          title: 'Untitled Note',
          folderId: folderId ?? get().activeFolderId ?? null,
          content: '# Untitled Note\n\n',
          tags: [],
          createdAt: now,
          updatedAt: now,
        }
        set((state) => ({
          notes: [note, ...state.notes],
          activeNoteId: id,
          isEditing: true,
          isDirty: true,
        }))
        return id
      },

      updateNote: (id, changes) => {
        set((state) => ({
          notes: state.notes.map((n) =>
            n.id === id
              ? { ...n, ...changes, updatedAt: new Date().toISOString() }
              : n
          ),
          isDirty: true,
        }))
      },

      deleteNote: (id) => {
        set((state) => {
          const remaining = state.notes.filter((n) => n.id !== id)
          return {
            notes: remaining,
            activeNoteId:
              state.activeNoteId === id
                ? (remaining[0]?.id ?? null)
                : state.activeNoteId,
            isEditing: false,
            isDirty: true,
          }
        })
      },

      moveNote: (noteId, folderId) =>
        set((state) => ({
          notes: state.notes.map((n) =>
            n.id === noteId ? { ...n, folderId, updatedAt: new Date().toISOString() } : n
          ),
          isDirty: true,
        })),

      // ── Selectors ────────────────────────────────────────────────
      getActiveNote: () => {
        const { notes, activeNoteId } = get()
        return notes.find((n) => n.id === activeNoteId) ?? null
      },

      getNoteByTitle: (title) => {
        const { notes } = get()
        return (
          notes.find((n) => n.title.toLowerCase() === title.toLowerCase()) ?? null
        )
      },

      getBacklinks: (noteId) => {
        const { notes } = get()
        const target = notes.find((n) => n.id === noteId)
        if (!target) return []
        return notes.filter((n) => {
          if (n.id === noteId) return false
          const links = extractWikiLinks(n.content)
          return links.some((l) => l.toLowerCase() === target.title.toLowerCase())
        })
      },

      getAllTags: () => {
        const { notes } = get()
        const tagSet = new Set()
        notes.forEach((n) => n.tags.forEach((t) => tagSet.add(t)))
        return [...tagSet].sort()
      },

      getNotesInFolder: (folderId) => {
        const { notes } = get()
        return notes.filter((n) => n.folderId === folderId)
      },

      getUnfiledNotes: () => {
        const { notes } = get()
        return notes.filter((n) => !n.folderId)
      },

      getFilteredNotes: () => {
        const { notes, folders, searchQuery, activeTag, activeFolderId } = get()
        let result = notes

        if (activeFolderId === '__unfiled__') {
          result = result.filter((n) => !n.folderId)
        } else if (activeFolderId) {
          const ids = new Set(getAllDescendantIds(folders, activeFolderId))
          result = result.filter((n) => ids.has(n.folderId))
        }

        if (activeTag) {
          result = result.filter((n) => n.tags.includes(activeTag))
        }

        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase()
          result = result.filter(
            (n) =>
              n.title.toLowerCase().includes(q) ||
              n.content.toLowerCase().includes(q) ||
              n.tags.some((t) => t.toLowerCase().includes(q))
          )
        }
        return result
      },
    }),
    {
      name: 'notes-storage',
    }
  )
)
