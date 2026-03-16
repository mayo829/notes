/**
 * useSemanticSearch — browser-side semantic search using Transformers.js.
 *
 * Uses Xenova/all-MiniLM-L6-v2 (~23 MB, cached after first download).
 * Configured for single-threaded WASM so it works without SharedArrayBuffer
 * (no special HTTP headers needed — works on GitHub Pages as-is).
 *
 * Falls back to BM25 similarity while the model is loading or if it fails,
 * so related results always appear immediately.
 */
import { useEffect, useRef, useState } from 'react'

// ─── Transformers.js pipeline (singleton) ────────────────────────────────────

let _pipePromise = null
let _pipe = null

async function getPipeline() {
  if (_pipe) return _pipe
  if (!_pipePromise) {
    _pipePromise = (async () => {
      const { pipeline, env } = await import('@xenova/transformers')
      env.allowRemoteModels = true
      env.useBrowserCache   = true
      // Single-threaded WASM — no SharedArrayBuffer / COOP-COEP headers needed
      env.backends.onnx.wasm.numThreads = 1
      _pipe = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
        progress_callback: null,
      })
      return _pipe
    })().catch((err) => {
      _pipePromise = null
      throw err
    })
  }
  return _pipePromise
}

async function embedText(pipe, text) {
  const out = await pipe(text.slice(0, 512), { pooling: 'mean', normalize: true })
  return Array.from(out.data)
}

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]
  }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0
}

// ─── BM25 fallback (pure JS, instant, no model needed) ───────────────────────

function tokenize(text) {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean)
}

function buildBm25Index(notes) {
  const docs = notes.map((n) => tokenize(`${n.title} ${n.title} ${n.content}`))
  const N = docs.length
  const df = {}
  docs.forEach((tokens) => {
    new Set(tokens).forEach((t) => { df[t] = (df[t] ?? 0) + 1 })
  })
  return { docs, N, df }
}

function bm25Score(index, queryTokens, docIdx, k1 = 1.5, b = 0.75) {
  const { docs, N, df } = index
  const doc = docs[docIdx]
  const avgLen = docs.reduce((s, d) => s + d.length, 0) / N
  const freqMap = {}
  doc.forEach((t) => { freqMap[t] = (freqMap[t] ?? 0) + 1 })
  return queryTokens.reduce((score, term) => {
    if (!df[term]) return score
    const idf = Math.log((N - df[term] + 0.5) / (df[term] + 0.5) + 1)
    const tf  = freqMap[term] ?? 0
    const norm = tf * (k1 + 1) / (tf + k1 * (1 - b + b * doc.length / avgLen))
    return score + idf * norm
  }, 0)
}

function bm25Search(notes, query, excludeIds, topK = 5) {
  if (!notes.length) return []
  const candidates = notes.filter((n) => !excludeIds.has(n.id))
  if (!candidates.length) return []
  const index   = buildBm25Index(notes)
  const qTokens = tokenize(query)
  if (!qTokens.length) return candidates.slice(0, topK)
  return candidates
    .map((n) => ({ note: n, score: bm25Score(index, qTokens, notes.indexOf(n)) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((s) => s.note)
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * @param {object[]} notes       All notes
 * @param {string}   query       Current search query
 * @param {Set}      exactIds    IDs already shown as keyword matches (excluded)
 */
export default function useSemanticSearch(notes, query, exactIds) {
  const [results, setResults]   = useState([])
  const [modelReady, setModelReady] = useState(false)

  // Cache embeddings keyed by `id::updatedAt`
  const embedCache = useRef({})
  const debounce   = useRef(null)

  // Start loading the model immediately on mount (background)
  useEffect(() => {
    getPipeline()
      .then(() => setModelReady(true))
      .catch(() => {}) // failure handled silently; BM25 fallback covers it
  }, [])

  // Pre-embed notes in the background whenever notes change
  useEffect(() => {
    if (!modelReady) return
    let cancelled = false
    ;(async () => {
      const pipe = await getPipeline().catch(() => null)
      if (!pipe) return
      for (const note of notes) {
        if (cancelled) return
        const key = `${note.id}::${note.updatedAt}`
        if (embedCache.current[key]) continue
        try {
          embedCache.current[key] = await embedText(pipe, `${note.title}\n${note.content}`)
        } catch {}
      }
    })()
    return () => { cancelled = true }
  }, [notes, modelReady])

  // Run search on query change — always shows top 5 related, excluding exact matches
  useEffect(() => {
    clearTimeout(debounce.current)

    if (!query.trim()) {
      setResults([])
      return
    }

    // Show BM25 results immediately while model may still be loading
    setResults(bm25Search(notes, query, exactIds))

    debounce.current = setTimeout(async () => {
      const pipe = await getPipeline().catch(() => null)
      if (!pipe) return // keep BM25 results

      try {
        const qVec = await embedText(pipe, query)
        const top5 = notes
          .filter((n) => !exactIds.has(n.id))
          .map((n) => {
            const key = `${n.id}::${n.updatedAt}`
            const vec = embedCache.current[key]
            return { note: n, score: vec ? cosine(qVec, vec) : -1 }
          })
          .sort((a, b) => b.score - a.score)
          .slice(0, 5)
          .map((s) => s.note)

        setResults(top5)
      } catch {}
    }, 400)

    return () => clearTimeout(debounce.current)
  }, [query, notes, exactIds, modelReady])

  return { results }
}
