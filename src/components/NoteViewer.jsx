import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Highlight, themes } from 'prism-react-renderer'
import { useNotesStore } from '../store/useNotesStore'

const LANG_COLORS = {
  js: '#f7df1e', javascript: '#f7df1e',
  ts: '#3178c6', typescript: '#3178c6',
  jsx: '#61dafb', tsx: '#61dafb',
  py: '#3572a5', python: '#3572a5',
  rs: '#dea584', rust: '#dea584',
  go: '#00add8',
  css: '#563d7c',
  html: '#e34c26',
  json: '#8bc34a',
  sh: '#89e051', bash: '#89e051', shell: '#89e051',
  sql: '#e38c00',
  md: '#083fa1', markdown: '#083fa1',
  yaml: '#cb171e', yml: '#cb171e',
}

function CodeBlock({ language, children }) {
  const lang = (language ?? '').replace(/^language-/, '') || 'text'
  const dotColor = LANG_COLORS[lang] ?? '#52525b'
  const [copied, setCopied] = React.useState(false)
  const code = String(children).replace(/\n$/, '')

  const handleCopy = () => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  return (
    <div className="my-5 rounded-xl overflow-hidden border border-zinc-800 bg-[#0d0d10] shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-zinc-900/80 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500/40" />
          <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/40" />
          <span className="w-2.5 h-2.5 rounded-full bg-green-500/40" />
          {lang !== 'text' && (
            <span className="ml-2 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: dotColor }} />
              <span className="text-xs font-mono text-zinc-500">{lang}</span>
            </span>
          )}
        </div>
        <button
          onClick={handleCopy}
          className="text-xs text-zinc-600 hover:text-zinc-300 transition-colors flex items-center gap-1.5"
        >
          {copied ? (
            <>
              <svg className="w-3 h-3 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              <span className="text-emerald-400">copied</span>
            </>
          ) : (
            <>
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
              </svg>
              copy
            </>
          )}
        </button>
      </div>
      {/* Highlighted code */}
      <Highlight theme={themes.nightOwl} code={code} language={lang}>
        {({ className, style, tokens, getLineProps, getTokenProps }) => (
          <pre
            className={className}
            style={{ ...style, background: 'transparent', margin: 0, padding: '12px 16px', overflowX: 'auto', fontSize: '13px', lineHeight: '1.65' }}
          >
            {tokens.map((line, i) => (
              <div key={i} {...getLineProps({ line })} className="table-row">
                <span className="table-cell pr-4 select-none text-zinc-700 text-right text-xs w-6">{i + 1}</span>
                <span className="table-cell">
                  {line.map((token, j) => (
                    <span key={j} {...getTokenProps({ token })} />
                  ))}
                </span>
              </div>
            ))}
          </pre>
        )}
      </Highlight>
    </div>
  )
}

function WikiLinkRenderer({ children, setActiveNote, getNoteByTitle }) {
  const note = getNoteByTitle(children)
  if (note) {
    return <span className="note-link" onClick={() => setActiveNote(note.id)}>{children}</span>
  }
  return <span className="text-zinc-600 line-through cursor-not-allowed" title="Note not found">{children}</span>
}

function processWikiLinks(children, setActiveNote, getNoteByTitle) {
  const nodes = Array.isArray(children) ? children : [children]
  return nodes.flatMap((child, i) => {
    if (typeof child !== 'string') return [child]
    const parts = child.split(/(\[\[[^\]]+\]\])/g)
    if (parts.length === 1) return [child]
    return parts.map((part, j) => {
      const match = part.match(/^\[\[([^\]]+)\]\]$/)
      if (match) {
        return (
          <WikiLinkRenderer key={`wl-${i}-${j}`} setActiveNote={setActiveNote} getNoteByTitle={getNoteByTitle}>
            {match[1]}
          </WikiLinkRenderer>
        )
      }
      return part
    })
  })
}

export default function NoteViewer({ note }) {
  const { setIsEditing, setActiveNote, getNoteByTitle, getBacklinks, folders } = useNotesStore()
  const folder = folders?.find((f) => f.id === note.folderId)
  const backlinks = getBacklinks(note.id)

  const wl = (children) => processWikiLinks(children, setActiveNote, getNoteByTitle)

  const components = {
    p({ children })  { return <p>{wl(children)}</p> },
    li({ children }) { return <li>{wl(children)}</li> },
    h1({ children }) { return <h1>{wl(children)}</h1> },
    h2({ children }) { return <h2>{wl(children)}</h2> },
    h3({ children }) { return <h3>{wl(children)}</h3> },
    h4({ children }) { return <h4>{wl(children)}</h4> },
    a({ href, children }) {
      return <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>
    },
    img({ src, alt }) {
      return (
        <span className="block my-4">
          <img
            src={src}
            alt={alt ?? ''}
            className="max-w-full rounded-lg border border-zinc-800 shadow-lg"
            loading="lazy"
          />
          {alt && <span className="block text-xs text-zinc-600 mt-1.5 text-center italic">{alt}</span>}
        </span>
      )
    },
    code({ inline, className, children }) {
      if (inline) return <code>{children}</code>
      return <CodeBlock language={className}>{children}</CodeBlock>
    },
    // Prevent double-wrapping — CodeBlock renders its own container
    pre({ children }) { return <>{children}</> },
    table({ children }) {
      return <div className="overflow-x-auto my-5"><table>{children}</table></div>
    },
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-zinc-800 shrink-0">
        <div className="flex flex-wrap items-center gap-2">
          {folder && (
            <span className="flex items-center gap-1 text-xs text-zinc-600">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
              </svg>
              {folder.name}
            </span>
          )}
          {folder && note.tags.length > 0 && <span className="text-zinc-800">·</span>}
          {note.tags.map((tag) => (
            <span key={tag} className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-500 border border-zinc-700">
              {tag}
            </span>
          ))}
        </div>
        <button
          onClick={() => setIsEditing(true)}
          className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 px-2.5 py-1.5 rounded-md hover:bg-zinc-800 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
          </svg>
          Edit
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <article className="note-prose max-w-2xl mx-auto">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
            {note.content}
          </ReactMarkdown>
        </article>

        {/* Backlinks */}
        {backlinks.length > 0 && (
          <div className="mt-10 pt-6 border-t border-zinc-800 max-w-2xl mx-auto">
            <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3 flex items-center gap-2">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
              </svg>
              Backlinks ({backlinks.length})
            </h3>
            <div className="space-y-1.5">
              {backlinks.map((bl) => (
                <button
                  key={bl.id}
                  onClick={() => setActiveNote(bl.id)}
                  className="w-full text-left px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-violet-800/50 hover:bg-violet-950/20 transition-colors group"
                >
                  <span className="text-sm text-violet-400 group-hover:text-violet-300 transition-colors">{bl.title}</span>
                  {bl.tags.length > 0 && (
                    <span className="ml-2 text-xs text-zinc-600">{bl.tags.join(', ')}</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
