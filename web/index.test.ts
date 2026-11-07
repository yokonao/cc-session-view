import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { networkInterfaces, tmpdir } from "node:os";
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

	test.each([
		[["--nope"]],
		[["extra"]],
		[["--port"]],
		[["--port", "x"]],
		[["--host", ""]],
		[["--host", "0.0.0.0", "--unix", "/tmp/x.sock"]],
	])("%p is a usage error without a stack trace", (args) => {
		const r = run(...args);
		expect(r.exitCode).toBe(2);
		expect(r.stderr).toStartWith("cc-session-view: ");
		expect(r.stderr).toContain("cc-session-view --help");
		expect(r.stderr.split("\n")).toHaveLength(3);
	});

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

	test.each([
		[[], "http://localhost:", "127.0.0.1"],
		[["--host", "::1"], "http://[::1]:", "::1"],
	])("%p listens on the loopback address", async (args, url, address) => {
		const root = mkdtempSync(join(tmpdir(), "cc-session-view-"));
		const proc = Bun.spawn(["bun", entry, "--root", root, ...args], {
			stdout: "pipe",
		});
		try {
			const line = await readLineContaining(proc.stdout, "listening on");
			expect(line).toContain(url);
			const port = Number(line.split(":").at(-1));
			const res = await fetch(`http://${url.slice(7, -1)}:${port}/`);
			expect(res.ok).toBe(true);
			const socket = await Bun.connect({
				hostname: address,
				port,
				socket: { data() {} },
			});
			expect(socket.remoteAddress).toBe(address);
			socket.end();
		} finally {
			proc.kill();
			await proc.exited;
			rmSync(root, { recursive: true, force: true });
		}
	});

	const external = Object.values(networkInterfaces())
		.flat()
		.find((i) => i && i.family === "IPv4" && !i.internal)?.address;

	test.skipIf(!external)(
		"is not reachable on a non-loopback address by default",
		async () => {
			const root = mkdtempSync(join(tmpdir(), "cc-session-view-"));
			const proc = Bun.spawn(["bun", entry, "--root", root], {
				stdout: "pipe",
			});
			try {
				const line = await readLineContaining(proc.stdout, "listening on");
				const port = Number(line.split(":").at(-1));
				const connect = Bun.connect({
					hostname: external ?? "",
					port,
					socket: { data() {} },
				});
				await expect(connect).rejects.toThrow();
			} finally {
				proc.kill();
				await proc.exited;
				rmSync(root, { recursive: true, force: true });
			}
		},
	);
});

async function readLineContaining(
	stream: ReadableStream<Uint8Array>,
	needle: string,
): Promise<string> {
	const decoder = new TextDecoder();
	let buf = "";
	for await (const chunk of stream) {
		buf += decoder.decode(chunk, { stream: true });
		const line = buf.split("\n").find((l) => l.includes(needle));
		if (line) return line;
	}
	throw new Error(`no line containing ${needle}: ${buf}`);
}
