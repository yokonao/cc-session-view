import { expect, test } from "bun:test";
import type { AnyEntry } from "./model/jsonl";
import { aggregateUsage, cacheHitRate, totalToolCalls } from "./usage";

let seq = 0;

function assistant(
	usage: Record<string, unknown> | undefined,
	tools: string[] = [],
	model = "claude-opus-4-8",
	id = `m-${++seq}`,
): AnyEntry {
	return {
		type: "assistant",
		parentUuid: null,
		isSidechain: false,
		message: {
			id,
			type: "message",
			role: "assistant",
			model,
			content: tools.map((name) => ({
				type: "tool_use",
				id: `t-${name}`,
				name,
				input: {},
			})),
			usage: usage as never,
		},
	} as AnyEntry;
}

test("sums top-level usage and counts tools across assistant entries", () => {
	const stats = aggregateUsage([
		assistant(
			{
				input_tokens: 100,
				output_tokens: 20,
				cache_read_input_tokens: 900,
				cache_creation_input_tokens: 50,
			},
			["Bash", "Read"],
		),
		assistant(
			{
				input_tokens: 10,
				output_tokens: 5,
				server_tool_use: { web_search_requests: 2 },
			},
			["Bash"],
		),
	]);

	expect(stats.inputTokens).toBe(110);
	expect(stats.outputTokens).toBe(25);
	expect(stats.cacheReadTokens).toBe(900);
	expect(stats.cacheCreationTokens).toBe(50);
	expect(stats.messages).toBe(2);
	expect(stats.webSearchRequests).toBe(2);
	expect(stats.toolCounts).toEqual({ Bash: 2, Read: 1 });
	expect(totalToolCalls(stats)).toBe(3);
});

test("iterations are ignored so per-response breakdowns are not double counted", () => {
	const stats = aggregateUsage([
		assistant({
			input_tokens: 100,
			output_tokens: 40,
			iterations: [
				{ input_tokens: 60, output_tokens: 20 },
				{ input_tokens: 40, output_tokens: 20 },
			],
		}),
	]);
	expect(stats.inputTokens).toBe(100);
	expect(stats.outputTokens).toBe(40);
});

test("assistant entries without usage still contribute tool counts", () => {
	const stats = aggregateUsage([assistant(undefined, ["Edit"])]);
	expect(stats.messages).toBe(0);
	expect(stats.toolCounts).toEqual({ Edit: 1 });
});

test("cacheHitRate is cache reads over the whole input surface", () => {
	const stats = aggregateUsage([
		assistant({
			input_tokens: 100,
			output_tokens: 0,
			cache_read_input_tokens: 300,
			cache_creation_input_tokens: 100,
		}),
	]);
	expect(cacheHitRate(stats)).toBeCloseTo(0.6);
	expect(cacheHitRate(aggregateUsage([]))).toBe(0);
});

test("costUSD comes from the last cost-state entry", () => {
	const cost = (totalCostUSD: number) =>
		({ type: "cost-state", totalCostUSD }) as AnyEntry;
	expect(aggregateUsage([assistant(undefined)]).costUSD).toBeUndefined();
	expect(
		aggregateUsage([cost(0.4), assistant(undefined), cost(1.62)]).costUSD,
	).toBe(1.62);
});

test("entries sharing a message id count their usage once", () => {
	const usage = { input_tokens: 10, output_tokens: 30 };
	const stats = aggregateUsage([
		assistant(usage, [], undefined, "msg-1"),
		assistant(usage, ["Bash"], undefined, "msg-1"),
		assistant(usage, ["Read"], undefined, "msg-1"),
		assistant({ input_tokens: 5, output_tokens: 7 }, [], undefined, "msg-2"),
	]);
	expect(stats.messages).toBe(2);
	expect(stats.inputTokens).toBe(15);
	expect(stats.outputTokens).toBe(37);
	expect(stats.toolCounts).toEqual({ Bash: 1, Read: 1 });
});

test("the last entry of a message id supplies its usage", () => {
	const stats = aggregateUsage([
		assistant({ input_tokens: 10, output_tokens: 1 }, [], undefined, "msg-1"),
		assistant({ input_tokens: 10, output_tokens: 42 }, [], undefined, "msg-1"),
	]);
	expect(stats.outputTokens).toBe(42);
});

test("entries without a message id are counted individually", () => {
	const usage = { input_tokens: 10, output_tokens: 3 };
	const stats = aggregateUsage([
		assistant(usage, [], undefined, ""),
		assistant(usage, [], undefined, ""),
	]);
	expect(stats.messages).toBe(2);
	expect(stats.outputTokens).toBe(6);
});

test("session and subagent entries aggregated together sum distinct ids", () => {
	const session = [
		assistant({ input_tokens: 100, output_tokens: 10 }, [], undefined, "s-1"),
		assistant(
			{ input_tokens: 100, output_tokens: 10 },
			["Task"],
			undefined,
			"s-1",
		),
	];
	const subagent = [
		assistant({ input_tokens: 20, output_tokens: 4 }, [], undefined, "a-1"),
		assistant(
			{ input_tokens: 20, output_tokens: 4 },
			["Grep"],
			undefined,
			"a-1",
		),
		assistant({ input_tokens: 30, output_tokens: 6 }, [], undefined, "a-2"),
	];
	const stats = aggregateUsage([...session, ...subagent]);
	expect(stats.messages).toBe(3);
	expect(stats.inputTokens).toBe(150);
	expect(stats.outputTokens).toBe(20);
	expect(stats.toolCounts).toEqual({ Task: 1, Grep: 1 });
});
