/**
 * VibeSDK Gateway
 *
 * Zero-dependency TypeScript client for the VibeSDK REST API.
 * Uses the platform fetch() — works in Cloudflare Workers, Bun, Node 18+, browsers.
 * Auth is handled automatically via VIBESDK_API_KEY.
 *
 * One-line import:
 *   import { api } from '../gateway';
 *
 * Then call any endpoint:
 *   const apps = await api.listMine();
 *   const result = await api.build('Build a todo app');
 */

const BASE_URL = (
	typeof process !== 'undefined'
		? process.env.VIBESDK_BASE_URL
		: undefined
) ?? 'https://build.cloudflare.dev';

const API_KEY = (
	typeof process !== 'undefined'
		? process.env.VIBESDK_API_KEY
		: undefined
) ?? '';

// ---------------------------------------------------------------------------
// Token cache (in-memory, per process/worker invocation)
// ---------------------------------------------------------------------------

let _cachedToken: string | null = null;
let _expiresAtMs = 0;

async function getToken(apiKey = API_KEY, baseUrl = BASE_URL): Promise<string> {
	const skewMs = 30_000;
	if (_cachedToken && _expiresAtMs - skewMs > Date.now()) {
		return _cachedToken;
	}

	if (!apiKey) {
		throw new Error(
			'VIBESDK_API_KEY is not set. Export it before running your script:\n' +
			'  export VIBESDK_API_KEY=vibe_xxxxxxxxxxxxx'
		);
	}

	const resp = await fetch(`${baseUrl.replace(/\/$/, '')}/api/auth/exchange-api-key`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${apiKey}`,
		},
		body: '{}',
	});

	const body = await resp.json() as {
		success: boolean;
		data?: { accessToken: string; expiresAt: string };
		error?: { message: string };
	};

	if (!resp.ok || !body.success || !body.data) {
		const msg = body.error?.message ?? resp.statusText;
		throw new Error(`Auth failed (${resp.status}): ${msg}`);
	}

	_cachedToken = body.data.accessToken;
	_expiresAtMs = new Date(body.data.expiresAt).getTime();
	return _cachedToken;
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

async function req<T>(
	method: string,
	path: string,
	body?: unknown,
	baseUrl = BASE_URL,
	apiKey = API_KEY,
): Promise<T> {
	const token = await getToken(apiKey, baseUrl);
	const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
	if (body !== undefined) headers['Content-Type'] = 'application/json';

	const resp = await fetch(`${baseUrl.replace(/\/$/, '')}${path}`, {
		method,
		headers,
		body: body !== undefined ? JSON.stringify(body) : undefined,
	});

	if (!resp.ok) {
		const text = await resp.text().catch(() => '');
		throw new Error(`HTTP ${resp.status} ${path}: ${text || resp.statusText}`);
	}

	return resp.json() as Promise<T>;
}

// For streaming endpoints (NDJSON)
async function reqStream(
	method: string,
	path: string,
	body?: unknown,
	baseUrl = BASE_URL,
	apiKey = API_KEY,
): Promise<Response> {
	const token = await getToken(apiKey, baseUrl);
	const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
	if (body !== undefined) headers['Content-Type'] = 'application/json';

	const resp = await fetch(`${baseUrl.replace(/\/$/, '')}${path}`, {
		method,
		headers,
		body: body !== undefined ? JSON.stringify(body) : undefined,
	});

	if (!resp.ok) {
		const text = await resp.text().catch(() => '');
		throw new Error(`HTTP ${resp.status} ${path}: ${text || resp.statusText}`);
	}

	return resp;
}

// ---------------------------------------------------------------------------
// VibeAPI class
// ---------------------------------------------------------------------------

export class VibeAPI {
	constructor(
		private apiKey = API_KEY,
		private baseUrl = BASE_URL,
	) {}

	private get = <T>(path: string) => req<T>('GET', path, undefined, this.baseUrl, this.apiKey);
	private post = <T>(path: string, body?: unknown) => req<T>('POST', path, body, this.baseUrl, this.apiKey);
	private put = <T>(path: string, body?: unknown) => req<T>('PUT', path, body, this.baseUrl, this.apiKey);
	private del = <T>(path: string) => req<T>('DELETE', path, undefined, this.baseUrl, this.apiKey);

	/** Returns the raw access token (useful for curl commands). */
	async token(): Promise<string> {
		return getToken(this.apiKey, this.baseUrl);
	}

	// -----------------------------------------------------------------------
	// Agent / Build
	// -----------------------------------------------------------------------

	/**
	 * Start building a new app. Returns the raw streaming Response (NDJSON).
	 * Parse lines with JSON.parse() to get { agentId, websocketUrl, ... }.
	 */
	async build(
		prompt: string,
		opts: {
			projectType?: 'app' | 'component' | 'api';
			behaviorType?: 'phasic' | 'agentic';
			language?: string;
			frameworks?: string[];
			selectedTemplate?: string;
			credentials?: Record<string, string>;
		} = {},
	): Promise<Response> {
		return reqStream('POST', '/api/agent', {
			query: prompt,
			projectType: opts.projectType ?? 'app',
			behaviorType: opts.behaviorType ?? 'phasic',
			language: opts.language,
			frameworks: opts.frameworks,
			selectedTemplate: opts.selectedTemplate,
			credentials: opts.credentials,
		}, this.baseUrl, this.apiKey);
	}

	/** Connect to an existing agent session. */
	connect(agentId: string) {
		return this.get<unknown>(`/api/agent/${agentId}/connect`);
	}

	/** Get a short-lived WebSocket ticket for an agent. */
	wsTicket(agentId: string) {
		return this.post<unknown>('/api/ws-ticket', { resourceType: 'agent', resourceId: agentId });
	}

	// -----------------------------------------------------------------------
	// Apps
	// -----------------------------------------------------------------------

	/** List public apps. */
	listPublic(query: { limit?: number; offset?: number; sort?: string; order?: string; period?: string; framework?: string; search?: string } = {}) {
		const qs = new URLSearchParams(
			Object.fromEntries(Object.entries(query).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)]))
		).toString();
		return this.get<unknown>(`/api/apps/public${qs ? `?${qs}` : ''}`);
	}

	/** List all apps owned by the authenticated user. */
	listMine() {
		return this.get<unknown>('/api/apps');
	}

	/** List the 10 most recent apps. */
	listRecent() {
		return this.get<unknown>('/api/apps/recent');
	}

	/** List favorite apps. */
	listFavorites() {
		return this.get<unknown>('/api/apps/favorites');
	}

	/** Get detailed info about an app. */
	getApp(appId: string) {
		return this.get<unknown>(`/api/apps/${appId}`);
	}

	/** Delete an app (owner only). */
	deleteApp(appId: string) {
		return this.del<unknown>(`/api/apps/${appId}`);
	}

	/** Set app visibility: 'public' | 'private' | 'unlisted'. */
	setVisibility(appId: string, visibility: 'public' | 'private' | 'unlisted') {
		return this.put<unknown>(`/api/apps/${appId}/visibility`, { visibility });
	}

	/** Toggle star on an app. */
	toggleStar(appId: string) {
		return this.post<unknown>(`/api/apps/${appId}/star`);
	}

	/** Toggle favorite on an app. */
	toggleFavorite(appId: string) {
		return this.post<unknown>(`/api/apps/${appId}/favorite`);
	}

	/** Generate a git clone token for an app (owner only). */
	gitCloneToken(appId: string) {
		return this.post<unknown>(`/api/apps/${appId}/git/token`);
	}
}

// ---------------------------------------------------------------------------
// Default singleton — reads VIBESDK_API_KEY from environment
// ---------------------------------------------------------------------------
export const api = new VibeAPI();
