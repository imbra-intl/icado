export interface InferenceTokenUsage {
	inputTokens: number;
	outputTokens: number;
	totalTokens: number;
}

export const ZERO_TOKEN_USAGE: InferenceTokenUsage = {
	inputTokens: 0,
	outputTokens: 0,
	totalTokens: 0,
};

function sanitizeTokenCount(value: number | undefined): number {
	if (!Number.isFinite(value) || value === undefined) {
		return 0;
	}
	return Math.max(0, Math.round(value));
}

export function normalizeInferenceTokenUsage(
	usage?: Partial<InferenceTokenUsage> | null,
): InferenceTokenUsage {
	if (!usage) {
		return { ...ZERO_TOKEN_USAGE };
	}

	const inputTokens = sanitizeTokenCount(usage.inputTokens);
	const outputTokens = sanitizeTokenCount(usage.outputTokens);
	const computedTotal = inputTokens + outputTokens;
	const totalTokens = sanitizeTokenCount(usage.totalTokens);

	return {
		inputTokens,
		outputTokens,
		totalTokens: totalTokens > 0 ? totalTokens : computedTotal,
	};
}

export function hasInferenceTokenUsage(usage?: Partial<InferenceTokenUsage> | null): boolean {
	const normalized = normalizeInferenceTokenUsage(usage);
	return (
		normalized.inputTokens > 0 ||
		normalized.outputTokens > 0 ||
		normalized.totalTokens > 0
	);
}

export function addInferenceTokenUsage(
	left?: Partial<InferenceTokenUsage> | null,
	right?: Partial<InferenceTokenUsage> | null,
): InferenceTokenUsage {
	const a = normalizeInferenceTokenUsage(left);
	const b = normalizeInferenceTokenUsage(right);
	return {
		inputTokens: a.inputTokens + b.inputTokens,
		outputTokens: a.outputTokens + b.outputTokens,
		totalTokens: a.totalTokens + b.totalTokens,
	};
}

export function subtractInferenceTokenUsage(
	current?: Partial<InferenceTokenUsage> | null,
	baseline?: Partial<InferenceTokenUsage> | null,
): InferenceTokenUsage {
	const currentUsage = normalizeInferenceTokenUsage(current);
	const baselineUsage = normalizeInferenceTokenUsage(baseline);

	const inputTokens = Math.max(0, currentUsage.inputTokens - baselineUsage.inputTokens);
	const outputTokens = Math.max(0, currentUsage.outputTokens - baselineUsage.outputTokens);
	const totalTokens = Math.max(0, currentUsage.totalTokens - baselineUsage.totalTokens);

	return {
		inputTokens,
		outputTokens,
		totalTokens,
	};
}

