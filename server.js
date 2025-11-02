const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Paths
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

// Ensure data directory and DB file exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(DB_FILE)) {
  const seed = {
    records: [],
    lastId: 1,
    equipmentOptions: ['ลูกบาส', 'ลูกบอล', 'เปตอง', 'ลูกฟุตซอล', 'ลูกวอลเล่บอล']
  };
  fs.writeFileSync(DB_FILE, JSON.stringify(seed, null, 2), 'utf8');
}

function readDB() {
  const raw = fs.readFileSync(DB_FILE, 'utf8');
  return JSON.parse(raw);
}

function writeDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
}

app.use(cors());
app.options('*', cors()); // handle preflight
app.use(express.json());

// Utilities
function datePartFromTimeString(ts) {
  // expects 'YYYY-MM-DD HH:MM:SS'
  if (typeof ts !== 'string') return '';
  return ts.split(' ')[0] || '';
}

// API routes
app.get('/api/records', (req, res) => {
  const db = readDB();
  const records = [...db.records].sort((a, b) => (a.time > b.time ? -1 : a.time < b.time ? 1 : 0));
  res.json(records);
});

app.post('/api/records', (req, res) => {
  const { personId, equipment = '', time, status = 'กำลังยืมอยู่', returnTime = '', fullBarcode = '' } = req.body || {};
  if (!personId || !time) {
    return res.status(400).json({ error: 'personId and time are required' });
  }
  const db = readDB();
  const record = {
    id: db.lastId++,
    personId,
    equipment,
    time,
    status,
    returnTime,
    fullBarcode
  };
  db.records.push(record);
  writeDB(db);
  res.status(201).json(record);
});

app.patch('/api/records/:id', (req, res) => {
  const id = Number(req.params.id);
  const db = readDB();
  const idx = db.records.findIndex(r => r.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  const allowed = ['personId', 'equipment', 'time', 'status', 'returnTime', 'fullBarcode'];
  for (const k of allowed) {
    if (k in req.body) db.records[idx][k] = req.body[k];
  }
  writeDB(db);
  res.json(db.records[idx]);
});

app.delete('/api/records/:id', (req, res) => {
  const id = Number(req.params.id);
  const db = readDB();
  const before = db.records.length;
  db.records = db.records.filter(r => r.id !== id);
  if (db.records.length === before) return res.status(404).json({ error: 'Not found' });
  writeDB(db);
  res.json({ ok: true });
});

app.delete('/api/records', (req, res) => {
  const { day } = req.query; // YYYY-MM-DD
  const db = readDB();
  if (day) {
    const before = db.records.length;
    db.records = db.records.filter(r => datePartFromTimeString(r.time) !== day);
    writeDB(db);
    return res.json({ ok: true, deleted: before - db.records.length });
  }
  // delete all if no filter (use carefully)
  db.records = [];
  writeDB(db);
  res.json({ ok: true });
});

// Equipment endpoints
app.get('/api/equipment', (req, res) => {
  const db = readDB();
  res.json(db.equipmentOptions || []);
});

app.post('/api/equipment', (req, res) => {
  const name = (req.body && req.body.name ? String(req.body.name) : '').trim();
  if (!name) return res.status(400).json({ error: 'name is required' });
  const db = readDB();
  if (!db.equipmentOptions.includes(name)) {
    db.equipmentOptions.push(name);
    db.equipmentOptions.sort((a, b) => a.localeCompare(b));
    writeDB(db);
  }
  res.status(201).json(db.equipmentOptions);
});

app.delete('/api/equipment', (req, res) => {
  const name = (req.query && req.query.name ? String(req.query.name) : '').trim();
  if (!name) return res.status(400).json({ error: 'name is required' });
  const db = readDB();
  if (db.equipmentOptions.includes(name)) {
    db.equipmentOptions = db.equipmentOptions.filter(e => e !== name);
    // Clear equipment from records that used this name
    db.records.forEach(r => {
      if (r.equipment === name) r.equipment = '';
    });
    writeDB(db);
  }
  res.json(db.equipmentOptions);
});

// Serve static files (index.html, etc.) LAST, so API routes match first
app.use(express.static(__dirname));

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
