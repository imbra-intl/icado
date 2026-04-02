/**
 * Frappe OAuth Provider
 * Implements Frappe OAuth 2.0 authentication using configurable endpoints.
 */

import { BaseOAuthProvider } from './base';
import type { OAuthUserInfo } from '../../types/auth-types';
import { OAuthProvider } from '../../types/auth-types';
import { createLogger } from '../../logger';

const logger = createLogger('FrappeOAuth');

type JsonRecord = Record<string, unknown>;

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

function envString(env: Env, key: string): string | undefined {
	const value = (env as unknown as Record<string, unknown>)[key];
	if (typeof value !== 'string') {
		return undefined;
	}
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

function resolveUrl(baseUrl: string, endpointPath: string): string {
	return new URL(endpointPath, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`).toString();
}

/**
 * Frappe OAuth Provider implementation
 */
export class FrappeOAuthProvider extends BaseOAuthProvider {
	protected readonly provider: OAuthProvider = 'frappe';
	protected readonly authorizationUrl: string;
	protected readonly tokenUrl: string;
	protected readonly userInfoUrl: string;
	protected readonly scopes: string[];

	constructor(
		clientId: string,
		clientSecret: string,
		redirectUri: string,
		authorizationUrl: string,
		tokenUrl: string,
		userInfoUrl: string,
		scopes: string[],
	) {
		super(clientId, clientSecret, redirectUri);
		this.authorizationUrl = authorizationUrl;
		this.tokenUrl = tokenUrl;
		this.userInfoUrl = userInfoUrl;
		this.scopes = scopes;
	}

	/**
	 * Some Frappe OAuth deployments are strict about unknown params.
	 * Keep authorization URL minimal and standards-compliant.
	 */
	async getAuthorizationUrl(state: string, codeVerifier?: string): Promise<string> {
		const params = new URLSearchParams({
			client_id: this.clientId,
			redirect_uri: this.redirectUri,
			response_type: 'code',
			scope: this.scopes.join(' '),
			state,
		});

		if (codeVerifier) {
			const challenge = await this.generateCodeChallenge(codeVerifier);
			params.append('code_challenge', challenge);
			params.append('code_challenge_method', 'S256');
		}

		return `${this.authorizationUrl}?${params.toString()}`;
	}

	/**
	 * Frappe may return OAuth tokens in either root object or { message: { ... } }.
	 */
	async exchangeCodeForTokens(code: string, codeVerifier?: string): Promise<{
		accessToken: string;
		refreshToken?: string;
		expiresIn?: number;
		tokenType: string;
	}> {
		const params = new URLSearchParams({
			grant_type: 'authorization_code',
			code,
			client_id: this.clientId,
			client_secret: this.clientSecret,
			redirect_uri: this.redirectUri,
		});

		if (codeVerifier) {
			params.append('code_verifier', codeVerifier);
		}

		const response = await fetch(this.tokenUrl, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
				Accept: 'application/json',
			},
			body: params.toString(),
		});

		if (!response.ok) {
			const errorText = await response.text();
			logger.error('Frappe token exchange failed', {
				status: response.status,
				error: errorText,
			});
			throw new Error(`Frappe token exchange failed: ${errorText}`);
		}

		const responseData = await response.json() as unknown;
		const payload = isRecord(responseData) && isRecord(responseData.message)
			? responseData.message
			: responseData;

		if (!isRecord(payload)) {
			throw new Error('Invalid token payload from Frappe');
		}

		const accessToken = readString(payload, ['access_token']);
		if (!accessToken) {
			throw new Error('Missing access_token in Frappe token response');
		}

		const refreshToken = readString(payload, ['refresh_token']);
		const tokenType = readString(payload, ['token_type']) || 'Bearer';
		const expiresInRaw = payload.expires_in;
		const expiresIn = typeof expiresInRaw === 'number'
			? expiresInRaw
			: (typeof expiresInRaw === 'string' ? Number(expiresInRaw) : undefined);

		return {
			accessToken,
			refreshToken,
			expiresIn: Number.isFinite(expiresIn as number) ? expiresIn : undefined,
			tokenType,
		};
	}

	/**
	 * Get user info from Frappe OAuth profile endpoint.
	 */
	async getUserInfo(accessToken: string): Promise<OAuthUserInfo> {
		const response = await fetch(this.userInfoUrl, {
			headers: {
				Authorization: `Bearer ${accessToken}`,
				Accept: 'application/json',
			},
		});

		if (!response.ok) {
			const errorText = await response.text();
			logger.error('Frappe getUserInfo failed', {
				status: response.status,
				error: errorText,
			});
			throw new Error(`Failed to get user info from Frappe: ${errorText}`);
		}

		const responseData = await response.json() as unknown;
		const payload = isRecord(responseData) && isRecord(responseData.message)
			? responseData.message
			: responseData;

		if (!isRecord(payload)) {
			throw new Error('Invalid user info payload from Frappe');
		}

		const email =
			readString(payload, ['email', 'user_email', 'username']) ||
			readString(payload, ['sub']);
		if (!email) {
			throw new Error('Frappe user profile did not include email');
		}

		const id = readString(payload, ['sub', 'user_id', 'name']) || email;
		const name = readString(payload, ['name', 'full_name', 'display_name']);
		const picture = readString(payload, ['picture', 'user_image', 'avatar_url']);
		const verifiedRaw = payload.email_verified;
		const emailVerified = typeof verifiedRaw === 'boolean' ? verifiedRaw : true;

		return {
			id,
			email: email.toLowerCase(),
			name,
			picture,
			emailVerified,
		};
	}

	/**
	 * Create Frappe OAuth provider instance.
	 *
	 * Required env:
	 * - FRAPPE_CLIENT_ID
	 * - FRAPPE_CLIENT_SECRET
	 * - FRAPPE_BASE_URL or FRAPPE_OAUTH_BASE_URL
	 */
	static create(env: Env, baseUrl: string): FrappeOAuthProvider {
		const clientId = envString(env, 'FRAPPE_CLIENT_ID');
		const clientSecret = envString(env, 'FRAPPE_CLIENT_SECRET');
		const frappeBaseUrl = envString(env, 'FRAPPE_OAUTH_BASE_URL') || envString(env, 'FRAPPE_BASE_URL');

		if (!clientId || !clientSecret || !frappeBaseUrl) {
			throw new Error('Frappe OAuth credentials not configured');
		}

		const authorizationUrl =
			envString(env, 'FRAPPE_OAUTH_AUTHORIZE_URL') ||
			resolveUrl(frappeBaseUrl, '/api/method/frappe.integrations.oauth2.authorize');
		const tokenUrl =
			envString(env, 'FRAPPE_OAUTH_TOKEN_URL') ||
			resolveUrl(frappeBaseUrl, '/api/method/frappe.integrations.oauth2.get_token');
		const userInfoUrl =
			envString(env, 'FRAPPE_OAUTH_USERINFO_URL') ||
			resolveUrl(frappeBaseUrl, '/api/method/frappe.integrations.oauth2.openid_profile');

		const scopesRaw = envString(env, 'FRAPPE_OAUTH_SCOPES');
		const scopes = scopesRaw ? scopesRaw.split(/\s+/).filter(Boolean) : ['openid', 'email', 'profile'];

		const redirectUri = `${baseUrl}/api/auth/callback/frappe`;

		return new FrappeOAuthProvider(
			clientId,
			clientSecret,
			redirectUri,
			authorizationUrl,
			tokenUrl,
			userInfoUrl,
			scopes,
		);
	}
}
