const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const files = [
  ...fs.readdirSync(root).filter(name => name.endsWith('.js')),
  ...fs.readdirSync(path.join(root, 'js')).filter(name => name.endsWith('.js')).map(name => 'js/' + name),
  ...fs.readdirSync(path.join(root, 'worker')).filter(name => name.endsWith('.mjs')).map(name => 'worker/' + name),
].sort();
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', path.join(root, file)], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log(`Syntax checked ${files.length} active JavaScript files.`);
