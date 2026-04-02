/**
 * iCado Gateway Server
 *
 * Runs on the Frappe machine. Python calls POST /build and gets back
 * {agentId} as soon as the blueprint is ready. The SDK then connects
 * the WebSocket and fires generate_all automatically (autoGenerate: true).
 * Generation runs in background — Vue frontend connects directly to iCado
 * WebSocket for live progress.
 *
 * Start:
 *   export ICADO_API_KEY=kRGU-aqbpLQsbTS11XqwtUIR39xqt9iwJnjf3P3aRBQ
 *   export ICADO_BASE_URL=https://imbra.site
 *   bun gateway/server.ts
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { PhasicClient } from '../sdk/src/index.ts';

const PORT    = parseInt(process.env.ICADO_GATEWAY_PORT ?? '7654');
const API_KEY = process.env.ICADO_API_KEY ?? '';
const BASE_URL = (process.env.ICADO_BASE_URL ?? 'https://imbra.site').replace(/\/$/, '');

// ── helpers ───────────────────────────────────────────────────────────────────

function json(res: ServerResponse, status: number, data: unknown): void {
	res.writeHead(status, { 'Content-Type': 'application/json' });
	res.end(JSON.stringify(data));
}

async function readBody(req: IncomingMessage): Promise<string> {
	return new Promise((resolve, reject) => {
		let body = '';
		req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
		req.on('end', () => resolve(body));
		req.on('error', reject);
	});
}

// ── server ────────────────────────────────────────────────────────────────────

const server = createServer(async (req, res) => {
	if (req.method === 'GET' && req.url === '/health') {
		return json(res, 200, { ok: true });
	}

	if (req.method !== 'POST' || req.url !== '/build') {
		return json(res, 404, { error: 'Not found' });
	}

	let body: string;
	try {
		body = await readBody(req);
	} catch {
		return json(res, 400, { error: 'Failed to read request body' });
	}

	let prompt: string;
	let projectType: string;
	let behaviorType: string;

	try {
		const parsed = JSON.parse(body) as { prompt?: string; projectType?: string; behaviorType?: string };
		prompt       = parsed.prompt?.trim() ?? '';
		projectType  = parsed.projectType  ?? 'app';
		behaviorType = parsed.behaviorType ?? 'phasic';
	} catch {
		return json(res, 400, { error: 'Invalid JSON' });
	}

	if (!prompt) {
		return json(res, 400, { error: 'prompt is required' });
	}

	try {
		const client = new PhasicClient({ baseUrl: BASE_URL, apiKey: API_KEY });

		// Build: POST /api/agent (blueprint) → connect WebSocket → send generate_all
		// autoGenerate: true sends generate_all as soon as the socket opens
		const session = await client.build(prompt, {
			projectType:  projectType as 'app' | 'component' | 'api',
			behaviorType: behaviorType as 'phasic' | 'agentic',
			autoGenerate: true,
		});

		const agentId = session.agentId;
		console.log(`[${agentId}] Agent created, generation started`);

		// Return agentId to Python immediately
		json(res, 200, { success: true, agentId });

		// Wait for generation_complete in background
		session.wait.generationComplete({ timeoutMs: 600_000 })
			.then(() => {
				console.log(`[${agentId}] generation_complete`);
				session.close();
			})
			.catch((err: unknown) => {
				console.error(`[${agentId}] error:`, err instanceof Error ? err.message : err);
				session.close();
			});

	} catch (err) {
		console.error('Build failed:', err);
		json(res, 500, { success: false, error: err instanceof Error ? err.message : String(err) });
	}
});

server.listen(PORT, '127.0.0.1', () => {
	console.log(`iCado gateway on http://127.0.0.1:${PORT}`);
	console.log(`  BASE_URL: ${BASE_URL}`);
	console.log(`  API_KEY:  ${API_KEY ? API_KEY.slice(0, 8) + '...' : '(not set — export ICADO_API_KEY)'}`);
});
