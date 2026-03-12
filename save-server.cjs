// Dev-only save server — writes notes-data.json directly to src/data/
// Started automatically alongside `npm run dev` via the package.json script.
// Never runs in production (GitHub Pages is purely static).

const express = require('express')
const cors = require('cors')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const PORT = 3747
const DATA_DIR  = path.join(__dirname, 'src', 'data')
const DATA_FILE = path.join(DATA_DIR, 'notes-data.json')
const BACKUP_DIR = path.join(DATA_DIR, 'backups')

// Ensure directories exist
fs.mkdirSync(BACKUP_DIR, { recursive: true })

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

// ── Routes ───────────────────────────────────────────────────────────

const app = express()
app.use(cors({ origin: ['http://localhost:5173', 'http://127.0.0.1:5173'] }))
app.use(express.json({ limit: '10mb' }))

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

app.listen(PORT, () => {
  console.log(`[save-server] listening on http://localhost:${PORT}`)
  console.log(`[save-server] data file  → ${DATA_FILE}`)
  console.log(`[save-server] backups    → ${BACKUP_DIR}`)
})
