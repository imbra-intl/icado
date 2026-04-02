import type { BehaviorType, ProjectType } from '../../agents/core/types';
import { createLogger } from '../../logger';
import type { AuthUser } from '../../types/auth-types';

type JsonRecord = Record<string, unknown>;

interface FrappeCallResult {
	ok: boolean;
	status: number;
	data: unknown;
	errorMessage?: string;
}

interface NormalizedAccessResult {
	allowed: boolean;
	reason?: string;
}

export interface FrappeProjectValidationInput {
	user: AuthUser;
	query: string;
}

export interface FrappeProjectValidationResult {
	allowed: boolean;
	reason?: string;
	source: 'frappe' | 'fallback';
}

export interface FrappeProjectSyncInput {
	user: AuthUser;
	agentId: string;
	query: string;
	websocketUrl: string;
	httpStatusUrl: string;
	behaviorType: BehaviorType;
	projectType: ProjectType | 'auto';
}

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);
const FALSE_VALUES = new Set(['0', 'false', 'no', 'off']);

function isRecord(value: unknown): value is JsonRecord {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(record: JsonRecord, keys: string[]): string | undefined {
	for (const key of keys) {
		const value = record[key];
		if (typeof value === 'string') {
			const trimmed = value.trim();
			if (trimmed.length > 0) {
				return trimmed;
			}
		}
	}

	return undefined;
}

function readBoolean(record: JsonRecord, keys: string[]): boolean | undefined {
	for (const key of keys) {
		const value = record[key];
		if (typeof value === 'boolean') {
			return value;
		}
		if (typeof value === 'string') {
			const normalized = value.trim().toLowerCase();
			if (TRUE_VALUES.has(normalized)) {
				return true;
			}
			if (FALSE_VALUES.has(normalized)) {
				return false;
			}
		}
		if (typeof value === 'number') {
			if (value === 1) return true;
			if (value === 0) return false;
		}
	}

	return undefined;
}

export class FrappeBridgeService {
	private readonly logger = createLogger('FrappeBridgeService');

	constructor(private readonly env: Env) {}

	private getEnvString(key: string): string | undefined {
		const envValue = (this.env as unknown as Record<string, unknown>)[key];
		if (typeof envValue !== 'string') {
			return undefined;
		}

		const trimmed = envValue.trim();
		return trimmed.length > 0 ? trimmed : undefined;
	}

	private getEnvBoolean(key: string, defaultValue: boolean): boolean {
		const value = this.getEnvString(key);
		if (!value) {
			return defaultValue;
		}

		const normalized = value.toLowerCase();
		if (TRUE_VALUES.has(normalized)) {
			return true;
		}
		if (FALSE_VALUES.has(normalized)) {
			return false;
		}

		return defaultValue;
	}

	private getEnvNumber(key: string, defaultValue: number): number {
		const value = this.getEnvString(key);
		if (!value) {
			return defaultValue;
		}

		const parsed = Number(value);
		if (Number.isFinite(parsed) && parsed > 0) {
			return parsed;
		}

		return defaultValue;
	}

	private toAbsoluteUrl(baseUrl: string, endpoint: string): string {
		return new URL(endpoint, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`).toString();
	}

	private resolveEndpoint(envKey: string, defaultPath: string): string | null {
		const configured = this.getEnvString(envKey);
		if (configured) {
			if (configured.startsWith('https://') || configured.startsWith('http://')) {
				return configured;
			}
			const baseUrl = this.getEnvString('FRAPPE_BASE_URL');
			return baseUrl ? this.toAbsoluteUrl(baseUrl, configured) : null;
		}

		const baseUrl = this.getEnvString('FRAPPE_BASE_URL');
		if (!baseUrl) {
			return null;
		}

		return this.toAbsoluteUrl(baseUrl, defaultPath);
	}

	private buildRequestHeaders(request: Request): Headers {
		const headers = new Headers();
		headers.set('Content-Type', 'application/json');
		headers.set('Accept', 'application/json');

		const apiKey = this.getEnvString('FRAPPE_API_KEY');
		const apiSecret = this.getEnvString('FRAPPE_API_SECRET');
		const bearerToken = this.getEnvString('FRAPPE_BEARER_TOKEN');
		if (apiKey && apiSecret) {
			headers.set('Authorization', `token ${apiKey}:${apiSecret}`);
		} else if (bearerToken) {
			headers.set('Authorization', `Bearer ${bearerToken}`);
		}

		const requestId = request.headers.get('CF-Ray') || request.headers.get('X-Request-Id');
		if (requestId) {
			headers.set('X-Icado-Request-Id', requestId);
		}

		return headers;
	}

	private extractReason(data: unknown): string | undefined {
		if (typeof data === 'string') {
			const trimmed = data.trim();
			return trimmed.length > 0 ? trimmed : undefined;
		}
		if (!isRecord(data)) {
			return undefined;
		}

		const direct = readString(data, ['reason', 'error', 'detail', 'exc']);
		if (direct) {
			return direct;
		}

		const nestedMessage = data.message;
		if (typeof nestedMessage === 'string') {
			const trimmed = nestedMessage.trim();
			return trimmed.length > 0 ? trimmed : undefined;
		}

		return undefined;
	}

	private unwrapMessagePayload(data: unknown): unknown {
		if (isRecord(data) && Object.prototype.hasOwnProperty.call(data, 'message')) {
			return data.message;
		}
		return data;
	}

	private normalizeAccessResult(data: unknown, defaultAllowed: boolean): NormalizedAccessResult {
		const payload = this.unwrapMessagePayload(data);

		if (typeof payload === 'boolean') {
			return { allowed: payload };
		}

		if (typeof payload === 'string') {
			return { allowed: defaultAllowed, reason: payload };
		}

		if (!isRecord(payload)) {
			return { allowed: defaultAllowed };
		}

		const allowed =
			readBoolean(payload, ['allowed', 'valid', 'ok', 'success', 'authenticated']) ?? defaultAllowed;
		const reason = readString(payload, ['reason', 'error', 'detail', 'message', 'exc']);

		return {
			allowed,
			reason,
		};
	}

	private async postJson(request: Request, endpoint: string, payload: unknown): Promise<FrappeCallResult> {
		const timeoutMs = this.getEnvNumber('FRAPPE_HTTP_TIMEOUT_MS', 12000);
		const controller = new AbortController();
		const timeoutHandle = setTimeout(() => controller.abort('Frappe request timeout'), timeoutMs);

		try {
			const response = await fetch(endpoint, {
				method: 'POST',
				headers: this.buildRequestHeaders(request),
				body: JSON.stringify(payload),
				signal: controller.signal,
			});

			const rawText = await response.text();
			let responseData: unknown = null;
			if (rawText.length > 0) {
				try {
					responseData = JSON.parse(rawText) as unknown;
				} catch {
					responseData = { raw: rawText };
				}
			}

			if (!response.ok) {
				const errorMessage =
					this.extractReason(responseData) || response.statusText || `HTTP ${response.status}`;
				return {
					ok: false,
					status: response.status,
					data: responseData,
					errorMessage,
				};
			}

			return {
				ok: true,
				status: response.status,
				data: responseData,
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return {
				ok: false,
				status: 0,
				data: null,
				errorMessage: message,
			};
		} finally {
			clearTimeout(timeoutHandle);
		}
	}

	async validateProjectGeneration(
		request: Request,
		input: FrappeProjectValidationInput,
	): Promise<FrappeProjectValidationResult> {
		const strictValidation = this.getEnvBoolean('FRAPPE_STRICT_PROJECT_VALIDATION', false);
		const endpoint = this.resolveEndpoint(
			'FRAPPE_PROJECT_VALIDATE_URL',
			'/api/method/isaas.api.icado.validate_project_generation',
		);

		if (!endpoint) {
			return {
				allowed: true,
				source: 'fallback',
			};
		}

		const payload = {
			user_id: input.user.id,
			email: input.user.email,
			query: input.query,
			source: 'icado',
		};

		const callResult = await this.postJson(request, endpoint, payload);
		if (!callResult.ok) {
			const reason = callResult.errorMessage || 'Frappe validation call failed';
			if (strictValidation) {
				return {
					allowed: false,
					reason,
					source: 'frappe',
				};
			}

			this.logger.warn('Frappe validation unavailable, allowing by fallback policy', {
				reason,
				status: callResult.status,
			});
			return {
				allowed: true,
				reason,
				source: 'fallback',
			};
		}

		const normalized = this.normalizeAccessResult(callResult.data, true);
		return {
			allowed: normalized.allowed,
			reason: normalized.reason,
			source: 'frappe',
		};
	}

	async syncCreatedProject(request: Request, input: FrappeProjectSyncInput): Promise<boolean> {
		const endpoint = this.resolveEndpoint(
			'FRAPPE_PROJECT_SYNC_URL',
			'/api/method/isaas.api.icado.sync_created_project',
		);

		if (!endpoint) {
			return true;
		}

		const payload = {
			user_id: input.user.id,
			email: input.user.email,
			agent_id: input.agentId,
			query: input.query,
			websocket_url: input.websocketUrl,
			http_status_url: input.httpStatusUrl,
			behavior_type: input.behaviorType,
			project_type: input.projectType,
			source: 'icado',
		};

		const callResult = await this.postJson(request, endpoint, payload);
		if (!callResult.ok) {
			this.logger.warn('Failed to sync created project to Frappe', {
				status: callResult.status,
				reason: callResult.errorMessage,
				agentId: input.agentId,
			});
			return false;
		}

		const normalized = this.normalizeAccessResult(callResult.data, true);
		if (!normalized.allowed) {
			this.logger.warn('Frappe rejected project sync response', {
				agentId: input.agentId,
				reason: normalized.reason,
			});
			return false;
		}

		return true;
	}
}
