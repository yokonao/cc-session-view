#!/usr/bin/env bun

import { lstatSync, statSync, unlinkSync } from "node:fs";
import { parseArgs } from "node:util";
import { createRoutes } from "./routes";

// Injected by `bun build --define` in the release workflow.
declare const CLAUSPECT_VERSION: string;

const DEFAULT_PORT = 0;

const USAGE = `Usage: clauspect [options]

Inspect Claude Code session histories in a local web viewer.

Options:
  -p, --port <port>  listen on this TCP port (default: a random free one)
  -r, --root <dir>   read session logs from <dir> (default: ~/.claude/projects)
  -u, --unix <path>  listen on a Unix domain socket instead of TCP
  -h, --help         show this help
  -v, --version      show the version`;

class UsageError extends Error {}

try {
	await main();
} catch (e) {
	console.error(`clauspect: ${e instanceof Error ? e.message : String(e)}`);
	if (e instanceof UsageError) {
		console.error("Run 'clauspect --help' for usage.");
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
			typeof CLAUSPECT_VERSION === "string" ? CLAUSPECT_VERSION : "dev",
		);
		return;
	}

	if (values.port && values.unix) {
		throw new UsageError("--port and --unix cannot be used together");
	}

	const port = values.port ? parseInt(values.port, 10) : DEFAULT_PORT;
	if (Number.isNaN(port) || port < 0 || port > 65535) {
		throw new UsageError("--port must be a valid port number");
	}

	if (
		values.root &&
		!statSync(values.root, { throwIfNoEntry: false })?.isDirectory()
	) {
		throw new Error(`--root ${values.root} is not a directory`);
	}

	if (values.unix && (await isStaleSocket(values.unix)))
		unlinkSync(values.unix);

	const routes = createRoutes({ root: values.root });
	const server = values.unix
		? Bun.serve({ unix: values.unix, routes })
		: Bun.serve({ port, routes });
	// stop() also removes the --unix socket file.
	for (const signal of ["SIGINT", "SIGTERM"] as const) {
		process.on(signal, async () => {
			await server.stop(true);
			process.exit(0);
		});
	}
	if (values.root) console.log(`reading sessions from ${values.root}`);

	console.log(
		values.unix
			? `clauspect server listening on unix:${values.unix}`
			: `clauspect server listening on http://localhost:${server.port}`,
	);
	console.log("Press Ctrl+C to stop.");
}

function parseOptions() {
	try {
		return parseArgs({
			args: process.argv.slice(2),
			options: {
				port: { type: "string", short: "p" },
				root: { type: "string", short: "r" },
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
