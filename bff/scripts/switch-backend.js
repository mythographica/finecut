#!/usr/bin/env node
/**
 * Switch BFF backend URL.
 * Usage: node scripts/switch-backend.js http://localhost:3001
 */
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const configPath = join(__dirname, '../src/config.js');

const newBackend = process.argv[2];
if (!newBackend) {
	console.error('Usage: npm run switch:backend -- <url>');
	console.error('  Example: npm run switch:backend -- http://localhost:3001');
	process.exit(1);
}

let content = readFileSync(configPath, 'utf-8');
content = content.replace(
	/BACKEND_URL\s*:\s*['"][^'"]+['"]/,
	`BACKEND_URL : '${newBackend}'`
);
writeFileSync(configPath, content);
console.log(`Backend switched to: ${newBackend}`);
console.log('Restart BFF for changes to take effect.');
