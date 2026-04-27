#!/usr/bin/env node
'use strict';
/**
 * Build script for Optima Agent executables.
 *
 * Usage:
 *   node build.js              - builds all platforms (win, linux, mac)
 *   node build.js --win        - builds Windows .exe only
 *   node build.js --linux      - builds Linux binary only
 *   node build.js --mac        - builds macOS binary only
 *
 * Output:
 *   dist/optima-agent-win.exe  (with icon + version info)
 *   dist/optima-agent-linux
 *   dist/optima-agent-macos
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { default: pngToIco } = require('png-to-ico');

const DIST_DIR = path.join(__dirname, 'dist');
const LOGO_PNG = path.join(__dirname, '../../frontend/src/assets/optima-logo.png');
const ICO_PATH = path.join(__dirname, 'optima.ico');
const args = process.argv.slice(2);

// Determine which platforms to build
let targets = [];
if (args.includes('--win')) targets.push('node18-win-x64');
else if (args.includes('--linux')) targets.push('node18-linux-x64');
else if (args.includes('--mac')) targets.push('node18-macos-x64');
else targets = ['node18-win-x64', 'node18-linux-x64', 'node18-macos-x64'];

async function main() {
  // Ensure dist directory exists
  if (!fs.existsSync(DIST_DIR)) {
    fs.mkdirSync(DIST_DIR, { recursive: true });
  }

  console.log('');
  console.log('  Optima Agent Build');
  console.log('  ==================');
  console.log(`  Targets: ${targets.join(', ')}`);
  console.log('');

  // Convert PNG logo to square ICO for Windows builds
  const buildingWindows = targets.some(t => t.includes('win'));
  if (buildingWindows && fs.existsSync(LOGO_PNG)) {
    console.log('  Converting logo to .ico...');
    try {
      const sharp = require('sharp');
      const squarePng = path.join(__dirname, 'optima-square.png');
      // Resize to 256x256 square (required for .ico)
      await sharp(LOGO_PNG)
        .resize(256, 256, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
        .png()
        .toFile(squarePng);
      const icoBuffer = await pngToIco(squarePng);
      fs.writeFileSync(ICO_PATH, icoBuffer);
      fs.unlinkSync(squarePng);
      console.log('  Icon created: optima.ico (256x256)');
    } catch (err) {
      console.warn(`  Warning: Could not convert icon: ${err.message}`);
    }
  }

  // Build with pkg
  const targetStr = targets.join(',');
  const cmd = `npx @yao-pkg/pkg agent.js -t ${targetStr} --out-path dist --compress GZip`;
  console.log(`  Running: ${cmd}\n`);

  try {
    execSync(cmd, { cwd: __dirname, stdio: 'inherit' });
  } catch (err) {
    console.error('\n  Build failed. Make sure dependencies are installed:');
    console.error('  npm install\n');
    process.exit(1);
  }

  // Rename output files
  const renames = {
    'agent-win-x64.exe': 'optima-agent-win.exe',
    'agent-win.exe': 'optima-agent-win.exe',
    'agent.exe': 'optima-agent-win.exe',
    'agent-linux-x64': 'optima-agent-linux',
    'agent-linux': 'optima-agent-linux',
    'agent': null, // handled below
    'agent-macos-x64': 'optima-agent-macos',
    'agent-macos': 'optima-agent-macos',
  };

  const files = fs.readdirSync(DIST_DIR);
  for (const file of files) {
    if (file.startsWith('optima-agent-')) continue;

    let targetName = renames[file] || null;

    // Handle bare "agent" (no extension) for single linux/mac builds
    if (!targetName && file === 'agent' && targets.length === 1) {
      if (targets[0].includes('linux')) targetName = 'optima-agent-linux';
      else if (targets[0].includes('macos')) targetName = 'optima-agent-macos';
    }
    if (!targetName) continue;

    const src = path.join(DIST_DIR, file);
    const dst = path.join(DIST_DIR, targetName);
    if (fs.existsSync(dst) && src !== dst) fs.unlinkSync(dst);
    fs.renameSync(src, dst);
    const stats = fs.statSync(dst);
    const sizeMB = (stats.size / 1048576).toFixed(1);
    console.log(`  ${targetName} (${sizeMB} MB)`);
  }

  // Apply icon and version info to Windows .exe using rcedit
  const winExe = path.join(DIST_DIR, 'optima-agent-win.exe');
  if (buildingWindows && fs.existsSync(winExe)) {
    console.log('\n  Applying icon and version info to .exe...');
    try {
      const { rcedit } = require('rcedit');
      await rcedit(winExe, {
        icon: fs.existsSync(ICO_PATH) ? ICO_PATH : undefined,
        'version-string': {
          CompanyName: 'Sclera Technologies',
          FileDescription: 'Optima HAM/SAM Monitoring Agent',
          ProductName: 'Optima Agent',
          LegalCopyright: 'Copyright 2024-2026 Sclera Technologies, Inc. All rights reserved.',
          OriginalFilename: 'optima-agent.exe',
          InternalName: 'optima-agent',
        },
        'file-version': '1.0.0.0',
        'product-version': '1.0.0.0',
      });
      console.log('  Icon and metadata embedded successfully.');
      const stats = fs.statSync(winExe);
      console.log(`  Final size: ${(stats.size / 1048576).toFixed(1)} MB`);
    } catch (err) {
      console.warn(`  Warning: Could not apply rcedit: ${err.message}`);
      console.warn('  The .exe will work but may show "Unknown publisher".');
    }
  }

  // Clean up temp ico
  if (fs.existsSync(ICO_PATH)) {
    // Keep it for reference, don't delete
  }

  console.log('\n  Build complete! Binaries are in: deploy/agent/dist/');
  console.log('');
  console.log('  Deployment:');
  console.log('    Windows: optima-agent.exe --install --key=<KEY> --server=<URL>');
  console.log('    Linux:   ./optima-agent --install --key=<KEY> --server=<URL>');
  console.log('    macOS:   ./optima-agent --install --key=<KEY> --server=<URL>');
  console.log('');
  console.log('  Note: To fully remove "Unknown publisher" warning, the .exe must be');
  console.log('  signed with an Authenticode code signing certificate (EV or standard).');
  console.log('');
}

main().catch(err => {
  console.error('Build error:', err.message);
  process.exit(1);
});
