const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const roots = ['src', 'scripts', 'tests'];
const files = [];
const collect = (directory) => {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) collect(fullPath);
    else if (entry.name.endsWith('.js')) files.push(fullPath);
  }
};
roots.forEach(collect);

for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log(`Syntax check passed for ${files.length} JavaScript files.`);
