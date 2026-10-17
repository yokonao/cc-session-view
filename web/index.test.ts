import { describe, expect, test } from "bun:test";

const entry = `${import.meta.dir}/index.tsx`;

function run(...args: string[]) {
	const { exitCode, stdout, stderr } = Bun.spawnSync(["bun", entry, ...args]);
	return { exitCode, stdout: stdout.toString(), stderr: stderr.toString() };
}

describe("cli", () => {
	test.each([["--help"], ["-h"]])("%s prints usage", (flag) => {
		const r = run(flag);
		expect(r.exitCode).toBe(0);
		expect(r.stdout).toStartWith("Usage: clauspect");
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
			expect(r.stderr).toStartWith("clauspect: ");
			expect(r.stderr).toContain("clauspect --help");
			expect(r.stderr.split("\n")).toHaveLength(3);
		},
	);

	test("rejects a missing --root", () => {
		const r = run("--root", "/nonexistent/clauspect");
		expect(r.exitCode).toBe(1);
		expect(r.stderr).toBe(
			"clauspect: --root /nonexistent/clauspect is not a directory\n",
		);
	});

	test("rejects --root together with --config-dir", () => {
		const r = run("--root", "/tmp", "--config-dir", "/tmp");
		expect(r.exitCode).toBe(2);
		expect(r.stderr).toStartWith(
			"clauspect: --root and --config-dir cannot be used together",
		);
	});

	test("rejects config dirs that share a basename", () => {
		const r = run("-c", "/tmp", "-c", "/private/tmp");
		expect(r.exitCode).toBe(2);
		expect(r.stderr).toStartWith(
			"clauspect: --config-dir names must be unique: tmp repeats",
		);
	});
});
