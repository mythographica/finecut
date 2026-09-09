#!/usr/bin/env node
/**
 * Switch BFF static root directory.
 * Usage: node scripts/switch-static.js /path/to/static
 */
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const configPath = join(__dirname, '../src/config.js');

const newStatic = process.argv[2];
if (!newStatic) {
	console.error('Usage: npm run switch:static -- <path>');
	console.error('  Example: npm run switch:static -- /var/finecut/static');
	process.exit(1);
}

let content = readFileSync(configPath, 'utf-8');
content = content.replace(
	/STATIC_ROOT\s*:\s*[^,]+/,
	`STATIC_ROOT : '${newStatic}'`
);
writeFileSync(configPath, content);
console.log(`Static root switched to: ${newStatic}`);
console.log('Restart BFF for changes to take effect.');
