import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  TextInput,
  SafeAreaView,
  StatusBar,
  Vibration,
  Platform,
} from 'react-native';

// Safe imports with fallback for Expo native modules
let Haptics: any = null;
try {
  Haptics = require('expo-haptics');
} catch (e) {}

let Speech: any = null;
try {
  Speech = require('expo-speech');
} catch (e) {}

let KeepAwake: any = null;
try {
  KeepAwake = require('expo-keep-awake');
} catch (e) {}

let Audio: any = null;
try {
  Audio = require('expo-av').Audio;
} catch (e) {}

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
  caregiverName?: string;
  quickReply?: string;
  status: 'new' | 'acked' | 'resolved';
}

export default function App() {
  const [caregiverName, setCaregiverName] = useState('Priya');
  const [serverIp, setServerIp] = useState('10.132.241.116');
  const [serverPort, setServerPort] = useState('3000');
  const [activeTab, setActiveTab] = useState<'live' | 'history' | 'doctor'>('live');

  const [wsConnected, setWsConnected] = useState(false);
  const [wsLatency, setWsLatency] = useState(0);
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [reachabilityStatus, setReachabilityStatus] = useState<string>('Not tested');
  const [reachabilityLatency, setReachabilityLatency] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<any>(null);

  // Activate screen keep-awake safely
  useEffect(() => {
    if (KeepAwake?.activateKeepAwakeAsync) {
      KeepAwake.activateKeepAwakeAsync().catch(() => {});
    }
    return () => {
      if (KeepAwake?.deactivateKeepAwake) {
        KeepAwake.deactivateKeepAwake();
      }
    };
  }, []);

  // Connect WebSocket to laptop
  useEffect(() => {
    connectWs();
    return () => {
      if (wsRef.current) wsRef.current.close();
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    };
  }, [serverIp, serverPort]);

  const connectWs = () => {
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch (e) {}
    }

    const wsUrl = `ws://${serverIp}:${serverPort}/ws`;
    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsConnected(true);
        ws.send(JSON.stringify({ type: 'hello', role: 'caregiver', name: caregiverName }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'requests:init') {
            setRequests(data.requests || []);
          } else if (data.type === 'request:new') {
            const req = data.request;
            setRequests((prev) => [req, ...prev.filter((r) => r.id !== req.id)]);
            triggerHapticsAndSpeech(req);
          } else if (data.type === 'request:acked') {
            setRequests((prev) =>
              prev.map((r) =>
                r.id === data.id
                  ? { ...r, status: 'acked', ackedAt: Date.now(), caregiverName: data.caregiverName, quickReply: data.quickReply }
                  : r
              )
            );
          } else if (data.type === 'request:resolved') {
            setRequests((prev) => prev.map((r) => (r.id === data.id ? { ...r, status: 'resolved' } : r)));
          } else if (data.type === 'pong') {
            setWsLatency(Date.now() - data.clientTimestamp);
          }
        } catch (e) {}
      };

      ws.onclose = () => {
        setWsConnected(false);
        scheduleReconnect();
      };

      ws.onerror = () => {
        setWsConnected(false);
      };
    } catch (e) {
      scheduleReconnect();
    }
  };

  const scheduleReconnect = () => {
    if (reconnectTimerRef.current) return;
    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null;
      connectWs();
    }, 3000);
  };

  const triggerHapticsAndSpeech = (req: RequestItem) => {
    // 1. Vibration & Haptics
    try {
      if (Haptics?.notificationAsync) {
        if (req.priority === 'urgent') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        } else {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        }
      } else {
        Vibration.vibrate(req.priority === 'urgent' ? [0, 500, 150, 500] : 300);
      }
    } catch (e) {}

    // 2. Text to speech
    try {
      if (Speech?.speak) {
        Speech.speak(`${req.bed || 'Bed'}, ${req.patientName || 'Patient'} needs ${req.label}`);
      }
    } catch (e) {}
  };

  const handleAcknowledge = (id: string, quickReply?: string) => {
    if (wsRef.current && wsConnected) {
      wsRef.current.send(
        JSON.stringify({
          type: 'ack',
          id,
          caregiverName,
          quickReply,
        })
      );
    }
    setRequests((prev) =>
      prev.map((r) =>
        r.id === id ? { ...r, status: 'acked', ackedAt: Date.now(), caregiverName, quickReply } : r
      )
    );
  };

  const testReachability = async () => {
    setReachabilityStatus('Testing...');
    const start = Date.now();
    try {
      const res = await fetch(`http://${serverIp}:${serverPort}/api/info`);
      const latency = Date.now() - start;
      setReachabilityLatency(latency);
      if (res.ok) {
        setReachabilityStatus(`Reachable (${latency}ms)`);
      } else {
        setReachabilityStatus(`Server error HTTP ${res.status}`);
      }
    } catch (e: any) {
      setReachabilityStatus('Unreachable ❌ (Check Wi-Fi/Firewall)');
    }
  };

  const sendTestRequest = async () => {
    try {
      await fetch(`http://${serverIp}:${serverPort}/api/test-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientName: 'Expo App Test',
          bed: 'Mobile Station',
          label: 'Mobile Doctor Test',
        }),
      });
    } catch (e) {}
  };

  const liveRequests = requests.filter((r) => r.status !== 'resolved');

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.brandTitle}>REACH Caregiver</Text>
          <Text style={styles.brandSubtitle}>Mobile Station • {caregiverName}</Text>
        </View>

        <TouchableOpacity
          onPress={() => setActiveTab('doctor')}
          style={[styles.statusBadge, { backgroundColor: wsConnected ? '#D1FAE5' : '#FEE2E2' }]}
        >
          <View style={[styles.dot, { backgroundColor: wsConnected ? '#10B981' : '#EF4444' }]} />
          <Text style={[styles.statusText, { color: wsConnected ? '#065F46' : '#991B1B' }]}>
            {wsConnected ? 'Connected' : 'Offline'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Tab Navigation */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          onPress={() => setActiveTab('live')}
          style={[styles.tabBtn, activeTab === 'live' && styles.tabBtnActive]}
        >
          <Text style={[styles.tabText, activeTab === 'live' && styles.tabTextActive]}>
            Live Calls ({liveRequests.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setActiveTab('doctor')}
          style={[styles.tabBtn, activeTab === 'doctor' && styles.tabBtnActive]}
        >
          <Text style={[styles.tabText, activeTab === 'doctor' && styles.tabTextActive]}>
            Doctor 🩺
          </Text>
        </TouchableOpacity>
      </View>

      {/* Main Content */}
      <ScrollView contentContainerStyle={styles.content}>
        {activeTab === 'live' && (
          <View>
            {liveRequests.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>All Clear!</Text>
                <Text style={styles.emptySub}>No patient calls right now. You will be alerted when a movement is held.</Text>
                <TouchableOpacity onPress={sendTestRequest} style={styles.testBtn}>
                  <Text style={styles.testBtnText}>Send Test Help Call</Text>
                </TouchableOpacity>
              </View>
            ) : (
              liveRequests.map((req) => (
                <View
                  key={req.id}
                  style={[
                    styles.card,
                    req.priority === 'urgent' && styles.cardUrgent,
                    req.priority === 'important' && styles.cardImportant,
                  ]}
                >
                  <View style={styles.cardHeader}>
                    <Text style={styles.cardTitle}>{req.label}</Text>
                    <View
                      style={[
                        styles.priorityBadge,
                        {
                          backgroundColor:
                            req.priority === 'urgent' ? '#EF4444' : req.priority === 'important' ? '#F59E0B' : '#10B981',
                        },
                      ]}
                    >
                      <Text style={styles.priorityText}>{req.priority.toUpperCase()}</Text>
                    </View>
                  </View>

                  <Text style={styles.cardSub}>
                    {req.patientName} • {req.bed}
                  </Text>
                  <Text style={styles.confidenceText}>How sure: {Math.round(req.confidence * 100)}%</Text>

                  {req.status === 'new' ? (
                    <View style={styles.btnGroup}>
                      <TouchableOpacity
                        onPress={() => handleAcknowledge(req.id)}
                        style={styles.ackButton}
                      >
                        <Text style={styles.ackButtonText}>ACKNOWLEDGE</Text>
                      </TouchableOpacity>

                      <View style={styles.quickReplyRow}>
                        {['Coming now', '2 minutes', 'Will bring it'].map((reply) => (
                          <TouchableOpacity
                            key={reply}
                            onPress={() => handleAcknowledge(req.id, reply)}
                            style={styles.quickReplyBtn}
                          >
                            <Text style={styles.quickReplyText}>"{reply}"</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  ) : (
                    <View style={styles.ackedBanner}>
                      <Text style={styles.ackedText}>
                        ✅ Acknowledged by {req.caregiverName} {req.quickReply ? `("${req.quickReply}")` : ''}
                      </Text>
                    </View>
                  )}
                </View>
              ))
            )}
          </View>
        )}

        {activeTab === 'doctor' && (
          <View style={styles.doctorCard}>
            <Text style={styles.doctorHeading}>🩺 Connection Doctor</Text>
            <Text style={styles.doctorDesc}>
              Make sure your phone is on the same Wi-Fi or phone hotspot as your laptop.
            </Text>

            <Text style={styles.inputLabel}>Laptop IP Address</Text>
            <TextInput
              style={styles.input}
              value={serverIp}
              onChangeText={setServerIp}
              placeholder="e.g. 10.132.241.116"
            />

            <Text style={styles.inputLabel}>Server Port</Text>
            <TextInput
              style={styles.input}
              value={serverPort}
              onChangeText={setServerPort}
              placeholder="3000"
              keyboardType="numeric"
            />

            <View style={styles.diagRow}>
              <Text style={styles.diagLabel}>HTTP Reachability:</Text>
              <Text style={styles.diagValue}>{reachabilityStatus}</Text>
            </View>

            <View style={styles.diagRow}>
              <Text style={styles.diagLabel}>WebSocket Channel:</Text>
              <Text style={styles.diagValue}>{wsConnected ? `Connected (${wsLatency}ms)` : 'Disconnected ❌'}</Text>
            </View>

            <TouchableOpacity onPress={testReachability} style={styles.diagBtn}>
              <Text style={styles.diagBtnText}>Test Reachability</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={sendTestRequest} style={[styles.diagBtn, { backgroundColor: '#0E9F9A', marginTop: 10 }]}>
              <Text style={styles.diagBtnText}>Send Test Call</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F7F4',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  brandTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
  },
  brandSubtitle: {
    fontSize: 12,
    color: '#64748B',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
  },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
  },
  tabBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    marginRight: 8,
    backgroundColor: '#F1F5F9',
  },
  tabBtnActive: {
    backgroundColor: '#0E9F9A',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  tabTextActive: {
    color: '#FFFFFF',
  },
  content: {
    padding: 16,
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 30,
    alignItems: 'center',
    marginTop: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 8,
  },
  emptySub: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 20,
  },
  testBtn: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  testBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    marginBottom: 14,
    borderWidth: 2,
    borderColor: '#E2E8F0',
  },
  cardUrgent: {
    borderColor: '#EF4444',
    backgroundColor: '#FEF2F2',
  },
  cardImportant: {
    borderColor: '#F59E0B',
    backgroundColor: '#FFFBEB',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#0F172A',
  },
  priorityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  priorityText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  cardSub: {
    fontSize: 15,
    color: '#475569',
    marginTop: 4,
  },
  confidenceText: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2,
    marginBottom: 12,
  },
  btnGroup: {
    marginTop: 6,
  },
  ackButton: {
    height: 64,
    backgroundColor: '#0E9F9A',
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#0E9F9A',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  ackButtonText: {
    fontSize: 18,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  quickReplyRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
    gap: 6,
  },
  quickReplyBtn: {
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    marginRight: 6,
    marginTop: 4,
  },
  quickReplyText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0F172A',
  },
  ackedBanner: {
    backgroundColor: '#D1FAE5',
    padding: 12,
    borderRadius: 12,
    marginTop: 8,
  },
  ackedText: {
    color: '#065F46',
    fontWeight: '700',
    fontSize: 13,
  },
  doctorCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  doctorHeading: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 4,
  },
  doctorDesc: {
    fontSize: 13,
    color: '#64748B',
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 4,
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    marginBottom: 12,
  },
  diagRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  diagLabel: {
    fontSize: 13,
    color: '#64748B',
  },
  diagValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  diagBtn: {
    backgroundColor: '#334155',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 16,
  },
  diagBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
