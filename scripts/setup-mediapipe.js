import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const destDir = path.join(rootDir, 'public', 'mediapipe');
if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
}

// 1. Copy WASM files from node_modules/@mediapipe/tasks-vision/wasm
const wasmSrcDir = path.join(rootDir, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
const wasmDestDir = path.join(destDir, 'wasm');

if (fs.existsSync(wasmSrcDir)) {
  if (!fs.existsSync(wasmDestDir)) {
    fs.mkdirSync(wasmDestDir, { recursive: true });
  }
  const files = fs.readdirSync(wasmSrcDir);
  for (const file of files) {
    const srcFile = path.join(wasmSrcDir, file);
    const destFile = path.join(wasmDestDir, file);
    if (fs.statSync(srcFile).isFile()) {
      fs.copyFileSync(srcFile, destFile);
    }
  }
  console.log('✅ Copied MediaPipe WASM assets to public/mediapipe/wasm/');
} else {
  console.warn('⚠️ node_modules/@mediapipe/tasks-vision/wasm directory not found yet.');
}

// 2. Download hand_landmarker.task if not present
const modelPath = path.join(destDir, 'hand_landmarker.task');
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

if (!fs.existsSync(modelPath) || fs.statSync(modelPath).size === 0) {
  console.log('⏳ Downloading hand_landmarker.task model file...');
  const file = fs.createWriteStream(modelPath);
  https.get(MODEL_URL, (response) => {
    if (response.statusCode === 302 || response.statusCode === 301) {
      https.get(response.headers.location, (redirectRes) => {
        redirectRes.pipe(file);
        file.on('finish', () => {
          file.close();
          console.log('✅ hand_landmarker.task downloaded successfully!');
        });
      });
    } else if (response.statusCode === 200) {
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        console.log('✅ hand_landmarker.task downloaded successfully!');
      });
    } else {
      console.error(`❌ Failed to download hand_landmarker.task: HTTP ${response.statusCode}`);
    }
  }).on('error', (err) => {
    fs.unlink(modelPath, () => {});
    console.error('❌ Error downloading model:', err.message);
  });
} else {
  console.log('✅ hand_landmarker.task already exists locally.');
}
