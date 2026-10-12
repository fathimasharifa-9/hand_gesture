import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import os from 'os';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const PORT = 3000;
const VITE_PORT = 5173;

// Data directory setup
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const profilePath = path.join(dataDir, 'profile.json');
const requestsPath = path.join(dataDir, 'requests.json');
const patientsPath = path.join(dataDir, 'patients.json');

// Request store
export interface RequestItem {
  id: string;
  patientId: string;
  patientName: string;
  bed: string;
  assignedCaregiver?: string;
  label: string;
  priority: 'normal' | 'important' | 'urgent';
  confidence: number;
  triggeredAt: number;
  receivedAt: number;
  ackedAt?: number;
  resolvedAt?: number;
  caregiverName?: string;
  quickReply?: string;
  status: 'new' | 'acked' | 'resolved';
}

export interface PatientProfile {
  id: string;
  name: string;
  bed: string;
  assignedCaregiver?: string;
  active: boolean;
  notes?: string;
  gestures: any[];
  restSamples: any[];
  settings: {
    holdMs: number;
    minConfidence: number;
    minMargin: number;
    cooldownMs: number;
    ignoreTilt: boolean;
    twoStepUrgent: boolean;
    speak: boolean;
    largeText: boolean;
  };
  updatedAt: number;
}

let requestsStore: RequestItem[] = [];
let patientsStore: PatientProfile[] = [];

if (fs.existsSync(requestsPath)) {
  try {
    const raw = fs.readFileSync(requestsPath, 'utf-8');
    requestsStore = JSON.parse(raw);
  } catch (err) {
    console.error('Error loading requests.json:', err);
  }
}

function saveRequestsToDisk() {
  try {
    fs.writeFileSync(requestsPath, JSON.stringify(requestsStore, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving requests.json:', err);
  }
}

function loadPatientsFromDisk() {
  if (fs.existsSync(patientsPath)) {
    try {
      const raw = fs.readFileSync(patientsPath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        patientsStore = parsed;
        return;
      }
    } catch (err) {
      console.error('Error loading patients.json:', err);
    }
  }

  // Seed default patients
  patientsStore = [];
  const seedPath = path.join(__dirname, '..', 'seed', 'demo-profile.json');
  let seedGestures: any[] = [];
  let seedRest: any[] = [];
  if (fs.existsSync(profilePath)) {
    try {
      const p = JSON.parse(fs.readFileSync(profilePath, 'utf-8'));
      if (p.gestures && p.gestures.length > 0) {
        seedGestures = p.gestures;
        seedRest = p.restSamples || [];
      }
    } catch (e) {}
  }
  if (seedGestures.length === 0 && fs.existsSync(seedPath)) {
    try {
      const sp = JSON.parse(fs.readFileSync(seedPath, 'utf-8'));
      seedGestures = sp.gestures || [];
      seedRest = sp.restSamples || [];
    } catch (e) {}
  }

  patientsStore.push({
    id: 'patient_1',
    name: 'Rachel',
    bed: 'Bed 7',
    assignedCaregiver: 'Priya',
    active: true,
    notes: 'Post-op recovery, right hand preference',
    gestures: seedGestures,
    restSamples: seedRest,
    settings: {
      holdMs: 1200,
      minConfidence: 0.75,
      minMargin: 0.15,
      cooldownMs: 5000,
      ignoreTilt: true,
      twoStepUrgent: true,
      speak: true,
      largeText: false,
    },
    updatedAt: Date.now(),
  });

  patientsStore.push({
    id: 'patient_ravi',
    name: 'Ravi',
    bed: 'Bed 4',
    assignedCaregiver: 'Priya',
    active: true,
    notes: 'Speech impaired, needs quick response for water/pain',
    gestures: seedGestures.slice(0, 2),
    restSamples: seedRest,
    settings: {
      holdMs: 1200,
      minConfidence: 0.75,
      minMargin: 0.15,
      cooldownMs: 5000,
      ignoreTilt: true,
      twoStepUrgent: true,
      speak: true,
      largeText: false,
    },
    updatedAt: Date.now(),
  });

  patientsStore.push({
    id: 'patient_meera',
    name: 'Meera',
    bed: 'Bed 2',
    assignedCaregiver: 'Anita',
    active: true,
    notes: 'Neurological rehab, low fatigue gestures',
    gestures: [],
    restSamples: [],
    settings: {
      holdMs: 1400,
      minConfidence: 0.70,
      minMargin: 0.12,
      cooldownMs: 6000,
      ignoreTilt: true,
      twoStepUrgent: true,
      speak: true,
      largeText: true,
    },
    updatedAt: Date.now(),
  });

  savePatientsToDisk();
}

function savePatientsToDisk() {
  try {
    fs.writeFileSync(patientsPath, JSON.stringify(patientsStore, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving patients.json:', err);
  }
}

loadPatientsFromDisk();

export interface CandidateInterface {
  name: string;
  ip: string;
  type: 'wifi' | 'ethernet' | 'hotspot' | 'virtual' | 'other';
  priority: number;
  isPreferred: boolean;
}

export function getAllCandidateIps(): CandidateInterface[] {
  const interfaces = os.networkInterfaces();
  const candidates: CandidateInterface[] = [];

  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        if (iface.address.startsWith('169.254.')) continue; // skip APIPA link-local

        const lowerName = name.toLowerCase();
        let type: CandidateInterface['type'] = 'other';
        let priority = 20;

        if (
          lowerName.includes('veth') ||
          lowerName.includes('wsl') ||
          lowerName.includes('virtual') ||
          lowerName.includes('docker') ||
          lowerName.includes('hyper-v')
        ) {
          type = 'virtual';
          priority = 1;
        } else if (lowerName.includes('hotspot')) {
          type = 'hotspot';
          priority = 110;
        } else if (
          lowerName.includes('wi-fi') ||
          lowerName.includes('wifi') ||
          lowerName.includes('wlan') ||
          lowerName.includes('wireless')
        ) {
          type = 'wifi';
          priority = 100;
        } else if (lowerName.includes('ethernet') || lowerName.includes('eth')) {
          type = 'ethernet';
          priority = 60;
        }

        candidates.push({
          name,
          ip: iface.address,
          type,
          priority,
          isPreferred: false,
        });
      }
    }
  }

  candidates.sort((a, b) => b.priority - a.priority);
  if (candidates.length > 0) {
    candidates[0].isPreferred = true;
  }
  return candidates;
}

export function getLocalIp(): string {
  const candidates = getAllCandidateIps();
  return candidates.length > 0 ? candidates[0].ip : '127.0.0.1';
}

const localIp = getLocalIp();
const laptopUrl = `http://localhost:${VITE_PORT}`;
const lanUrl = `http://${localIp}:${VITE_PORT}`;
const caregiverUrl = `http://${localIp}:${VITE_PORT}/caregiver`;

// API Endpoints
app.get('/api/info', (_req, res) => {
  const candidateIps = getAllCandidateIps();
  const currentLocalIp = candidateIps.length > 0 ? candidateIps[0].ip : '127.0.0.1';

  res.json({
    lanUrl: `http://${currentLocalIp}:${VITE_PORT}`,
    caregiverUrl: `http://${currentLocalIp}:${VITE_PORT}/caregiver`,
    serverPort: PORT,
    vitePort: VITE_PORT,
    localIp: currentLocalIp,
    candidateIps,
    version: '1.0.0',
  });
});

const seedPath = path.join(__dirname, '..', 'seed', 'demo-profile.json');

// Patient Management API Endpoints
app.get('/api/patients', (_req, res) => {
  res.json(patientsStore);
});

app.post('/api/patients', (req, res) => {
  try {
    const { name, bed, assignedCaregiver, notes, settings } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Patient name is required.' });
    }
    if (!bed || typeof bed !== 'string' || !bed.trim()) {
      return res.status(400).json({ error: 'Bed number or room is required.' });
    }

    const id = req.body.id && typeof req.body.id === 'string' && req.body.id.trim()
      ? req.body.id.trim()
      : `patient_${Date.now()}`;

    if (patientsStore.some((p) => p.id === id)) {
      return res.status(400).json({ error: `A patient with ID "${id}" already exists.` });
    }

    const newPatient: PatientProfile = {
      id,
      name: name.trim(),
      bed: bed.trim(),
      assignedCaregiver: assignedCaregiver?.trim() || 'Priya',
      active: true,
      notes: notes?.trim() || '',
      gestures: Array.isArray(req.body.gestures) ? req.body.gestures : [],
      restSamples: Array.isArray(req.body.restSamples) ? req.body.restSamples : [],
      settings: settings || {
        holdMs: 1200,
        minConfidence: 0.75,
        minMargin: 0.15,
        cooldownMs: 5000,
        ignoreTilt: true,
        twoStepUrgent: true,
        speak: true,
        largeText: false,
      },
      updatedAt: Date.now(),
    };

    patientsStore.push(newPatient);
    savePatientsToDisk();
    broadcastToAll({ type: 'patients:updated', patients: patientsStore });
    res.status(201).json(newPatient);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/patients/export', (_req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', 'attachment; filename="reach_patients_export.json"');
  res.json(patientsStore);
});

app.post('/api/patients/import', (req, res) => {
  try {
    const imported = req.body;
    if (!Array.isArray(imported)) {
      return res.status(400).json({ error: 'Import payload must be an array of patient profiles.' });
    }
    for (const p of imported) {
      if (!p.id || !p.name || !p.bed) {
        return res.status(400).json({ error: 'Each patient profile must include id, name, and bed.' });
      }
    }
    patientsStore = imported;
    savePatientsToDisk();
    broadcastToAll({ type: 'patients:updated', patients: patientsStore });
    res.json({ success: true, count: patientsStore.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/patients/:id', (req, res) => {
  const patient = patientsStore.find((p) => p.id === req.params.id);
  if (patient) {
    return res.json(patient);
  }
  res.status(404).json({ error: 'Patient not found' });
});

app.put('/api/patients/:id', (req, res) => {
  try {
    const index = patientsStore.findIndex((p) => p.id === req.params.id);
    const updated = req.body;
    updated.updatedAt = Date.now();

    if (index >= 0) {
      patientsStore[index] = { ...patientsStore[index], ...updated, id: req.params.id };
    } else {
      patientsStore.push({ ...updated, id: req.params.id });
    }

    savePatientsToDisk();

    // Sync active/first patient to profile.json for backwards compatibility
    const syncPatient = patientsStore.find((p) => p.id === req.params.id) || patientsStore[0];
    if (syncPatient) {
      try {
        fs.writeFileSync(profilePath, JSON.stringify(syncPatient, null, 2), 'utf-8');
      } catch (e) {}
    }

    broadcastToAll({ type: 'patients:updated', patients: patientsStore });
    res.json({ success: true, patient: patientsStore[index >= 0 ? index : patientsStore.length - 1] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/patients/:id', (req, res) => {
  const index = patientsStore.findIndex((p) => p.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ error: 'Patient not found' });
  }
  if (req.query.hard === 'true') {
    patientsStore.splice(index, 1);
  } else {
    patientsStore[index].active = false;
    patientsStore[index].updatedAt = Date.now();
  }
  savePatientsToDisk();
  broadcastToAll({ type: 'patients:updated', patients: patientsStore });
  res.json({ success: true });
});

app.get('/api/patients/:id/requests', (req, res) => {
  const patientRequests = requestsStore.filter((r) => r.patientId === req.params.id);
  res.json(patientRequests);
});

// Backward compatibility endpoints for profile
app.get('/api/profile/:id', (req, res) => {
  const patient = patientsStore.find((p) => p.id === req.params.id) || patientsStore.find((p) => p.active) || patientsStore[0];
  if (patient) {
    return res.json(patient);
  }
  res.json({
    id: req.params.id || 'patient_1',
    name: 'Rachel',
    bed: 'Bed 7',
    gestures: [],
    restSamples: [],
    settings: {
      holdMs: 1200,
      minConfidence: 0.75,
      minMargin: 0.15,
      cooldownMs: 5000,
      ignoreTilt: true,
      twoStepUrgent: true,
      speak: true,
      largeText: false,
    },
    updatedAt: Date.now(),
  });
});

app.put('/api/profile/:id', (req, res) => {
  try {
    const profile = req.body;
    const index = patientsStore.findIndex((p) => p.id === req.params.id);
    if (index >= 0) {
      patientsStore[index] = { ...patientsStore[index], ...profile };
    } else {
      patientsStore.push(profile);
    }
    savePatientsToDisk();
    fs.writeFileSync(profilePath, JSON.stringify(profile, null, 2), 'utf-8');
    broadcastToAll({ type: 'patients:updated', patients: patientsStore });
    res.json({ success: true, profile });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/requests', (_req, res) => {
  res.json(requestsStore);
});

app.get('/api/requests.csv', (_req, res) => {
  let csv = 'ID,Patient,Bed,Request,Priority,Confidence,TriggeredAt,AckedAt,Caregiver,LatencySeconds,Status\n';
  requestsStore.forEach((r) => {
    const latency = r.ackedAt ? ((r.ackedAt - r.triggeredAt) / 1000).toFixed(1) : 'N/A';
    csv += `"${r.id}","${r.patientName}","${r.bed}","${r.label}","${r.priority}",${(r.confidence * 100).toFixed(0)}%,"${new Date(r.triggeredAt).toISOString()}","${r.ackedAt ? new Date(r.ackedAt).toISOString() : ''}","${r.caregiverName || ''}",${latency},"${r.status}"\n`;
  });

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="reach_requests_history.csv"');
  res.send(csv);
});

// Diagnostic test endpoint for Connection Doctor
app.post('/api/test-request', (req, res) => {
  const testReq: RequestItem = {
    id: `test_${Date.now()}`,
    patientId: 'patient_test',
    patientName: req.body.patientName || 'Connection Doctor',
    bed: req.body.bed || 'Diagnostic Bed',
    label: req.body.label || 'Doctor Ping',
    priority: 'normal',
    confidence: 1.0,
    triggeredAt: Date.now(),
    receivedAt: Date.now(),
    status: 'new',
  };
  requestsStore.unshift(testReq);
  saveRequestsToDisk();
  broadcastToAll({ type: 'request:new', request: testReq });
  res.json({ success: true, request: testReq });
});

app.post('/api/reset-demo', (_req, res) => {
  requestsStore = [];
  saveRequestsToDisk();
  broadcastToAll({ type: 'reset:done' });
  res.json({ success: true, message: 'All requests reset cleanly.' });
});

// Static assets
const distPath = path.join(__dirname, '..', 'dist');
app.use(express.static(distPath));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

let connectedClients: { ws: WebSocket; role: 'patient' | 'caregiver'; name: string }[] = [];

function broadcastToAll(data: any) {
  const payload = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

function broadcastPresence() {
  const caregivers = connectedClients.filter((c) => c.role === 'caregiver').length;
  const patients = connectedClients.filter((c) => c.role === 'patient').length;
  broadcastToAll({ type: 'presence', caregivers, patients });
}

// 10-second heartbeat ping to detect dead/sleeping clients
const heartbeatInterval = setInterval(() => {
  wss.clients.forEach((ws: any) => {
    if (ws.isAlive === false) {
      console.log('💀 Terminating unresponsive WebSocket client');
      return ws.terminate();
    }
    ws.isAlive = false;
    try {
      ws.ping();
    } catch (e) {
      ws.terminate();
    }
  });
}, 10000);

wss.on('close', () => {
  clearInterval(heartbeatInterval);
});

wss.on('connection', (ws: any) => {
  ws.isAlive = true;
  console.log('⚡ Client connected to WebSocket');

  ws.on('pong', () => {
    ws.isAlive = true;
  });

  // Send current open requests on connection
  ws.send(JSON.stringify({ type: 'requests:init', requests: requestsStore }));

  ws.on('message', (message: any) => {
    try {
      const data = JSON.parse(message.toString());

      if (data.type === 'ping') {
        ws.isAlive = true;
        ws.send(JSON.stringify({ type: 'pong', clientTimestamp: data.timestamp, serverTime: Date.now() }));
      } else if (data.type === 'hello') {
        connectedClients = connectedClients.filter((c) => c.ws !== ws);
        connectedClients.push({ ws, role: data.role, name: data.name });
        broadcastPresence();
      } else if (data.type === 'request') {
        const reqItem: RequestItem = {
          ...data.request,
          priority: data.request.priority || 'normal',
          receivedAt: Date.now(),
          status: 'new',
        };
        requestsStore.unshift(reqItem);
        saveRequestsToDisk();
        broadcastToAll({ type: 'request:new', request: reqItem });
      } else if (data.type === 'ack') {
        const target = requestsStore.find((r) => r.id === data.id);
        if (target) {
          target.status = 'acked';
          target.ackedAt = Date.now();
          target.caregiverName = data.caregiverName || 'Caregiver';
          target.quickReply = data.quickReply;
          saveRequestsToDisk();
          broadcastToAll({
            type: 'request:acked',
            id: data.id,
            caregiverName: target.caregiverName,
            quickReply: target.quickReply,
          });
        }
      } else if (data.type === 'resolve') {
        const target = requestsStore.find((r) => r.id === data.id);
        if (target) {
          target.status = 'resolved';
          target.resolvedAt = Date.now();
          saveRequestsToDisk();
          broadcastToAll({ type: 'request:resolved', id: data.id });
        }
      }
    } catch (err) {
      console.error('Error handling WS message:', err);
    }
  });

  ws.on('close', () => {
    connectedClients = connectedClients.filter((c) => c.ws !== ws);
    broadcastPresence();
    console.log('⚡ Client disconnected');
  });
});

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/ws')) {
    return next();
  }
  res.sendFile(path.join(distPath, 'index.html'), (err) => {
    if (err) {
      res.status(200).send('REACH API Server Running');
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('\n==================================================');
  console.log('🚀 REACH Server is active (0.0.0.0:' + PORT + ')!');
  console.log(`💻 Laptop URL:    ${laptopUrl}`);
  console.log(`📱 Phone LAN URL:  ${lanUrl}`);
  console.log(`🏥 Caregiver URL: ${caregiverUrl}`);
  console.log('==================================================\n');
});
