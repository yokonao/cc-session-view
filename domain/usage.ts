import type { AnyEntry, AssistantEntry } from "./model/jsonl";

type Usage = NonNullable<AssistantEntry["message"]["usage"]>;

// Session-level usage totals. We never price tokens ourselves (pricing drifts);
// cost is only reported when Claude Code recorded its own estimate.
export interface UsageStats {
	inputTokens: number;
	outputTokens: number;
	cacheReadTokens: number;
	cacheCreationTokens: number;
	// Assistant API responses that carried a usage payload.
	messages: number;
	webSearchRequests: number;
	webFetchRequests: number;
	toolCounts: Record<string, number>;
	models: string[];
	// totalCostUSD from the last cost-state entry, if any.
	costUSD?: number;
}

// Sum the top-level `usage` once per API response. Claude Code writes one entry
// per content block, each repeating the response's `message.id` and `usage`.
// The nested `iterations[]` breaks down that same total, so it is NOT summed.
export function aggregateUsage(entries: AnyEntry[]): UsageStats {
	const stats: UsageStats = {
		inputTokens: 0,
		outputTokens: 0,
		cacheReadTokens: 0,
		cacheCreationTokens: 0,
		messages: 0,
		webSearchRequests: 0,
		webFetchRequests: 0,
		toolCounts: {},
		models: [],
	};
	const models = new Set<string>();
	const usageById = new Map<string, Usage>();
	const usageWithoutId: Usage[] = [];

	for (const entry of entries) {
		if (entry.type === "cost-state") {
			stats.costUSD = entry.totalCostUSD;
			continue;
		}
		if (entry.type !== "assistant") continue;
		const { id, usage, model } = entry.message;
		if (model) models.add(model);

		for (const block of entry.message.content) {
			if (block.type === "tool_use") {
				stats.toolCounts[block.name] = (stats.toolCounts[block.name] ?? 0) + 1;
			}
		}

		if (!usage) continue;
		if (id) usageById.set(id, usage);
		else usageWithoutId.push(usage);
	}

	for (const usage of [...usageById.values(), ...usageWithoutId]) {
		stats.messages += 1;
		stats.inputTokens += usage.input_tokens;
		stats.outputTokens += usage.output_tokens;
		stats.cacheReadTokens += usage.cache_read_input_tokens ?? 0;
		stats.cacheCreationTokens += usage.cache_creation_input_tokens ?? 0;
		stats.webSearchRequests += usage.server_tool_use?.web_search_requests ?? 0;
		stats.webFetchRequests += usage.server_tool_use?.web_fetch_requests ?? 0;
	}

	stats.models = [...models].sort();
	return stats;
}

export function totalToolCalls(stats: UsageStats): number {
	let n = 0;
	for (const c of Object.values(stats.toolCounts)) n += c;
	return n;
}

// Cache-read tokens as a fraction of the total input surface (fresh input +
// cache writes + cache reads). 0 when no input was seen.
export function cacheHitRate(stats: UsageStats): number {
	const denom =
		stats.inputTokens + stats.cacheReadTokens + stats.cacheCreationTokens;
	return denom === 0 ? 0 : stats.cacheReadTokens / denom;
}
