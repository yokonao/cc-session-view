import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRoutes } from "./routes";

const SESSION_ID = "00000000-0000-4000-8000-000000000001";
const AGENT_ID = "00000000-0000-4000-8000-0000000000a1";

// Only the subagent ever says this word — nothing in the parent session does.
const AGENT_ONLY = "zonkforth";

const line = (o: Record<string, unknown>) => `${JSON.stringify(o)}\n`;
const userEntry = (uuid: string, content: string, isSidechain: boolean) =>
	line({
		type: "user",
		parentUuid: null,
		isSidechain,
		uuid,
		timestamp: "2026-01-01T00:00:00Z",
		cwd: "/demo",
		message: { role: "user", content },
	});

const root = join(mkdtempSync(join(tmpdir(), "cc-session-view-")), "projects");
const projectDir = join(root, "demo");
const subagentsDir = join(projectDir, SESSION_ID, "subagents");
mkdirSync(subagentsDir, { recursive: true });

writeFileSync(
	join(projectDir, `${SESSION_ID}.jsonl`),
	userEntry("a", "hello from root", false),
);
writeFileSync(
	join(subagentsDir, `agent-${AGENT_ID}.jsonl`),
	userEntry("b", `the ${AGENT_ONLY} marker`, true),
);
writeFileSync(
	join(subagentsDir, `agent-${AGENT_ID}.meta.json`),
	JSON.stringify({
		agentType: "general-purpose",
		description: "demo",
		toolUseId: "toolu_1",
		spawnDepth: 1,
	}),
);

afterAll(() => rmSync(root, { recursive: true, force: true }));

const routes = createRoutes({ sources: [{ name: "fixture", root }] });
const req = (path: string) => new Request(`http://localhost${path}`);

test("--root points the app at an arbitrary log directory", async () => {
	const res = await routes["/"](req("/"));
	const body = await res.text();

	expect(res.status).toBe(200);
	expect(body).toContain(SESSION_ID);
	// Only the fixture is visible — the real ~/.claude is not consulted.
	expect(body).not.toContain(process.env.HOME ?? " ");
});

test("search finds text that exists only inside a subagent", async () => {
	const res = await routes["/search"](req(`/search?q=${AGENT_ONLY}`));
	const body = await res.text();

	expect(res.status).toBe(200);
	expect(body).toContain("1 hit");
	// The hit links to the subagent's own page, not the parent session's.
	expect(body).toContain(`/sessions/${SESSION_ID}/agents/${AGENT_ID}/raw`);
});

describe("multiple config dirs", () => {
	const OTHER_ID = "00000000-0000-4000-8000-000000000002";
	const otherRoot = join(
		mkdtempSync(join(tmpdir(), "cc-session-view-")),
		"projects",
	);
	mkdirSync(join(otherRoot, "demo"), { recursive: true });
	writeFileSync(
		join(otherRoot, "demo", `${OTHER_ID}.jsonl`),
		userEntry("c", "hello from work", false),
	);
	afterAll(() => rmSync(otherRoot, { recursive: true, force: true }));

	const multi = createRoutes({
		sources: [
			{ name: ".claude", root },
			{ name: ".claude-work", root: otherRoot },
		],
	});

	test("the list shows the first dir by default and switches with ?config", async () => {
		const first = await (await multi["/"](req("/"))).text();
		expect(first).toContain(SESSION_ID);
		expect(first).not.toContain(OTHER_ID);
		expect(first).toContain('href="/?config=.claude-work"');

		const other = await (await multi["/"](req("/?config=.claude-work"))).text();
		expect(other).toContain(OTHER_ID);
		expect(other).not.toContain(SESSION_ID);
	});

	test("search is scoped to the selected dir", async () => {
		const res = await multi["/search"](
			req("/search?q=hello&config=.claude-work"),
		);
		const body = await res.text();
		expect(body).toContain(OTHER_ID);
		expect(body).not.toContain(SESSION_ID);
		expect(body).toContain('name="config" value=".claude-work"');
	});

	test("session pages resolve from any dir and link back to it", async () => {
		const res = await multi["/sessions/:id"](
			Object.assign(req(`/sessions/${OTHER_ID}`), { params: { id: OTHER_ID } }),
		);
		expect(res.status).toBe(200);
		expect(await res.text()).toContain('href="/?config=.claude-work"');
	});

	test("a single dir renders no switcher", async () => {
		const body = await (await routes["/"](req("/"))).text();
		expect(body).not.toContain('class="config-tabs"');
	});
});
