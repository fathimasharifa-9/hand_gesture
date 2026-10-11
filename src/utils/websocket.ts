export type WSMessage =
  | { type: 'hello'; role: 'patient' | 'caregiver'; name: string }
  | { type: 'request'; request: any }
  | { type: 'request:new'; request: any }
  | { type: 'ack'; id: string; caregiverName: string; quickReply?: string }
  | { type: 'request:acked'; id: string; caregiverName: string; quickReply?: string }
  | { type: 'resolve'; id: string }
  | { type: 'request:resolved'; id: string }
  | { type: 'presence'; caregivers: number; patients: number }
  | { type: 'request:delivered'; id: string; ms: number }
  | { type: 'ping'; timestamp: number }
  | { type: 'pong'; clientTimestamp: number; serverTime: number };

export class ReachWebSocket {
  private ws: WebSocket | null = null;
  private role: 'patient' | 'caregiver';
  private name: string;
  private listeners: Map<string, Array<(data: any) => void>> = new Map();
  public isConnected: boolean = false;
  public lastError: string | null = null;
  public latencyMs: number = 0;
  private reconnectTimer: any = null;
  private heartbeatTimer: any = null;
  private backoffMs: number = 1000;
  private customHost: string | null = null;

  constructor(role: 'patient' | 'caregiver', name: string) {
    this.role = role;
    this.name = name;

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
        this.isConnected = false;
        this.lastError = 'Device disconnected from Wi-Fi or network.';
        this.emit('connection', false);
      });
    }
  }

  public setCustomServer(host: string) {
    this.customHost = host.trim();
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('reach_custom_server', this.customHost);
    }
    this.reconnectImmediate();
  }

  public getEffectiveWsUrl(): string {
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('reach_custom_server') : null;
    const effectiveHost = this.customHost || saved;

    if (effectiveHost) {
      // Strip protocol if present
      const clean = effectiveHost.replace(/^https?:\/\//, '').replace(/^wss?:\/\//, '').replace(/\/.*$/, '');
      const hasPort = clean.includes(':');
      const targetHost = hasPort ? clean : `${clean}:3000`;
      return `ws://${targetHost}/ws`;
    }

    // Default: use hostname and direct port 3000
    const hostname = window.location.hostname || 'localhost';
    return `ws://${hostname}:3000/ws`;
  }

  public connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const wsUrl = this.getEffectiveWsUrl();
    console.log(`🔌 Connecting WebSocket to: ${wsUrl}`);

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.isConnected = true;
        this.lastError = null;
        this.backoffMs = 1000;
        this.emit('connection', true);
        console.log('✅ WebSocket connected successfully!');

        // Register role with server
        this.send({ type: 'hello', role: this.role, name: this.name });

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
        this.isConnected = false;
        this.stopHeartbeat();
        this.lastError = event.reason || 'Connection closed by server or network sleep.';
        this.emit('connection', false);
        this.scheduleReconnect();
      };

      this.ws.onerror = (_err) => {
        this.lastError = 'Could not reach server. Verify laptop Wi-Fi IP and Windows Firewall.';
        this.emit('connection', false);
        this.ws?.close();
      };
    } catch (err: any) {
      this.lastError = err.message || 'WebSocket connection error';
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
    const delay = Math.min(this.backoffMs, 10000);
    this.backoffMs = Math.min(this.backoffMs * 1.5, 10000);

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
  }
}
