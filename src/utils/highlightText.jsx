import React from 'react'

/**
 * Splits `text` into matching and non-matching segments for `query`,
 * wrapping each matched segment in a <mark> with an amber highlight.
 * Returns the original string unchanged when query is empty.
 *
 * Special regex characters in the query are escaped so inputs like
 * "c++" or "(react)" never throw.
 */
export function highlightText(text, query) {
  if (!query || !query.trim()) return text

  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(`(${escaped})`, 'gi')
  const parts = text.split(regex)

  // split() with a capturing group places matches at odd indices
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <mark
        key={i}
        style={{
          background: 'rgb(251 191 36 / 0.22)',
          color: 'inherit',
          borderRadius: '2px',
          padding: '0 1px',
        }}
      >
        {part}
      </mark>
    ) : (
      part
    )
  )
}
