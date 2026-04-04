import {
	addInferenceTokenUsage,
	normalizeInferenceTokenUsage,
	subtractInferenceTokenUsage,
	ZERO_TOKEN_USAGE,
} from '../../agents/inferutils/tokenUsage';
import type { InferenceTokenUsage } from '../../agents/inferutils/tokenUsage';

const MAX_TRACKED_AGENTS = 1000;
type AgentUsageEntry = {
	usage: InferenceTokenUsage;
	updatedAt: number;
};

const usageByAgent = new Map<string, AgentUsageEntry>();

function enforceTrackerLimit(): void {
	if (usageByAgent.size <= MAX_TRACKED_AGENTS) {
		return;
	}

	let oldestKey: string | undefined;
	let oldestTimestamp = Number.POSITIVE_INFINITY;
	for (const [key, entry] of usageByAgent.entries()) {
		if (entry.updatedAt < oldestTimestamp) {
			oldestTimestamp = entry.updatedAt;
			oldestKey = key;
		}
	}

	if (oldestKey) {
		usageByAgent.delete(oldestKey);
	}
}

function normalizeAgentId(agentId: string): string {
	return (agentId || '').trim();
}

export function recordAgentTokenUsage(
	agentId: string,
	usage: Partial<InferenceTokenUsage> | null | undefined,
): InferenceTokenUsage {
	const normalizedAgentId = normalizeAgentId(agentId);
	if (!normalizedAgentId) {
		return { ...ZERO_TOKEN_USAGE };
	}

	const current = usageByAgent.get(normalizedAgentId)?.usage || { ...ZERO_TOKEN_USAGE };
	const next = addInferenceTokenUsage(current, usage);
	usageByAgent.set(normalizedAgentId, {
		usage: next,
		updatedAt: Date.now(),
	});
	enforceTrackerLimit();
	return next;
}

export function getAgentTokenUsageSnapshot(agentId: string): InferenceTokenUsage {
	const normalizedAgentId = normalizeAgentId(agentId);
	if (!normalizedAgentId) {
		return { ...ZERO_TOKEN_USAGE };
	}

	const current = usageByAgent.get(normalizedAgentId)?.usage;
	return normalizeInferenceTokenUsage(current);
}

export function getAgentTokenUsageDelta(
	agentId: string,
	snapshot: Partial<InferenceTokenUsage> | null | undefined,
): InferenceTokenUsage {
	const current = getAgentTokenUsageSnapshot(agentId);
	return subtractInferenceTokenUsage(current, snapshot);
}

export function clearAgentTokenUsage(agentId: string): void {
	const normalizedAgentId = normalizeAgentId(agentId);
	if (!normalizedAgentId) {
		return;
	}
	usageByAgent.delete(normalizedAgentId);
}
