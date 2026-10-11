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

// Data directory setup
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const profilePath = path.join(dataDir, 'profile.json');
const requestsPath = path.join(dataDir, 'requests.json');

// In-memory request store
interface RequestItem {
  id: string;
  patientId: string;
  patientName: string;
  bed: string;
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

let requestsStore: RequestItem[] = [];

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

function getLocalIp(): string {
  const interfaces = os.networkInterfaces();
  const candidates: { name: string; ip: string; priority: number }[] = [];

  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        if (iface.address.startsWith('169.254.')) continue;
        let priority = 10;
        const lowerName = name.toLowerCase();
        if (lowerName.includes('veth') || lowerName.includes('wsl') || lowerName.includes('virtual') || lowerName.includes('docker') || lowerName.includes('hyper-v')) {
          priority = 1;
        } else if (lowerName.includes('wi-fi') || lowerName.includes('wifi') || lowerName.includes('wlan') || lowerName.includes('wireless') || lowerName.includes('hotspot')) {
          priority = 100;
        } else if (lowerName.includes('ethernet') || lowerName.includes('eth')) {
          priority = 50;
        }
        candidates.push({ name, ip: iface.address, priority });
      }
    }
  }

  candidates.sort((a, b) => b.priority - a.priority);
  return candidates.length > 0 ? candidates[0].ip : '127.0.0.1';
}

const localIp = getLocalIp();
const VITE_PORT = 5173;
const laptopUrl = `http://localhost:${VITE_PORT}`;
const lanUrl = `http://${localIp}:${VITE_PORT}`;
const caregiverUrl = `http://${localIp}:${VITE_PORT}/caregiver`;

// API Endpoints
app.get('/api/info', (_req, res) => {
  res.json({
    lanUrl,
    caregiverUrl,
    version: '1.0.0',
    localIp,
  });
});

const seedPath = path.join(__dirname, '..', 'seed', 'demo-profile.json');

app.get('/api/profile/:id', (req, res) => {
  if (fs.existsSync(profilePath)) {
    try {
      const data = fs.readFileSync(profilePath, 'utf-8');
      return res.json(JSON.parse(data));
    } catch (err) {
      console.error('Error reading profile:', err);
    }
  }

  // Fallback to seed demo profile
  if (fs.existsSync(seedPath)) {
    try {
      const data = fs.readFileSync(seedPath, 'utf-8');
      const seedProfile = JSON.parse(data);
      // Auto-save to data/profile.json for seamless editing
      fs.writeFileSync(profilePath, JSON.stringify(seedProfile, null, 2), 'utf-8');
      return res.json(seedProfile);
    } catch (err) {
      console.error('Error reading seed profile:', err);
    }
  }
  res.json({
    id: req.params.id || 'patient_1',
    name: 'Ravi',
    bed: 'Bed 4',
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
    fs.writeFileSync(profilePath, JSON.stringify(profile, null, 2), 'utf-8');
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

wss.on('connection', (ws) => {
  console.log('⚡ Client connected to WebSocket');

  // Send current open requests on connection
  ws.send(JSON.stringify({ type: 'requests:init', requests: requestsStore }));

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());

      if (data.type === 'hello') {
        connectedClients = connectedClients.filter((c) => c.ws !== ws);
        connectedClients.push({ ws, role: data.role, name: data.name });
        broadcastPresence();
      } else if (data.type === 'request') {
        const reqItem: RequestItem = {
          ...data.request,
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
  console.log('🚀 REACH Server is active!');
  console.log(`💻 Laptop URL:    ${laptopUrl}`);
  console.log(`📱 Phone LAN URL:  ${lanUrl}`);
  console.log(`🏥 Caregiver URL: ${caregiverUrl}`);
  console.log('==================================================\n');
});
