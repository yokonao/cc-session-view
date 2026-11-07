#!/usr/bin/env bun

import { lstatSync, statSync, unlinkSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { createRoutes, type LogSource } from "./routes";

// Injected by `bun build --define` in the release workflow.
declare const CC_SESSION_VIEW_VERSION: string;

const DEFAULT_PORT = 0;
const DEFAULT_HOST = "127.0.0.1";

const USAGE = `Usage: cc-session-view [options]

Inspect Claude Code session histories in a local web viewer.

Options:
  -p, --port <port>        listen on this TCP port (default: a random free one)
      --host <addr>        listen on this address (default: 127.0.0.1); the viewer
                           has no authentication, so anyone who can reach it can
                           read every session
  -r, --root <dir>         read session logs from <dir> (default: ~/.claude/projects)
  -c, --config-dir <dir>   read session logs from <dir>/projects; repeat to switch
                           between several Claude config dirs in the UI
  -u, --unix <path>        listen on a Unix domain socket instead of TCP
  -h, --help               show this help
  -v, --version            show the version`;

class UsageError extends Error {}

try {
	await main();
} catch (e) {
	console.error(
		`cc-session-view: ${e instanceof Error ? e.message : String(e)}`,
	);
	if (e instanceof UsageError) {
		console.error("Run 'cc-session-view --help' for usage.");
		process.exit(2);
	}
	process.exit(1);
}

async function main() {
	const values = parseOptions();

	if (values.help) {
		console.log(USAGE);
		return;
	}
	if (values.version) {
		console.log(
			typeof CC_SESSION_VIEW_VERSION === "string"
				? CC_SESSION_VIEW_VERSION
				: "dev",
		);
		return;
	}

	if (values.port && values.unix) {
		throw new UsageError("--port and --unix cannot be used together");
	}
	if (values.host !== undefined && values.unix) {
		throw new UsageError("--host and --unix cannot be used together");
	}
	if (values.host === "") {
		throw new UsageError("--host must not be empty");
	}
	const hostname = values.host ?? DEFAULT_HOST;

	const port = values.port ? parseInt(values.port, 10) : DEFAULT_PORT;
	if (Number.isNaN(port) || port < 0 || port > 65535) {
		throw new UsageError("--port must be a valid port number");
	}

	if (values.root && values["config-dir"]) {
		throw new UsageError("--root and --config-dir cannot be used together");
	}

	if (values.root && !isDirectory(values.root)) {
		throw new Error(`--root ${values.root} is not a directory`);
	}

	const sources = values["config-dir"]
		? configDirSources(values["config-dir"])
		: [{ name: "", root: values.root }];

	if (values.unix && (await isStaleSocket(values.unix)))
		unlinkSync(values.unix);

	const routes = createRoutes({ sources });
	const server = values.unix
		? Bun.serve({ unix: values.unix, routes })
		: Bun.serve({ hostname, port, routes });
	// stop() also removes the --unix socket file.
	for (const signal of ["SIGINT", "SIGTERM"] as const) {
		process.on(signal, async () => {
			await server.stop(true);
			process.exit(0);
		});
	}
	for (const { root } of sources)
		if (root) console.log(`reading sessions from ${root}`);

	console.log(
		values.unix
			? `cc-session-view server listening on unix:${values.unix}`
			: `cc-session-view server listening on http://${displayHost(values.host)}:${server.port}`,
	);
	console.log("Press Ctrl+C to stop.");
}

function parseOptions() {
	try {
		return parseArgs({
			args: process.argv.slice(2),
			options: {
				port: { type: "string", short: "p" },
				host: { type: "string" },
				root: { type: "string", short: "r" },
				"config-dir": { type: "string", short: "c", multiple: true },
				unix: { type: "string", short: "u" },
				help: { type: "boolean", short: "h" },
				version: { type: "boolean", short: "v" },
			},
			allowPositionals: false,
		}).values;
	} catch (e) {
		throw new UsageError(e instanceof Error ? e.message : String(e));
	}
}

function displayHost(host: string | undefined): string {
	if (host === undefined) return "localhost";
	return host.includes(":") ? `[${host}]` : host;
}

function isDirectory(path: string): boolean {
	return statSync(path, { throwIfNoEntry: false })?.isDirectory() ?? false;
}

// Each config dir is labelled by its basename (.claude, .claude-work, …) in the UI.
function configDirSources(dirs: string[]): LogSource[] {
	const sources = dirs.map((dir) => {
		if (!isDirectory(dir))
			throw new Error(`--config-dir ${dir} is not a directory`);
		return { name: basename(resolve(dir)), root: join(dir, "projects") };
	});
	const names = sources.map((s) => s.name);
	const dup = names.find((n, i) => names.indexOf(n) !== i);
	if (dup)
		throw new UsageError(`--config-dir names must be unique: ${dup} repeats`);
	return sources;
}

async function isStaleSocket(path: string): Promise<boolean> {
	if (!lstatSync(path, { throwIfNoEntry: false })?.isSocket()) return false;
	try {
		const socket = await Bun.connect({ unix: path, socket: { data() {} } });
		socket.end();
		return false;
	} catch {
		return true;
	}
}
