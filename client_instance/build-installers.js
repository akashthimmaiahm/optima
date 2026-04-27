#!/usr/bin/env node
'use strict';
/**
 * Build script for Optima Property Server installers.
 *
 * Creates:
 *   dist/optima-property-setup.exe   — Windows Inno Setup installer
 *   dist/optima-property-installer.run — Linux self-extracting installer
 *
 * Both installers:
 *   1. Install Node.js (if not present)
 *   2. Copy property server code + node_modules
 *   3. Prompt for property key
 *   4. Verify key with central server
 *   5. Install as system service and start
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DIST_DIR = path.join(__dirname, 'dist');
const PAYLOAD_DIR = path.join(__dirname, 'payload');
const BACKEND_DIR = path.join(__dirname, '../backend');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    ensureDir(dest);
    for (const item of fs.readdirSync(src)) {
      if (item === 'node_modules' || item === '.env' || item === '*.db' || item.endsWith('.db') || item.endsWith('.db-shm') || item.endsWith('.db-wal')) continue;
      copyRecursive(path.join(src, item), path.join(dest, item));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

async function main() {
  console.log('\n  Optima Property Server — Installer Builder');
  console.log('  ============================================\n');

  // Step 1: Prepare payload (backend code without node_modules/db)
  console.log('  1. Preparing payload...');
  ensureDir(DIST_DIR);

  if (fs.existsSync(PAYLOAD_DIR)) fs.rmSync(PAYLOAD_DIR, { recursive: true });
  ensureDir(PAYLOAD_DIR);

  // Copy backend files
  copyRecursive(BACKEND_DIR, path.join(PAYLOAD_DIR, 'backend'));

  // Remove any leftover db/env files from payload
  const payloadBackend = path.join(PAYLOAD_DIR, 'backend');
  for (const f of ['optima.db', 'optima.db-shm', 'optima.db-wal', '.env']) {
    const fp = path.join(payloadBackend, f);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
  }

  console.log('  Backend code copied to payload/');

  // Step 2: Install production dependencies inside payload
  console.log('  2. Installing production dependencies...');
  execSync('npm install --omit=dev', { cwd: payloadBackend, stdio: 'inherit' });
  console.log('  Dependencies installed.');

  // Step 3: Create tar.gz of payload for Linux installer
  console.log('  3. Creating payload archive...');
  const tarFile = path.join(DIST_DIR, 'payload.tar.gz');
  try {
    execSync(`tar -czf "${tarFile}" -C "${PAYLOAD_DIR}" backend`, { stdio: 'inherit' });
    const sizeMB = (fs.statSync(tarFile).size / 1048576).toFixed(1);
    console.log(`  payload.tar.gz created (${sizeMB} MB)`);
  } catch (e) {
    console.error('  Warning: tar failed. Linux installer may not be available.');
  }

  // Step 4: Build Linux self-extracting installer
  if (fs.existsSync(tarFile)) {
    console.log('  4. Building Linux installer...');
    const linuxScript = fs.readFileSync(path.join(__dirname, 'linux-installer.sh'), 'utf8');
    const tarData = fs.readFileSync(tarFile);
    const scriptBuf = Buffer.from(linuxScript.replace('__PAYLOAD_SIZE__', String(tarData.length)), 'utf8');
    const installer = Buffer.concat([scriptBuf, tarData]);
    const linuxOut = path.join(DIST_DIR, 'optima-property-installer.run');
    fs.writeFileSync(linuxOut, installer);
    const sizeMB = (installer.length / 1048576).toFixed(1);
    console.log(`  ${linuxOut} (${sizeMB} MB)`);
  }

  // Step 5: Build Windows Inno Setup installer (if ISCC is available)
  console.log('  5. Building Windows installer...');
  const isccPaths = [
    'C:\\Program Files (x86)\\Inno Setup 6\\ISCC.exe',
    'C:\\Program Files\\Inno Setup 6\\ISCC.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Inno Setup 6', 'ISCC.exe'),
  ];
  const iscc = isccPaths.find(p => fs.existsSync(p));
  if (iscc) {
    try {
      execSync(`"${iscc}" "${path.join(__dirname, 'windows-installer.iss')}"`, { stdio: 'inherit' });
      const exePath = path.join(DIST_DIR, 'optima-property-setup.exe');
      if (fs.existsSync(exePath)) {
        const sizeMB = (fs.statSync(exePath).size / 1048576).toFixed(1);
        console.log(`  optima-property-setup.exe (${sizeMB} MB)`);
      }
    } catch (e) {
      console.error('  Inno Setup compilation failed:', e.message);
    }
  } else {
    console.log('  Inno Setup not found. Skipping Windows installer.');
    console.log('  Install from: https://jrsoftware.org/isdl.php');
  }

  // Cleanup
  if (fs.existsSync(tarFile)) fs.unlinkSync(tarFile);

  console.log('\n  Build complete!');
  console.log(`  Output: ${DIST_DIR}/\n`);
}

main().catch(err => { console.error('Build error:', err); process.exit(1); });
