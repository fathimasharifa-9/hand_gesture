import os from 'os';
import net from 'net';
import QRCode from 'qrcode';

interface AdapterInfo {
  name: string;
  ip: string;
  type: string;
  isPreferred: boolean;
}

function checkPortOpen(port: number, host: string = '127.0.0.1', timeoutMs: number = 800): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let isOpen = false;

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => {
      isOpen = true;
      socket.destroy();
      resolve(true);
    });

    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });

    socket.once('error', () => {
      resolve(false);
    });

    socket.connect(port, host);
  });
}

async function runDoctor() {
  console.log('\n================================================================');
  console.log('🩺  REACH CONNECTION DOCTOR (Phone & Network Diagnostics)');
  console.log('================================================================\n');

  // 1. Gather all network adapters
  const interfaces = os.networkInterfaces();
  const adapters: AdapterInfo[] = [];

  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        if (iface.address.startsWith('169.254.')) continue;

        const lower = name.toLowerCase();
        let type = 'Other Network';
        let priority = 20;

        if (
          lower.includes('veth') ||
          lower.includes('wsl') ||
          lower.includes('virtual') ||
          lower.includes('docker') ||
          lower.includes('hyper-v')
        ) {
          type = 'Virtual Adapter (WSL/Docker) ⚠️ SKIP THIS';
          priority = 1;
        } else if (lower.includes('hotspot')) {
          type = 'Mobile Hotspot 🌟 (BEST FOR PHONE)';
          priority = 110;
        } else if (
          lower.includes('wi-fi') ||
          lower.includes('wifi') ||
          lower.includes('wlan') ||
          lower.includes('wireless')
        ) {
          type = 'Wi-Fi Network 📶 (RECOMMENDED)';
          priority = 100;
        } else if (lower.includes('ethernet') || lower.includes('eth')) {
          type = 'Ethernet Cable 🔌';
          priority = 60;
        }

        adapters.push({
          name,
          ip: iface.address,
          type,
          isPreferred: false,
        });
      }
    }
  }

  // Sort adapters by preference
  adapters.sort((a, b) => {
    const pA = a.type.includes('Hotspot') ? 110 : a.type.includes('Wi-Fi') ? 100 : a.type.includes('Ethernet') ? 60 : 10;
    const pB = b.type.includes('Hotspot') ? 110 : b.type.includes('Wi-Fi') ? 100 : b.type.includes('Ethernet') ? 60 : 10;
    return pB - pA;
  });

  if (adapters.length > 0) {
    adapters[0].isPreferred = true;
  }

  console.log('📡 1. DETECTED NETWORK ADAPTERS ON THIS LAPTOP:');
  console.log('----------------------------------------------------------------');
  if (adapters.length === 0) {
    console.log('❌ No active IPv4 network adapters found! Please connect to Wi-Fi or turn on a phone hotspot.');
  } else {
    adapters.forEach((a, idx) => {
      const marker = a.isPreferred ? '👉 [PRIMARY]' : '   ';
      console.log(`${marker} #${idx + 1}: ${a.name}`);
      console.log(`        IP Address: ${a.ip}`);
      console.log(`        Type:       ${a.type}\n`);
    });
  }

  // 2. Check Ports
  console.log('🔌 2. PORT HEALTH STATUS:');
  console.log('----------------------------------------------------------------');
  const port3000Open = await checkPortOpen(3000);
  const port5173Open = await checkPortOpen(5173);

  console.log(` • Express API & WebSocket Server (Port 3000): ${port3000Open ? '✅ ACTIVE & LISTENING' : '❌ NOT RUNNING (run npm run dev)'}`);
  console.log(` • Vite Web Frontend Server (Port 5173):       ${port5173Open ? '✅ ACTIVE & LISTENING' : '❌ NOT RUNNING (run npm run dev)'}\n`);

  // 3. Recommended URLs for Phone
  const primary = adapters.find((a) => a.isPreferred) || adapters[0];
  const phoneCaregiverUrl = primary ? `http://${primary.ip}:5173/caregiver` : 'http://localhost:5173/caregiver';
  const directServerUrl = primary ? `http://${primary.ip}:3000/caregiver` : 'http://localhost:3000/caregiver';

  console.log('📱 3. CAREGIVER URLS FOR YOUR PHONE:');
  console.log('----------------------------------------------------------------');
  console.log(`👉 Web Caregiver URL:   ${phoneCaregiverUrl}`);
  console.log(`👉 Direct Express URL:  ${directServerUrl}`);
  console.log(`👉 Laptop Live URL:     http://localhost:5173/live\n`);

  // 4. Generate ASCII QR Code in Terminal
  console.log('📸 4. SCAN THIS QR CODE WITH YOUR PHONE CAMERA:');
  console.log('----------------------------------------------------------------');
  try {
    const qrAscii = await QRCode.toString(phoneCaregiverUrl, { type: 'terminal', small: true });
    console.log(qrAscii);
  } catch (err: any) {
    console.log(`(QR Code render error: ${err.message})`);
  }

  // 5. Warnings and Troubleshooting Checklist
  console.log('\n⚠️  5. IMPORTANT NETWORK CHECKLIST:');
  console.log('----------------------------------------------------------------');
  console.log('• [HOTSPOT METHOD - HIGHLY RECOMMENDED]:');
  console.log('  If your phone cannot open the link, university, hotel, or office Wi-Fi');
  console.log('  networks often have "Client Isolation" turned on (blocking phone-to-laptop).');
  console.log('  👉 SOLUTION: Turn on your phone\'s Personal Hotspot. Connect your laptop');
  console.log('  to your phone\'s hotspot, then run "npm run doctor" again.\n');

  console.log('• [WINDOWS DEFENDER FIREWALL]:');
  console.log('  If the connection times out:');
  console.log('  1. Press Windows Key, search "Allow an app through Windows Firewall".');
  console.log('  2. Click "Change settings".');
  console.log('  3. Find "Node.js JavaScript Runtime" (or node.exe).');
  console.log('  4. Make sure BOTH "Private" and "Public" boxes are CHECKED.');
  console.log('  5. Click OK and retry.\n');

  console.log('================================================================\n');
}

runDoctor().catch(console.error);
