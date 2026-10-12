export type ConnectionState = 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'RECONNECTING';

export type WSMessage =
  | { type: 'hello'; role: 'patient' | 'caregiver'; name: string; patientId?: string; pairedPatientId?: string; isMobile?: boolean }
  | { type: 'caregiver:pair'; patientId: string; caregiverName: string; isMobile?: boolean }
  | { type: 'caregiver:status'; patientId: string; isCaregiverConnected: boolean; caregiverName: string | null; isMobile?: boolean }
  | { type: 'paired:success'; patientId: string; patientName: string; bed: string }
  | { type: 'request'; request: any }
  | { type: 'request:new'; request: any }
  | { type: 'ack'; id: string; patientId?: string; caregiverName: string; quickReply?: string }
  | { type: 'request:acked'; id: string; patientId?: string; caregiverName: string; quickReply?: string; ackedAt: number }
  | { type: 'resolve'; id: string }
  | { type: 'request:resolved'; id: string }
  | { type: 'presence'; caregivers: number; patients: number }
  | { type: 'request:delivered'; id: string; deliveredTo: string[]; ms?: number }
  | { type: 'ping'; timestamp: number }
  | { type: 'pong'; clientTimestamp: number; serverTime: number };

export class ReachWebSocket {
  private ws: WebSocket | null = null;
  private role: 'patient' | 'caregiver';
  private name: string;
  private patientId?: string;
  private pairedPatientId?: string;
  private listeners: Map<string, Array<(data: any) => void>> = new Map();
  public connectionState: ConnectionState = 'DISCONNECTED';
  public isConnected: boolean = false;
  public lastError: string | null = null;
  public latencyMs: number = 0;
  private reconnectTimer: any = null;
  private heartbeatTimer: any = null;
  private backoffMs: number = 1000;
  private customHost: string | null = null;
  private attemptCount: number = 0;

  constructor(role: 'patient' | 'caregiver', name: string, patientId?: string) {
    this.role = role;
    this.name = name;
    if (role === 'patient') {
      this.patientId = patientId;
    } else {
      this.pairedPatientId = patientId;
    }

    // Listen to device wake-up and network change events
    if (typeof window !== 'undefined') {
      window.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          console.log('📱 Phone/tab woke up: verifying WebSocket connection...');
          if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
            this.reconnectImmediate();
          }
        }
      });

      window.addEventListener('online', () => {
        console.log('🌐 Network online: reconnecting WebSocket...');
        this.reconnectImmediate();
      });

      window.addEventListener('offline', () => {
        console.warn('⚠️ Network offline');
        this.setConnectionState('DISCONNECTED');
        this.lastError = 'Device disconnected from Wi-Fi or mobile network.';
        this.emit('connection', false);
      });
    }
  }

  public setPatientId(id: string) {
    if (this.role === 'patient') {
      this.patientId = id;
    } else {
      this.pairedPatientId = id;
    }
    if (this.isConnected) {
      if (this.role === 'patient') {
        this.send({
          type: 'hello',
          role: 'patient',
          name: this.name,
          patientId: this.patientId,
          isMobile: this.detectIsMobile(),
        });
      } else {
        this.pairPatient(id);
      }
    }
  }

  public pairPatient(patientId: string) {
    this.pairedPatientId = patientId;
    if (this.isConnected) {
      this.send({
        type: 'caregiver:pair',
        patientId,
        caregiverName: this.name,
        isMobile: this.detectIsMobile(),
      });
    }
  }

  private detectIsMobile(): boolean {
    if (typeof navigator === 'undefined') return false;
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  }

  public setCustomServer(host: string) {
    this.customHost = host.trim();
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('reach_custom_server', this.customHost);
    }
    this.attemptCount = 0;
    this.reconnectImmediate();
  }

  public getEffectiveWsUrl(): string {
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('reach_custom_server') : null;
    const effectiveHost = this.customHost || saved;

    if (effectiveHost) {
      const clean = effectiveHost.replace(/^https?:\/\//, '').replace(/^wss?:\/\//, '').replace(/\/.*$/, '');
      const hasPort = clean.includes(':');
      const targetHost = hasPort ? clean : `${clean}:3000`;
      return `ws://${targetHost}/ws`;
    }

    if (typeof window !== 'undefined' && window.location) {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      
      // If previous attempts to the host port failed twice, try direct port 3000 as fallback
      if (this.attemptCount >= 2 && window.location.port !== '3000') {
        return `${protocol}//${window.location.hostname}:3000/ws`;
      }

      // Default: Use window.location.host so requests go to the exact same origin port
      // (port 5173 proxies /ws to 3000, and port 3000 reaches Express directly)
      return `${protocol}//${window.location.host}/ws`;
    }

    return 'ws://localhost:3000/ws';
  }

  private setConnectionState(newState: ConnectionState) {
    this.connectionState = newState;
    this.isConnected = newState === 'CONNECTED';
    this.emit('connectionState', newState);
    this.emit('connection', newState === 'CONNECTED');
  }

  public connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.setConnectionState(this.attemptCount > 0 ? 'RECONNECTING' : 'CONNECTING');
    const wsUrl = this.getEffectiveWsUrl();
    console.log(`🔌 Connecting WebSocket to: ${wsUrl}`);

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.attemptCount = 0;
        this.lastError = null;
        this.backoffMs = 1000;
        this.setConnectionState('CONNECTED');
        console.log('✅ WebSocket connected successfully!');

        // Register role & pairing with server
        this.send({
          type: 'hello',
          role: this.role,
          name: this.name,
          patientId: this.patientId,
          pairedPatientId: this.pairedPatientId,
          isMobile: this.detectIsMobile(),
        });

        // Start 10-second client heartbeat
        this.startHeartbeat();
      };

      this.ws.onmessage = (event) => {
        try {
          const data: WSMessage = JSON.parse(event.data);

          if (data.type === 'pong') {
            const now = Date.now();
            this.latencyMs = now - data.clientTimestamp;
            this.emit('heartbeat', { latencyMs: this.latencyMs });
            return;
          }

          this.emit(data.type, data);
        } catch (err) {
          console.error('WS parse error:', err);
        }
      };

      this.ws.onclose = (event) => {
        this.stopHeartbeat();
        this.setConnectionState('DISCONNECTED');
        this.lastError = event.reason || 'Connection lost. Auto-reconnecting...';
        this.scheduleReconnect();
      };

      this.ws.onerror = (_err) => {
        this.attemptCount++;
        const targetUrl = this.getEffectiveWsUrl();
        this.lastError = `Cannot reach server at ${targetUrl}. Check Wi-Fi & firewall.`;
        this.setConnectionState('DISCONNECTED');
        this.ws?.close();
      };
    } catch (err: any) {
      this.attemptCount++;
      this.lastError = err.message || 'WebSocket initialization failed.';
      this.setConnectionState('DISCONNECTED');
      this.scheduleReconnect();
    }
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.send({ type: 'ping', timestamp: Date.now() });
      }
    }, 10000);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.setConnectionState('RECONNECTING');
    const delay = Math.min(this.backoffMs, 8000);
    this.backoffMs = Math.min(this.backoffMs * 1.5, 8000);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  public reconnectImmediate() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch (e) {}
    }
    this.backoffMs = 1000;
    this.connect();
  }

  public send(msg: WSMessage) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  public on(event: string, callback: (data: any) => void) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(callback);
  }

  public off(event: string, callback: (data: any) => void) {
    const list = this.listeners.get(event);
    if (list) {
      this.listeners.set(
        event,
        list.filter((cb) => cb !== callback)
      );
    }
  }

  private emit(event: string, data: any) {
    const list = this.listeners.get(event);
    if (list) {
      list.forEach((cb) => cb(data));
    }
  }

  public disconnect() {
    this.stopHeartbeat();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.ws) this.ws.close();
    this.setConnectionState('DISCONNECTED');
  }
}
