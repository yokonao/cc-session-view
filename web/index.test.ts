import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const entry = `${import.meta.dir}/index.tsx`;

function run(...args: string[]) {
	const { exitCode, stdout, stderr } = Bun.spawnSync(["bun", entry, ...args]);
	return { exitCode, stdout: stdout.toString(), stderr: stderr.toString() };
}

describe("cli", () => {
	test.each([["--help"], ["-h"]])("%s prints usage", (flag) => {
		const r = run(flag);
		expect(r.exitCode).toBe(0);
		expect(r.stdout).toStartWith("Usage: cc-session-view");
	});

	test.each([["--version"], ["-v"]])("%s prints the version", (flag) => {
		const r = run(flag);
		expect(r.exitCode).toBe(0);
		expect(r.stdout).toBe("dev\n");
	});

	test.each([[["--nope"]], [["extra"]], [["--port"]], [["--port", "x"]]])(
		"%p is a usage error without a stack trace",
		(args) => {
			const r = run(...args);
			expect(r.exitCode).toBe(2);
			expect(r.stderr).toStartWith("cc-session-view: ");
			expect(r.stderr).toContain("cc-session-view --help");
			expect(r.stderr.split("\n")).toHaveLength(3);
		},
	);

	test("rejects a missing --root", () => {
		const r = run("--root", "/nonexistent/cc-session-view");
		expect(r.exitCode).toBe(1);
		expect(r.stderr).toBe(
			"cc-session-view: --root /nonexistent/cc-session-view is not a directory\n",
		);
	});

	test("rejects --root together with --config-dir", () => {
		const r = run("--root", "/tmp", "--config-dir", "/tmp");
		expect(r.exitCode).toBe(2);
		expect(r.stderr).toStartWith(
			"cc-session-view: --root and --config-dir cannot be used together",
		);
	});

	test("rejects config dirs that share a basename", () => {
		const base = mkdtempSync(join(tmpdir(), "cc-session-view-"));
		const dirs = ["a", "b"].map((p) => join(base, p, ".claude"));
		for (const d of dirs) mkdirSync(d, { recursive: true });
		const r = run("-c", dirs[0] ?? "", "-c", dirs[1] ?? "");
		rmSync(base, { recursive: true, force: true });
		expect(r.exitCode).toBe(2);
		expect(r.stderr).toStartWith(
			"cc-session-view: --config-dir names must be unique: .claude repeats",
		);
	});
});
