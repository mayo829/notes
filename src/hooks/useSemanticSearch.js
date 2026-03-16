/**
 * useSemanticSearch — browser-side AI similarity search using Transformers.js.
 *
 * The first call lazily loads Xenova/all-MiniLM-L6-v2 (~23 MB, cached by the
 * browser after the first download).  Notes are embedded in the background;
 * a debounced cosine-similarity pass runs on every query change.
 */
import { useEffect, useRef, useState } from 'react'

// ─── singleton pipeline ───────────────────────────────────────────────────────

let _pipePromise = null
let _pipe = null

async function getPipeline(onProgress) {
  if (_pipe) return _pipe
  if (!_pipePromise) {
    _pipePromise = (async () => {
      const { pipeline, env } = await import('@xenova/transformers')
      // Allow remote model download; use browser Cache API for persistence
      env.allowRemoteModels = true
      env.useBrowserCache = true
      _pipe = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
        progress_callback: onProgress ?? null,
      })
      return _pipe
    })().catch((err) => {
      _pipePromise = null // allow retry
      throw err
    })
  }
  return _pipePromise
}

// ─── helpers ─────────────────────────────────────────────────────────────────

async function embed(pipe, text) {
  const out = await pipe(text.slice(0, 512), { pooling: 'mean', normalize: true })
  return Array.from(out.data)
}

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0
}

// ─── hook ────────────────────────────────────────────────────────────────────

/**
 * @param {object[]} notes        All notes from the store
 * @param {string}   query        Current search query
 * @param {Set}      exactIds     IDs already shown as exact matches (excluded from AI results)
 * @returns {{ semanticResults: object[], modelStatus: string }}
 *   modelStatus: 'idle' | 'loading' | 'ready' | 'error'
 */
export default function useSemanticSearch(notes, query, exactIds) {
  const [semanticResults, setSemanticResults] = useState([])
  const [modelStatus, setModelStatus] = useState('idle')

  // Cache embeddings keyed by `${id}::${updatedAt}` so stale entries are ignored
  const cache = useRef({})
  const debounce = useRef(null)

  // Start loading the pipeline as soon as the hook mounts
  useEffect(() => {
    setModelStatus('loading')
    getPipeline((progress) => {
      // Optional: could expose download progress here
    })
      .then(() => setModelStatus('ready'))
      .catch(() => setModelStatus('error'))
  }, [])

  // Pre-embed notes in the background whenever the notes array changes
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const pipe = await getPipeline().catch(() => null)
      if (!pipe) return
      for (const note of notes) {
        if (cancelled) return
        const key = `${note.id}::${note.updatedAt}`
        if (cache.current[key]) continue
        const text = `${note.title}\n${note.content}`
        try {
          cache.current[key] = await embed(pipe, text)
        } catch {}
      }
    })()
    return () => { cancelled = true }
  }, [notes])

  // Run similarity search whenever query or notes change
  useEffect(() => {
    clearTimeout(debounce.current)

    if (!query.trim()) {
      setSemanticResults([])
      return
    }

    debounce.current = setTimeout(async () => {
      const pipe = await getPipeline().catch(() => null)
      if (!pipe) return

      try {
        const qVec = await embed(pipe, query)

        const scored = notes
          .filter((n) => !exactIds.has(n.id))
          .map((n) => {
            const key = `${n.id}::${n.updatedAt}`
            const vec = cache.current[key]
            return { note: n, score: vec ? cosine(qVec, vec) : 0 }
          })
          .filter(({ score }) => score > 0.25)
          .sort((a, b) => b.score - a.score)
          .slice(0, 5)

        setSemanticResults(scored.map((s) => s.note))
      } catch {}
    }, 350)

    return () => clearTimeout(debounce.current)
  }, [query, notes, exactIds])

  return { semanticResults, modelStatus }
}
