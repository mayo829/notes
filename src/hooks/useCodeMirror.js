import { useEffect, useRef } from 'react'
import { EditorState, RangeSetBuilder } from '@codemirror/state'
import { EditorView, ViewPlugin, Decoration, keymap, lineNumbers, drawSelection, dropCursor, rectangularSelection, crosshairCursor, highlightActiveLine, highlightActiveLineGutter } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { indentOnInput, bracketMatching, foldGutter, syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search'
import TurndownService from 'turndown'

// ── HTML → Markdown paste handler ───────────────────────────────────
const td = new TurndownService({
  headingStyle: 'atx',       // # Heading
  hr: '---',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',  // ```code```
  fence: '```',
  emDelimiter: '*',
  strongDelimiter: '**',
  linkStyle: 'inlined',
})

// Keep <br> as a newline
td.addRule('lineBreak', {
  filter: 'br',
  replacement: () => '\n',
})

// Preserve strikethrough
td.addRule('strikethrough', {
  filter: ['del', 's', 'strike'],
  replacement: (content) => `~~${content}~~`,
})

// Unwrap <div> and <span> that only add whitespace noise
td.addRule('divSpan', {
  filter: ['div', 'span'],
  replacement: (content) => content,
})

function htmlToMarkdown(html) {
  // Strip MS-Word / Google Docs noise
  const clean = html
    .replace(/<!--[\s\S]*?-->/g, '')          // HTML comments
    .replace(/<style[\s\S]*?<\/style>/gi, '') // inline <style> blocks
    .replace(/<script[\s\S]*?<\/script>/gi, '') // any scripts
    .replace(/\s*class="[^"]*"/gi, '')        // class attributes
    .replace(/\s*style="[^"]*"/gi, '')        // style attributes
    .replace(/\s*id="[^"]*"/gi, '')           // id attributes
  return td.turndown(clean).trim()
}

// ── Image helpers ────────────────────────────────────────────────────

// Whether the dev save-server is reachable (checked once lazily)
let devServerAvailable = null
async function checkDevServer() {
  if (devServerAvailable !== null) return devServerAvailable
  try {
    await fetch('/api/save', { method: 'HEAD' })
    devServerAvailable = true
  } catch {
    devServerAvailable = false
  }
  return devServerAvailable
}

function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => resolve(e.target.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function insertImageMarkdown(view, src, filename = 'image') {
  const { from, to } = view.state.selection.main
  const alt = filename.replace(/\.[^.]+$/, '').replace(/[^\w\s-]/g, ' ').trim() || 'image'
  const insert = `![${alt}](${src})`
  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: from + insert.length },
    scrollIntoView: true,
    userEvent: 'input.paste',
  })
}

async function uploadImageFile(file) {
  const dataUrl = await fileToDataURL(file)
  const dev = await checkDevServer()

  if (dev) {
    // Dev: POST to save-server → file written to public/images/, get back a clean path
    const res = await fetch('/api/upload-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: file.name, data: dataUrl }),
    })
    const json = await res.json()
    if (!json.ok) throw new Error(json.error)
    // Build path using Vite's BASE_URL so it works both in dev (/) and on GitHub Pages (/notes/)
    const base = import.meta.env.BASE_URL.replace(/\/$/, '')
    return `${base}/images/${json.filename}`
  } else {
    // Production / no server: fall back to inline base64 data URL
    return dataUrl
  }
}

async function handleImageFiles(files, view) {
  for (const file of files) {
    if (!file.type.startsWith('image/')) continue
    try {
      const src = await uploadImageFile(file)
      insertImageMarkdown(view, src, file.name)
    } catch (e) {
      console.error('Image upload failed', e)
    }
  }
}

// Exposed so NoteEditor toolbar button can trigger an upload and insert
export async function uploadAndInsert(viewRef, file) {
  const view = viewRef.current
  if (!view || !file) return
  try {
    const src = await uploadImageFile(file)
    insertImageMarkdown(view, src, file.name)
  } catch (e) {
    console.error('Image upload failed', e)
  }
}

function makePasteExtension() {
  return EditorView.domEventHandlers({
    paste(event, view) {
      const items = event.clipboardData?.items ?? []

      // Check for image items first
      const imageItems = [...items].filter((i) => i.type.startsWith('image/'))
      if (imageItems.length > 0) {
        event.preventDefault()
        handleImageFiles(imageItems.map((i) => i.getAsFile()), view)
        return true
      }

      // Fall through to HTML → Markdown conversion
      const html = event.clipboardData?.getData('text/html')
      if (!html || html.trim() === '') return false

      event.preventDefault()
      const md = htmlToMarkdown(html)
      const { from, to } = view.state.selection.main
      view.dispatch({
        changes: { from, to, insert: md },
        selection: { anchor: from + md.length },
        scrollIntoView: true,
        userEvent: 'input.paste',
      })
      return true
    },

    drop(event, view) {
      const files = [...(event.dataTransfer?.files ?? [])].filter((f) =>
        f.type.startsWith('image/')
      )
      if (files.length === 0) return false

      event.preventDefault()
      // Move cursor to drop position
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY })
      if (pos != null) {
        view.dispatch({ selection: { anchor: pos }, scrollIntoView: true })
      }
      handleImageFiles(files, view)
      return true
    },
  })
}

// Markdown-aware Enter: continues list items, blockquotes, etc.
function markdownEnterCommand({ state, dispatch }) {
  const { doc, selection } = state
  const range = selection.main
  if (!range.empty) return false

  const line = doc.lineAt(range.from)
  const text = line.text

  // Ordered list: "1. " or "1) "
  const orderedMatch = text.match(/^(\s*)(\d+)([.)]\s+)/)
  if (orderedMatch) {
    const [, indent, num, rest] = orderedMatch
    const content = text.slice(orderedMatch[0].length)
    // Empty item → break out of list
    if (!content.trim()) {
      dispatch(state.update({
        changes: { from: line.from, to: line.to, insert: '' },
        selection: { anchor: line.from },
      }))
      return true
    }
    const next = `\n${indent}${parseInt(num) + 1}${rest}`
    dispatch(state.update({
      changes: { from: range.from, insert: next },
      selection: { anchor: range.from + next.length },
      scrollIntoView: true,
    }))
    return true
  }

  // Unordered list: "- ", "* ", "+ "
  const unorderedMatch = text.match(/^(\s*)([-*+]\s+)/)
  if (unorderedMatch) {
    const [, indent, bullet] = unorderedMatch
    const content = text.slice(unorderedMatch[0].length)
    if (!content.trim()) {
      dispatch(state.update({
        changes: { from: line.from, to: line.to, insert: '' },
        selection: { anchor: line.from },
      }))
      return true
    }
    const next = `\n${indent}${bullet}`
    dispatch(state.update({
      changes: { from: range.from, insert: next },
      selection: { anchor: range.from + next.length },
      scrollIntoView: true,
    }))
    return true
  }

  // Blockquote: "> "
  const blockquoteMatch = text.match(/^(\s*>+\s*)/)
  if (blockquoteMatch) {
    const prefix = blockquoteMatch[1]
    const content = text.slice(prefix.length)
    if (!content.trim()) {
      dispatch(state.update({
        changes: { from: line.from, to: line.to, insert: '' },
        selection: { anchor: line.from },
      }))
      return true
    }
    const next = `\n${prefix}`
    dispatch(state.update({
      changes: { from: range.from, insert: next },
      selection: { anchor: range.from + next.length },
      scrollIntoView: true,
    }))
    return true
  }

  return false
}

// Tab in list context: indent the list item
function listTabCommand({ state, dispatch }) {
  const { doc, selection } = state
  const range = selection.main
  const line = doc.lineAt(range.from)
  const text = line.text
  if (/^\s*([-*+]|\d+[.)]) /.test(text)) {
    dispatch(state.update({
      changes: { from: line.from, insert: '  ' },
      selection: { anchor: range.from + 2 },
    }))
    return true
  }
  return false
}

function listShiftTabCommand({ state, dispatch }) {
  const { doc, selection } = state
  const range = selection.main
  const line = doc.lineAt(range.from)
  const text = line.text
  if (/^  /.test(text) && /^\s*([-*+]|\d+[.)]) /.test(text)) {
    dispatch(state.update({
      changes: { from: line.from, to: line.from + 2, insert: '' },
      selection: { anchor: Math.max(line.from, range.from - 2) },
    }))
    return true
  }
  return false
}

// ── Text-block ('''...''') delimiter highlighter ─────────────────────────────
// Dims the ''' delimiter lines and tints the content lines between them so the
// block is visually distinct in the editor without being obtrusive.
function makeTextBlockPlugin() {
  const delimDeco = Decoration.line({ class: 'cm-textblock-delim' })
  const bodyDeco  = Decoration.line({ class: 'cm-textblock-body'  })

  return ViewPlugin.fromClass(class {
    constructor(view) { this.decorations = this._build(view) }
    update(u) {
      if (u.docChanged || u.viewportChanged) this.decorations = this._build(u.view)
    }
    _build(view) {
      const builder = new RangeSetBuilder()
      const doc = view.state.doc
      // Track open/close across the full document so blocks that start before
      // the viewport are still recognised inside it.
      let inside = false
      for (let n = 1; n <= doc.lines; n++) {
        const line = doc.line(n)
        if (line.text.trim() === "'''") {
          // Only add decoration when the line is in the visible viewport
          if (line.from >= view.viewport.from - 1 && line.from <= view.viewport.to) {
            builder.add(line.from, line.from, delimDeco)
          }
          inside = !inside
        } else if (inside) {
          if (line.from >= view.viewport.from - 1 && line.from <= view.viewport.to) {
            builder.add(line.from, line.from, bodyDeco)
          }
        }
      }
      return builder.finish()
    }
  }, { decorations: v => v.decorations })
}

// Dark theme matching the app palette
const appTheme = EditorView.theme({
  '&': {
    color: '#d4d4d8',
    backgroundColor: 'transparent',
    height: '100%',
    fontFamily: '"JetBrains Mono", "Fira Code", monospace',
    fontSize: '14px',
  },
  '.cm-content': {
    caretColor: '#a78bfa',
    padding: '0',
    lineHeight: '1.75',
  },
  '.cm-cursor': { borderLeftColor: '#a78bfa', borderLeftWidth: '2px' },
  '.cm-selectionBackground, ::selection': { backgroundColor: '#4c1d9540 !important' },
  '.cm-focused .cm-selectionBackground': { backgroundColor: '#4c1d9560 !important' },
  '.cm-activeLine': { backgroundColor: '#ffffff06' },
  '.cm-activeLineGutter': { backgroundColor: '#ffffff06', color: '#52525b' },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    border: 'none',
    color: '#3f3f46',
    paddingRight: '8px',
    minWidth: '32px',
  },
  '.cm-lineNumbers .cm-gutterElement': { paddingLeft: '8px' },
  '.cm-foldGutter': { width: '12px' },
  '.cm-scroller': { overflow: 'auto', fontFamily: 'inherit' },
  '.cm-line': { paddingLeft: '0' },
  // Markdown-specific token colours
  '.tok-heading': { color: '#e4e4e7', fontWeight: '600' },
  '.tok-heading1': { color: '#f4f4f5', fontSize: '1.15em' },
  '.tok-heading2': { color: '#e4e4e7', fontSize: '1.05em' },
  '.tok-strong': { color: '#f4f4f5', fontWeight: '600' },
  '.tok-emphasis': { color: '#d4d4d8', fontStyle: 'italic' },
  '.tok-strikethrough': { color: '#71717a', textDecoration: 'line-through' },
  '.tok-link': { color: '#7dd3fc' },
  '.tok-url': { color: '#7dd3fc' },
  '.tok-monospace': { color: '#c4b5fd', backgroundColor: '#1e1b4b60', borderRadius: '3px', padding: '0 3px' },
  '.tok-meta': { color: '#71717a' },
  '.tok-comment': { color: '#52525b', fontStyle: 'italic' },
  '.tok-keyword': { color: '#f9a8d4' },
  '.tok-string': { color: '#86efac' },
  '.tok-number': { color: '#fb923c' },
  '.tok-operator': { color: '#94a3b8' },
  '.tok-punctuation': { color: '#71717a' },
  '.tok-processingInstruction': { color: '#fde68a' },
  '.tok-atom': { color: '#fb923c' },
  '.tok-quote': { color: '#fde68a' },
  // Search match highlight
  '.cm-searchMatch': { backgroundColor: '#a78bfa30', outline: '1px solid #a78bfa60' },
  '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: '#a78bfa50' },
  // Selection match
  '.cm-selectionMatch': { backgroundColor: '#a78bfa20' },
  // Bracket matching
  '.cm-matchingBracket': { backgroundColor: '#a78bfa30', outline: '1px solid #a78bfa80' },
  // Text-block delimiters (''') and their body lines
  '.cm-textblock-delim': { color: '#52525b !important', fontStyle: 'italic' },
  '.cm-textblock-body': { backgroundColor: '#ffffff04', borderLeft: '2px solid #3f3f4660', paddingLeft: '6px' },
}, { dark: true })

export function useCodeMirror({ containerRef, value, onChange }) {
  const viewRef = useRef(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    if (!containerRef.current) return

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        onChangeRef.current(update.state.doc.toString())
      }
    })

    const state = EditorState.create({
      doc: value,
      extensions: [
        // History (undo/redo)
        history(),
        // Line numbers
        lineNumbers(),
        // Active line highlight
        highlightActiveLine(),
        highlightActiveLineGutter(),
        // Draw selection
        drawSelection(),
        dropCursor(),
        rectangularSelection(),
        crosshairCursor(),
        // Bracket matching & auto-close
        bracketMatching(),
        closeBrackets(),
        // Indentation
        indentOnInput(),
        // Syntax highlighting
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        // Markdown language with nested code block highlighting
        markdown({ base: markdownLanguage }),
        // Fold gutter
        foldGutter(),
        // Line wrapping
        EditorView.lineWrapping,
        // Highlight selection matches
        highlightSelectionMatches(),
        // Keymaps
        keymap.of([
          { key: 'Enter', run: markdownEnterCommand },
          { key: 'Tab', run: listTabCommand },
          { key: 'Shift-Tab', run: listShiftTabCommand },
          indentWithTab,
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...historyKeymap,
          ...searchKeymap,
        ]),
        // HTML → Markdown paste
        makePasteExtension(),
        // Text-block (''') delimiter highlighting
        makeTextBlockPlugin(),
        // Theme
        appTheme,
        // Change listener
        updateListener,
      ],
    })

    const view = new EditorView({ state, parent: containerRef.current })
    viewRef.current = view

    return () => {
      view.destroy()
      viewRef.current = null
    }
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sync external value changes (e.g. switching notes) without re-creating the editor
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (current !== value) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      })
    }
  }, [value])

  return viewRef
}
