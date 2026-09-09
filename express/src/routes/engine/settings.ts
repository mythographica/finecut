/**
 * Settings API — read/update application settings.
 * Persists to data/settings.json, merges with runtime defaults on read.
 */
import { promises as fs } from 'fs';
import path from 'path';
import { Router, type Request, type Response } from 'express';
import '../../core/collections/engineTypes.js';
import { lookup } from 'mnemonica/module';
import { settings } from '../../core/settings.js';
import type { Settings } from '../../types/index.js';

const ROOT = process.cwd();
const SETTINGS_PATH = path.join(ROOT, 'data', 'settings.json');

const EngineRequest = lookup('EngineRequest');

async function loadSettings (): Promise<Settings> {
	try {
		const raw = await fs.readFile(SETTINGS_PATH, 'utf-8');
		return { ...settings, ...JSON.parse(raw) } as Settings;
	} catch {
		return settings;
	}
}

async function saveSettings (partial: Partial<Settings>): Promise<Settings> {
	const merged = { ...settings, ...partial };
	await fs.writeFile(SETTINGS_PATH, JSON.stringify(merged, null, '\t'), 'utf-8');
	return merged as Settings;
}

const router = Router();

router.get('/engine/settings', async (_req: Request, res: Response) => {
	const current = await loadSettings();
	res.type('application/json').send(current);
});

router.post('/engine/settings', async (req: Request, res: Response) => {
	const engineRequest = new EngineRequest({
		body: req.body as Record<string, unknown>
	});
	const data = engineRequest.data as Partial<Settings> | undefined;

	if (!data) {
		res.status(400).type('application/json').send({ error: 'Missing data field' });
		return;
	}

	const updated = await saveSettings(data);
	res.type('application/json').send(updated);
});

export default router;
