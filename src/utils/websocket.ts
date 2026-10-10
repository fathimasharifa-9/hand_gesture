export type WSMessage =
  | { type: 'hello'; role: 'patient' | 'caregiver'; name: string }
  | { type: 'request'; request: any }
  | { type: 'request:new'; request: any }
  | { type: 'ack'; id: string; caregiverName: string; quickReply?: string }
  | { type: 'request:acked'; id: string; caregiverName: string; quickReply?: string }
  | { type: 'resolve'; id: string }
  | { type: 'request:resolved'; id: string }
  | { type: 'presence'; caregivers: number; patients: number }
  | { type: 'request:delivered'; id: string; ms: number };

export class ReachWebSocket {
  private ws: WebSocket | null = null;
  private role: 'patient' | 'caregiver';
  private name: string;
  private listeners: Map<string, Array<(data: any) => void>> = new Map();
  public isConnected: boolean = false;
  private reconnectTimer: any = null;

  constructor(role: 'patient' | 'caregiver', name: string) {
    this.role = role;
    this.name = name;
  }

  public connect() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const hostname = window.location.hostname;
    
    // Connect directly to backend port 3000 for robust WebSocket communication
    const targetPort = 3000;
    const wsUrl = `${protocol}//${hostname}:${targetPort}/ws`;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.isConnected = true;
        this.emit('connection', true);
        // Register role with server
        this.send({ type: 'hello', role: this.role, name: this.name });
      };

      this.ws.onmessage = (event) => {
        try {
          const data: WSMessage = JSON.parse(event.data);
          this.emit(data.type, data);
        } catch (err) {
          console.error('WS parse error:', err);
        }
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        this.emit('connection', false);
        this.scheduleReconnect();
      };

      this.ws.onerror = (err) => {
        console.error('WS error:', err);
        this.ws?.close();
      };
    } catch (err) {
      console.error('WS connection failed:', err);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 2000);
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
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.ws) this.ws.close();
  }
}
