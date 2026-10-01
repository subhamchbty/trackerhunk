// Fetch the prebuilt better-sqlite3 binary matching the installed Electron,
// so no compiler or Python is needed on the machine.
const { execFileSync } = require('child_process');
const path = require('path');

const electronVersion = require('electron/package.json').version;
const pkgDir = path.dirname(require.resolve('better-sqlite3/package.json'));
const bin = path.join(__dirname, '..', 'node_modules', '.bin', process.platform === 'win32' ? 'prebuild-install.cmd' : 'prebuild-install');

execFileSync(bin, ['--runtime=electron', `--target=${electronVersion}`], {
  cwd: pkgDir,
  stdio: 'inherit',
  shell: process.platform === 'win32'
});
