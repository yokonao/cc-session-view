import { expect, test } from "bun:test";
import { toolInputText } from "./tool";

test("MCP tools list top-level arguments as key=value", () => {
	const text = toolInputText("mcp__jira__create_issue", {
		project_key: "DEMO",
		summary: "Update the docs",
		priority: 2,
		labels: ["a", "b"],
		fields: { x: 1 },
	});
	expect(text).toBe(
		'project_key=DEMO summary="Update the docs" priority=2 labels=[2] fields={…}',
	);
});

test("MCP tools without arguments get no summary text", () => {
	expect(toolInputText("mcp__kakeibo__inspect_balance_sheet", {})).toBe("");
});

test("Unknown non-MCP tools get no summary text", () => {
	expect(toolInputText("SomeFutureTool", { foo: "bar" })).toBe("");
});

test("AskUserQuestion text lists question texts, not [object Object]", () => {
	const text = toolInputText("AskUserQuestion", {
		questions: [{ question: "Adopt?" }, { question: "Deprecate?" }],
	});
	expect(text).toBe("Adopt? / Deprecate?");
});

test("toolInputText does not truncate — search indexes the full command", () => {
	const cmd = "echo ".repeat(40).trim();
	expect(toolInputText("Bash", { command: cmd })).toBe(cmd);
});
