import WebSocket from 'ws';

async function testWorkflow() {
  console.log('\n======================================================');
  console.log('🧪 E2E PATIENT <-> CAREGIVER WORKFLOW TEST');
  console.log('======================================================\n');
  
  // 1. Connect Patient Socket
  const patientWs = new WebSocket('ws://localhost:3000/ws');
  // 2. Connect Caregiver Socket
  const caregiverWs = new WebSocket('ws://localhost:3000/ws');

  let patientPaired = false;
  let caregiverPaired = false;
  let caregiverReceivedRequest = false;
  let patientReceivedDelivery = false;
  let patientReceivedAck = false;

  await new Promise((r) => patientWs.on('open', r));
  await new Promise((r) => caregiverWs.on('open', r));
  console.log('1️⃣ Both WebSockets connected to ws://localhost:3000/ws');

  // Register handlers
  patientWs.on('message', (msg) => {
    const data = JSON.parse(msg.toString());
    if (data.type === 'caregiver:status' && data.isCaregiverConnected) {
      console.log('2️⃣ Patient bedside received caregiver:status -> Phone is online:', data.caregiverName);
      patientPaired = true;
    }
    if (data.type === 'request:delivered') {
      console.log('4️⃣ Patient bedside received delivery confirmation -> Delivered to:', data.deliveredTo.join(', '));
      patientReceivedDelivery = true;
    }
    if (data.type === 'request:acked') {
      console.log('5️⃣ Patient bedside received request:acked -> Acknowledged by:', data.caregiverName, `"${data.quickReply}"`);
      patientReceivedAck = true;
    }
  });

  caregiverWs.on('message', (msg) => {
    const data = JSON.parse(msg.toString());
    if (data.type === 'paired:success') {
      console.log('2️⃣ Caregiver phone received paired:success for:', data.patientName, `(${data.bed})`);
      caregiverPaired = true;
    }
    if (data.type === 'request:new' && data.request.id === 'e2e_req_test') {
      console.log('3️⃣ Caregiver phone received request:new ->', data.request.label, 'from', data.request.patientName, `(${data.request.bed})`);
      caregiverReceivedRequest = true;

      // Simulate caregiver tapping Acknowledge on phone
      setTimeout(() => {
        console.log('📱 Caregiver tapping Acknowledge on phone: "On my way"');
        caregiverWs.send(JSON.stringify({
          type: 'ack',
          id: 'e2e_req_test',
          patientId: 'patient_1',
          caregiverName: 'Anita',
          quickReply: 'On my way'
        }));
      }, 400);
    }
  });

  // Patient registers as patient_1 (Rachel)
  patientWs.send(JSON.stringify({
    type: 'hello',
    role: 'patient',
    name: 'Rachel',
    patientId: 'patient_1',
    isMobile: false
  }));

  // Caregiver phone registers and pairs with patient_1
  caregiverWs.send(JSON.stringify({
    type: 'hello',
    role: 'caregiver',
    name: 'Anita',
    pairedPatientId: 'patient_1',
    isMobile: true
  }));

  // Wait for pairing handshake
  await new Promise((r) => setTimeout(r, 600));

  // Patient sends assistance request for WATER
  console.log('📡 Patient bedside camera recognized gesture -> Dispatching WATER request');
  patientWs.send(JSON.stringify({
    type: 'request',
    request: {
      id: 'e2e_req_test',
      patientId: 'patient_1',
      patientName: 'Rachel',
      bed: 'Bed 7',
      label: 'Water',
      priority: 'normal',
      confidence: 0.95,
      triggeredAt: Date.now()
    }
  }));

  // Wait for roundtrip
  await new Promise((r) => setTimeout(r, 1500));

  patientWs.close();
  caregiverWs.close();

  const allPassed = patientPaired && caregiverPaired && caregiverReceivedRequest && patientReceivedDelivery && patientReceivedAck;
  console.log('\n======================================================');
  console.log('TEST SUMMARY:');
  console.log('- Caregiver paired to Patient 1:', caregiverPaired ? 'PASS' : 'FAIL');
  console.log('- Patient informed Caregiver is Online:', patientPaired ? 'PASS' : 'FAIL');
  console.log('- Caregiver phone received Request:', caregiverReceivedRequest ? 'PASS' : 'FAIL');
  console.log('- Patient received Delivery Confirmation:', patientReceivedDelivery ? 'PASS' : 'FAIL');
  console.log('- Caregiver Ack delivered back to Patient:', patientReceivedAck ? 'PASS' : 'FAIL');
  console.log('======================================================');
  console.log('OVERALL E2E WORKFLOW:', allPassed ? '✅ ALL 5 STEPS PASSED' : '❌ FAILED');
  console.log('======================================================\n');
  process.exit(allPassed ? 0 : 1);
}

testWorkflow().catch((e) => {
  console.error(e);
  process.exit(1);
});
