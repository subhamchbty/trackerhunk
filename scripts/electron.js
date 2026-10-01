// Run Electron with a clean environment. Terminals inside VS Code and other
// Electron apps export ELECTRON_RUN_AS_NODE=1, which makes Electron start as
// plain Node and crash on `app.disableHardwareAcceleration()`.
//
//   node scripts/electron.js .                        start the app
//   node scripts/electron.js scripts/build-icons.js   run another script
const { spawn } = require('child_process');
const electron = require('electron');

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
delete env.ELECTRON_NO_ATTACH_CONSOLE;

const args = process.argv.length > 2 ? process.argv.slice(2) : ['.'];
const child = spawn(electron, args, { stdio: 'inherit', env, windowsHide: false });
child.on('exit', (code) => process.exit(code ?? 0));
