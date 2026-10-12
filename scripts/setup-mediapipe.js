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

function downloadFile(url, destPath, label) {
  return new Promise((resolve, reject) => {
    if (fs.existsSync(destPath) && fs.statSync(destPath).size > 1000000) {
      console.log(`✅ ${label} already exists locally.`);
      return resolve(true);
    }

    console.log(`⏳ Downloading ${label} model file...`);
    const file = fs.createWriteStream(destPath);

    const getWithRedirect = (currentUrl) => {
      https.get(currentUrl, (response) => {
        if (response.statusCode === 301 || response.statusCode === 302) {
          if (response.headers.location) {
            getWithRedirect(response.headers.location);
          } else {
            reject(new Error(`Redirect without location for ${label}`));
          }
        } else if (response.statusCode === 200) {
          response.pipe(file);
          file.on('finish', () => {
            file.close();
            console.log(`✅ ${label} downloaded successfully!`);
            resolve(true);
          });
        } else {
          fs.unlink(destPath, () => {});
          reject(new Error(`Failed to download ${label}: HTTP ${response.statusCode}`));
        }
      }).on('error', (err) => {
        fs.unlink(destPath, () => {});
        reject(err);
      });
    };

    getWithRedirect(url);
  });
}

// 2. Download hand_landmarker.task
const handModelPath = path.join(destDir, 'hand_landmarker.task');
const HAND_MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

async function main() {
  try {
    await downloadFile(HAND_MODEL_URL, handModelPath, 'hand_landmarker.task');
    console.log('🎉 Hand MediaPipe offline model is ready!');
  } catch (err) {
    console.error('Download error:', err.message);
  }
}

main();
