import { expect, test } from "bun:test";
import { parseEntries } from "./jsonl";

// Regression guard for schema drift: each line below is a real shape that used
// to fail validation and land in an __error__ entry. They must all parse cleanly.
const base = {
	parentUuid: null,
	isSidechain: false,
	uuid: "u",
	type: "attachment",
};
const att = (attachment: unknown) => JSON.stringify({ ...base, attachment });

const lines = [
	// last-prompt without lastPrompt (leafUuid variant)
	JSON.stringify({ type: "last-prompt", leafUuid: "l", sessionId: "s" }),
	// auto_mode without reminderType
	att({ type: "auto_mode" }),
	// hook_non_blocking_error without command/durationMs
	att({
		type: "hook_non_blocking_error",
		hookName: "Stop",
		hookEvent: "Stop",
		stderr: "boom",
		stdout: "",
		exitCode: 1,
	}),
	// user tool_result whose toolUseResult is an array
	JSON.stringify({
		parentUuid: null,
		isSidechain: false,
		type: "user",
		message: {
			role: "user",
			content: [{ type: "tool_result", tool_use_id: "t", content: "ok" }],
		},
		toolUseResult: [{ type: "text", text: "x" }],
	}),
	// newly-supported attachment types
	att({ type: "agent_listing_delta", addedTypes: ["claude"] }),
	att({ type: "date_change", newDate: "2026-07-05" }),
	att({ type: "dynamic_skill", skillDir: "/d", skillNames: ["a"] }),
	att({ type: "plan_mode", planFilePath: "/p", planExists: false }),
	// per-turn context attachments (Claude Code 2.1.300)
	att({
		type: "total_tokens_reminder",
		text: "<total_tokens>1</total_tokens>",
	}),
	att({ type: "silent_turn_reminder", text: "x" }),
	att({
		type: "deferred_tools_record",
		entries: [],
		toolInputCopies: [{ id: "t", copy: "wire" }],
	}),
	att({ type: "prompt_snapshot", systemPrompt: ["a"], reminderFold: true }),
	att({
		type: "environment",
		snapshot: { workingDirectory: "/w", isWorktree: false },
		changes: [{ field: "workingDirectory", from: "/old" }, { field: "shell" }],
	}),
	att({ type: "date", date: "2026-10-09", changed: true }),
	att({
		type: "instructions",
		files: [{ path: "/CLAUDE.md", type: "User", content: "c" }],
	}),
	att({ type: "session_context", context: { gitStatus: "clean" } }),
	att({ type: "credential_org", organizationUuid: "o" }),
	att({ type: "model", identity: { modelId: "claude-opus-5-5" }, text: "t" }),
	att({ type: "remote_session_change", url: null, managedPr: false }),
	// session bookkeeping entries (Claude Code 2.1.300)
	JSON.stringify({
		type: "agent-setting",
		agentSetting: "claude",
		sessionId: "s",
	}),
	JSON.stringify({ type: "atis-latch", atis: "", sessionId: "s" }),
	JSON.stringify({ type: "relocated", relocatedCwd: "/w", sessionId: "s" }),
	JSON.stringify({
		type: "cost-state",
		sessionId: "s",
		totalCostUSD: 0.5,
		modelUsage: { "claude-opus-5-5": {} },
		hasUnknownModelCost: false,
	}),
	JSON.stringify({
		type: "continued-in",
		sessionId: "s",
		continuedInSessionId: "s2",
		timestamp: "2026-10-13T14:10:29.478Z",
	}),
	JSON.stringify({
		type: "file-history-delta",
		messageId: "m",
		snapshotMessageId: "m0",
		trackingPath: "a.ts",
		backup: { backupFileName: null, version: 1, backupTime: "t" },
		timestamp: "t",
	}),
	JSON.stringify({
		type: "api-request",
		id: "r2",
		sessionId: "s",
		shapeHash: "h",
		params: { model: "claude-opus-5-5" },
		base: "r1",
		keep: 3,
		tail: ["b1"],
		cacheControl: [{}],
		requestDigest: "d",
	}),
	JSON.stringify({
		type: "api-request-shape",
		shapeHash: "h",
		shape: { system: [], tools: [] },
	}),
	JSON.stringify({
		type: "api-request-blob",
		hash: "b1",
		message: { role: "user", content: [] },
	}),
	// older shapes seen in the wild
	att({
		type: "queued_command",
		prompt: [{ type: "text", text: "hi" }],
		commandMode: "prompt",
	}),
	att({
		type: "hook_system_message",
		content: "tip",
		hookName: "PostToolUse:Bash",
		hookEvent: "PostToolUse",
	}),
	att({ type: "auto_mode_exit", bashFirst: false }),
	att({ type: "read_truncation_notice", banner: "[Truncated]" }),
	att({ type: "thinking_drop", requestId: "r", thinkingBlocksSent: 1 }),
	// Claude Code 2.1.302
	att({ type: "session_cron_carry", tasks: [] }),
	JSON.stringify({
		type: "system",
		subtype: "model_refusal_no_fallback",
		parentUuid: null,
		isSidechain: false,
		content: "",
		apiRefusalCategory: "c",
	}),
	JSON.stringify({
		type: "bridge-session",
		bridgeSessionId: "b",
		sessionId: "s",
	}),
	JSON.stringify({ type: "fork-context-ref", parentSessionId: "p" }),
];

test("previously-drifting entry shapes parse without errors", () => {
	const { entries } = parseEntries(lines.join("\n"));
	expect(entries.filter((e) => e.type === "__error__")).toEqual([]);
	expect(entries).toHaveLength(lines.length);
});

test("unparseable and invalid lines become __error__ entries", () => {
	const invalid = '{"type":"nope"}';
	const { entries } = parseEntries(`{bad json\n${invalid}`);
	expect(entries.map((e) => e.type)).toEqual(["__error__", "__error__"]);
	// raw is untouched so the app can re-parse it.
	expect(entries[1]).toMatchObject({ type: "__error__", raw: invalid });
	expect(JSON.parse((entries[1] as { raw: string }).raw)).toEqual({
		type: "nope",
	});
});
