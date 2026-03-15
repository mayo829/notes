// Dev-only save server — writes notes-data.json directly to src/data/
// Started automatically alongside `npm run dev` via the package.json script.
// Never runs in production (GitHub Pages is purely static).

const express = require('express')
const cors = require('cors')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const PORT = 3747
const DATA_DIR   = path.join(__dirname, 'src', 'data')
const DATA_FILE  = path.join(DATA_DIR, 'notes-data.json')
const BACKUP_DIR = path.join(DATA_DIR, 'backups')
const IMAGE_DIR  = path.join(__dirname, 'public', 'images')

// Ensure directories exist
fs.mkdirSync(BACKUP_DIR, { recursive: true })
fs.mkdirSync(IMAGE_DIR,  { recursive: true })

// ── Helpers ──────────────────────────────────────────────────────────

// Validate that the incoming payload has the right shape before touching disk
function validate(body) {
  if (!body || typeof body !== 'object') return 'payload must be an object'
  if (!Array.isArray(body.notes))   return 'payload.notes must be an array'
  if (!Array.isArray(body.folders)) return 'payload.folders must be an array'
  for (const n of body.notes) {
    if (typeof n.id !== 'string' || typeof n.title !== 'string') {
      return 'each note must have string id and title'
    }
  }
  for (const f of body.folders) {
    if (typeof f.id !== 'string' || typeof f.name !== 'string') {
      return 'each folder must have string id and name'
    }
  }
  return null // valid
}

// Atomic write: write to a temp file then rename over the target.
// A crash mid-write leaves the temp file; the original is untouched.
function atomicWrite(filePath, content) {
  const tmp = filePath + '.tmp.' + crypto.randomBytes(4).toString('hex')
  fs.writeFileSync(tmp, content, 'utf8')
  fs.renameSync(tmp, filePath)
}

// Keep the last 10 backups, delete older ones
function pruneBackups() {
  try {
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith('notes-data-') && f.endsWith('.json'))
      .map(f => ({ name: f, time: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs }))
      .sort((a, b) => b.time - a.time)

    files.slice(10).forEach(f => {
      fs.unlinkSync(path.join(BACKUP_DIR, f.name))
    })
  } catch {}
}

// Sanitise a filename: keep only safe characters, preserve extension
function sanitiseFilename(original) {
  const ext = path.extname(original).toLowerCase().replace(/[^.a-z0-9]/g, '') || '.bin'
  const base = path.basename(original, path.extname(original))
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 80) || 'image'
  return `${base}${ext}`
}

// Make a filename unique in IMAGE_DIR by appending a short hash if needed
function uniqueFilename(dir, filename) {
  const ext  = path.extname(filename)
  const base = path.basename(filename, ext)
  let candidate = filename
  let i = 1
  while (fs.existsSync(path.join(dir, candidate))) {
    candidate = `${base}-${i}${ext}`
    i++
  }
  return candidate
}

// ── Routes ───────────────────────────────────────────────────────────

const app = express()
app.use(cors({ origin: ['http://localhost:5173', 'http://127.0.0.1:5173'] }))
app.use(express.json({ limit: '50mb' })) // larger limit for image data URIs during upload

// HEAD /api/save — used by the frontend to detect dev mode
app.head('/api/save', (_req, res) => res.sendStatus(200))

app.post('/api/save', (req, res) => {
  // 1. Validate shape
  const err = validate(req.body)
  if (err) {
    console.error('[save-server] validation failed:', err)
    return res.status(400).json({ ok: false, error: err })
  }

  const json = JSON.stringify(req.body, null, 2)

  // 2. Backup the current file before overwriting (if it exists)
  if (fs.existsSync(DATA_FILE)) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const backupPath = path.join(BACKUP_DIR, `notes-data-${stamp}.json`)
    try {
      fs.copyFileSync(DATA_FILE, backupPath)
      pruneBackups()
    } catch (backupErr) {
      // Backup failure is non-fatal — log it but don't block the save
      console.warn('[save-server] backup failed (non-fatal):', backupErr.message)
    }
  }

  // 3. Atomic write — crash-safe
  try {
    atomicWrite(DATA_FILE, json)
    console.log(`[save-server] saved ${json.length} bytes → ${DATA_FILE}`)
    res.json({ ok: true })
  } catch (writeErr) {
    console.error('[save-server] write failed:', writeErr.message)
    res.status(500).json({ ok: false, error: writeErr.message })
  }
})

// ── Image upload ─────────────────────────────────────────────────────
// Accepts { filename, data } where data is a base64 data URL.
// Writes the raw bytes to public/images/ and returns the public path.
app.post('/api/upload-image', (req, res) => {
  const { filename, data } = req.body ?? {}

  if (typeof filename !== 'string' || typeof data !== 'string') {
    return res.status(400).json({ ok: false, error: 'Missing filename or data' })
  }

  // Parse data URL: "data:image/png;base64,<payload>"
  const match = data.match(/^data:(image\/[a-zA-Z+.-]+);base64,(.+)$/)
  if (!match) {
    return res.status(400).json({ ok: false, error: 'Invalid image data URL' })
  }

  const buffer = Buffer.from(match[2], 'base64')

  const safe   = sanitiseFilename(filename)
  const unique = uniqueFilename(IMAGE_DIR, safe)
  const dest   = path.join(IMAGE_DIR, unique)

  try {
    fs.writeFileSync(dest, buffer)
    // In dev, Vite serves /public at root, so the path is /images/<file>.
    // In production (GitHub Pages with base /notes/), it becomes /notes/images/<file>.
    console.log(`[save-server] image saved → ${dest}`)
    // Return just the filename — the frontend prepends import.meta.env.BASE_URL
    res.json({ ok: true, filename: unique })
  } catch (err) {
    console.error('[save-server] image write failed:', err.message)
    res.status(500).json({ ok: false, error: err.message })
  }
})

app.listen(PORT, () => {
  console.log(`[save-server] listening on http://localhost:${PORT}`)
  console.log(`[save-server] data file  → ${DATA_FILE}`)
  console.log(`[save-server] backups    → ${BACKUP_DIR}`)
  console.log(`[save-server] images     → ${IMAGE_DIR}`)
})
