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

export type CreditValidationAction = 'create_project' | 'chat_input';

export interface FrappeCreditValidationInput {
	user: AuthUser;
	action: CreditValidationAction;
	query?: string;
	agentId?: string;
}

export interface FrappeCreditValidationResult {
	allowed: boolean;
	reason?: string;
	totalCredits?: number;
	source: 'frappe' | 'fallback';
}

export interface FrappeCreditChargeInput {
	user: AuthUser;
	action: CreditValidationAction;
	query?: string;
	agentId?: string;
	inputTokens?: number;
	outputTokens?: number;
	model?: string;
	generationType?: string;
	referenceDoctype?: string;
	referenceName?: string;
}

export interface FrappeCreditChargeResult {
	success: boolean;
	reason?: string;
	creditsCharged?: number;
	totalCredits?: number;
	source: 'frappe' | 'fallback';
}

export interface FrappeCreditSummaryInput {
	user: AuthUser;
}

export interface FrappeCreditSummaryResult {
	totalCredits: number;
	dailyCredits: number;
	monthlyCredits: number;
	rolloverCredits: number;
	topupCredits: number;
	topupUrl: string;
	reason?: string;
	source: 'frappe' | 'fallback';
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

function readNumber(record: JsonRecord, keys: string[]): number | undefined {
	for (const key of keys) {
		const value = record[key];
		if (typeof value === 'number' && Number.isFinite(value)) {
			return value;
		}
		if (typeof value === 'string') {
			const trimmed = value.trim();
			if (trimmed.length === 0) {
				continue;
			}
			const parsed = Number(trimmed);
			if (Number.isFinite(parsed)) {
				return parsed;
			}
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

	private getFrappeBaseUrl(): string | undefined {
		return this.getEnvString('FRAPPE_BASE_URL') || this.getEnvString('FRAPPE_OAUTH_BASE_URL');
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
			const baseUrl = this.getFrappeBaseUrl();
			return baseUrl ? this.toAbsoluteUrl(baseUrl, configured) : null;
		}

		const baseUrl = this.getFrappeBaseUrl();
		if (!baseUrl) {
			return null;
		}

		return this.toAbsoluteUrl(baseUrl, defaultPath);
	}

	private buildRequestHeaders(request: Request): Headers {
		const headers = new Headers();
		headers.set('Content-Type', 'application/json');
		headers.set('Accept', 'application/json');

		const sharedSecret = this.getEnvString('FRAPPE_SHARED_SECRET');
		if (sharedSecret) {
			headers.set('X-Icado-Shared-Secret', sharedSecret);
		}

		const apiKey = this.getEnvString('FRAPPE_API_KEY');
		const apiSecret = this.getEnvString('FRAPPE_API_SECRET');
		const bearerToken = this.getEnvString('FRAPPE_BEARER_TOKEN');
		if (!sharedSecret && apiKey && apiSecret) {
			headers.set('Authorization', `token ${apiKey}:${apiSecret}`);
		} else if (!sharedSecret && bearerToken) {
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

	private getFrappeTopupUrl(): string {
		const configured = this.getEnvString('FRAPPE_CREDITS_TOPUP_URL');
		if (configured) {
			if (configured.startsWith('http://') || configured.startsWith('https://')) {
				return configured;
			}
			const baseUrl = this.getFrappeBaseUrl();
			if (baseUrl) {
				return this.toAbsoluteUrl(baseUrl, configured);
			}
		}

		const baseUrl = this.getFrappeBaseUrl();
		if (!baseUrl) {
			return '/';
		}
		return this.toAbsoluteUrl(baseUrl, '/ipanel/icado');
	}

	private collectPayloadRecords(payload: unknown): JsonRecord[] {
		if (!isRecord(payload)) {
			return [];
		}

		const records: JsonRecord[] = [payload];
		const nestedKeys = ['account', 'summary', 'credits', 'balances', 'data'];
		for (const key of nestedKeys) {
			const nested = payload[key];
			if (isRecord(nested)) {
				records.push(nested);
			}
		}

		return records;
	}

	private parseCreditSummary(
		data: unknown,
		source: 'frappe' | 'fallback',
		reason?: string,
	): FrappeCreditSummaryResult {
		const payload = this.unwrapMessagePayload(data);
		const records = this.collectPayloadRecords(payload);

		const pickNumber = (keys: string[]): number | undefined => {
			for (const record of records) {
				const value = readNumber(record, keys);
				if (value !== undefined) {
					return value;
				}
			}
			return undefined;
		};

		const pickString = (keys: string[]): string | undefined => {
			for (const record of records) {
				const value = readString(record, keys);
				if (value !== undefined) {
					return value;
				}
			}
			return undefined;
		};

		const dailyCredits = pickNumber([
			'daily_credits_balance',
			'daily_credits',
			'dailyCredits',
			'daily_balance',
		]) ?? 0;
		const monthlyCredits = pickNumber([
			'monthly_credits_balance',
			'monthly_credits',
			'monthlyCredits',
			'monthly_balance',
		]) ?? 0;
		const rolloverCredits = pickNumber([
			'rollover_credits_balance',
			'rollover_credits',
			'rolloverCredits',
			'rollover_balance',
		]) ?? 0;
		const topupCredits = pickNumber([
			'topup_credits_balance',
			'topup_credits',
			'topupCredits',
			'topup_balance',
			'top_up_credits_balance',
		]) ?? 0;

		const parsedTotalCredits = pickNumber([
			'total_credits',
			'totalCredits',
			'credits_balance',
			'current_credits',
			'available_credits',
			'balance',
		]);
		const totalCredits =
			parsedTotalCredits ?? dailyCredits + monthlyCredits + rolloverCredits + topupCredits;

		const configuredTopupUrl =
			pickString(['topup_url', 'topupUrl', 'top_up_url']) || this.getFrappeTopupUrl();

		return {
			totalCredits,
			dailyCredits,
			monthlyCredits,
			rolloverCredits,
			topupCredits,
			topupUrl: configuredTopupUrl,
			reason,
			source,
		};
	}

	private extractTotalCredits(data: unknown): number | undefined {
		const summary = this.parseCreditSummary(data, 'frappe');
		return Number.isFinite(summary.totalCredits) ? summary.totalCredits : undefined;
	}

	private estimateTokensFromText(value?: string): number {
		const text = (value || '').trim();
		if (!text) {
			return 1;
		}
		return Math.max(1, Math.ceil(text.length / 4));
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

	async validateCredits(
		request: Request,
		input: FrappeCreditValidationInput,
	): Promise<FrappeCreditValidationResult> {
		const strictValidation = this.getEnvBoolean('FRAPPE_STRICT_CREDIT_VALIDATION', false);
		const endpoint = this.resolveEndpoint(
			'FRAPPE_CREDITS_VALIDATE_URL',
			'/api/method/isaas.api.icado.validate_user_credits',
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
			action: input.action,
			query: input.query,
			agent_id: input.agentId,
			source: 'icado',
		};

		const callResult = await this.postJson(request, endpoint, payload);
		if (!callResult.ok) {
			const reason = callResult.errorMessage || 'Frappe credit validation failed';
			if (strictValidation) {
				return {
					allowed: false,
					reason,
					source: 'frappe',
				};
			}

			this.logger.warn('Frappe credit validation unavailable, allowing by fallback policy', {
				reason,
				status: callResult.status,
				action: input.action,
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
			totalCredits: this.extractTotalCredits(callResult.data),
			source: 'frappe',
		};
	}

	async chargeCredits(
		request: Request,
		input: FrappeCreditChargeInput,
	): Promise<FrappeCreditChargeResult> {
		const strictCharge = this.getEnvBoolean(
			'FRAPPE_STRICT_CREDIT_CHARGE',
			this.getEnvBoolean('FRAPPE_STRICT_CREDIT_VALIDATION', false),
		);
		const endpoint = this.resolveEndpoint(
			'FRAPPE_CREDITS_CHARGE_URL',
			'/api/method/isaas.api.icado.charge_ai_generation',
		);

		if (!endpoint) {
			if (strictCharge) {
				return {
					success: false,
					reason: 'Frappe credit charge endpoint is not configured',
					source: 'frappe',
				};
			}
			return {
				success: true,
				reason: 'Frappe credit charge endpoint is not configured',
				source: 'fallback',
			};
		}

		const estimatedInput = this.estimateTokensFromText(input.query);
		const inputTokens = Math.max(1, Math.round(input.inputTokens ?? estimatedInput));
		const outputTokens = Math.max(
			0,
			Math.round(input.outputTokens ?? Math.max(1, Math.ceil(inputTokens * 0.25))),
		);
		const generationType =
			input.generationType ||
			(input.action === 'create_project' ? 'Project Creation' : 'Chat');

		const payload = {
			user_id: input.user.id,
			email: input.user.email,
			action: input.action,
			agent_id: input.agentId,
			input_tokens: inputTokens,
			output_tokens: outputTokens,
			prompt: input.query,
			generation_type: generationType,
			model: input.model,
			reference_doctype: input.referenceDoctype,
			reference_name: input.referenceName,
			source: 'icado',
		};

		const callResult = await this.postJson(request, endpoint, payload);
		if (!callResult.ok) {
			const reason = callResult.errorMessage || 'Frappe credit charge failed';
			if (strictCharge) {
				return {
					success: false,
					reason,
					source: 'frappe',
				};
			}

			this.logger.warn('Frappe credit charge unavailable, allowing by fallback policy', {
				reason,
				status: callResult.status,
				action: input.action,
			});
			return {
				success: true,
				reason,
				source: 'fallback',
			};
		}

		const payloadData = this.unwrapMessagePayload(callResult.data);
		if (typeof payloadData === 'boolean') {
			return {
				success: payloadData,
				source: 'frappe',
				totalCredits: this.extractTotalCredits(callResult.data),
			};
		}

		if (!isRecord(payloadData)) {
			return {
				success: true,
				source: 'frappe',
				totalCredits: this.extractTotalCredits(callResult.data),
			};
		}

		const success = readBoolean(payloadData, ['success', 'ok', 'allowed']) ?? true;
		const reason = readString(payloadData, ['reason', 'message', 'error', 'detail', 'exc']);
		const creditsCharged = readNumber(payloadData, ['credits_charged', 'creditsCharged']);

		return {
			success,
			reason: reason || (success ? undefined : 'Credit charge rejected'),
			creditsCharged,
			totalCredits: this.extractTotalCredits(callResult.data),
			source: 'frappe',
		};
	}

	async getCreditSummary(
		request: Request,
		input: FrappeCreditSummaryInput,
	): Promise<FrappeCreditSummaryResult> {
		const endpoint = this.resolveEndpoint(
			'FRAPPE_CREDITS_SUMMARY_URL',
			'/api/method/isaas.api.icado.get_user_credit_summary',
		);

		if (!endpoint) {
			return this.parseCreditSummary(
				{},
				'fallback',
				'Frappe credit summary endpoint is not configured',
			);
		}

		const payload = {
			user_id: input.user.id,
			email: input.user.email,
			source: 'icado',
		};

		const callResult = await this.postJson(request, endpoint, payload);
		if (!callResult.ok) {
			return this.parseCreditSummary(
				{},
				'fallback',
				callResult.errorMessage || 'Failed to fetch credit summary from Frappe',
			);
		}

		return this.parseCreditSummary(callResult.data, 'frappe');
	}
}
