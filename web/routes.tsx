import { type SearchHit, scanEntries } from "../domain/search";
import { aggregateUsage } from "../domain/usage";
import { consoleLogger, SessionStore, type SubagentMeta } from "../store";
import type { ConfigView } from "./views/config";
import { detailPage } from "./views/detail";
import { listPage } from "./views/list";
import { rawPage } from "./views/raw";
import { type SessionSearchResult, searchPage } from "./views/search";
import { renderPage, Shell } from "./views/shell";
import { subagentPage } from "./views/subagent";
import { buildTurnGroups } from "./views/turn";

type BunRequest = Request & { params: Record<string, string> };

const html = { headers: { "content-type": "text/html; charset=utf-8" } };

function notFound(message: string): Response {
	const body = renderPage(
		<Shell title="cc-session-view — Not found">
			<div class="container">
				<a href="/" class="back">
					← Back to sessions
				</a>
				<div class="state err">{message}</div>
			</div>
		</Shell>,
	);
	return new Response(body, { ...html, status: 404 });
}

// A single toolUseId→agentId map covers every spawn point at any depth, since
// tool_use ids are unique across the whole session tree.
function agentMap(agents: SubagentMeta[]): Map<string, string> {
	return new Map(agents.map((a) => [a.toolUseId, a.agentId]));
}

const MAX_HITS_PER_SESSION = 5;

// Scan a session *and* its subagent sidecars — a subagent's transcript is part
// of the session's history, so text that only ever appeared inside one still has
// to be findable. Hits carry the agentId they came from so the view can link to
// the right page. listSessions is newest-first and Promise.all preserves order,
// so results stay newest-first. Files that fail to parse are skipped rather than
// aborting the whole search.
async function runSearch(
	store: SessionStore,
	query: string,
): Promise<SessionSearchResult[]> {
	const needle = query.toLowerCase();
	const sessions = await store.listSessions();
	const results = await Promise.all(
		sessions.map(async (session): Promise<SessionSearchResult | null> => {
			const agents = await store.listSubagents(session);
			const sources = [
				{ jsonl: session.jsonl, agentId: undefined as string | undefined },
				...agents.map((a) => ({ jsonl: a.jsonl, agentId: a.agentId })),
			];

			const hits: SearchHit[] = [];
			let totalHits = 0;

			for (const source of sources) {
				let entries: Awaited<ReturnType<typeof store.parseSession>>["entries"];
				try {
					entries = (await store.parseSession(source.jsonl)).entries;
				} catch {
					continue;
				}
				const scanned = scanEntries(entries, needle, MAX_HITS_PER_SESSION);
				totalHits += scanned.totalHits;
				for (const hit of scanned.hits) {
					if (hits.length >= MAX_HITS_PER_SESSION) break;
					hits.push({ ...hit, agentId: source.agentId });
				}
			}

			return totalHits > 0 ? { session, hits, totalHits } : null;
		}),
	);
	return results.filter((r): r is SessionSearchResult => r !== null);
}

// A log directory to serve. `root` defaults to $HOME/.claude/projects inside
// SessionStore; passing it points the app at any log directory — a fixture, a
// copy, another CLAUDE_CONFIG_DIR — without touching $HOME.
export interface LogSource {
	name: string;
	root?: string;
}

export function createRoutes(opts: { sources?: LogSource[] } = {}) {
	const sources = (opts.sources ?? [{ name: "" }]).map((s) => ({
		name: s.name,
		store: new SessionStore({ root: s.root, logger: consoleLogger }),
	}));
	const [defaultSource] = sources;
	if (!defaultSource) throw new Error("no log sources to serve");
	const multi = sources.length > 1;

	const pickSource = (req: Request) => {
		const name = new URL(req.url).searchParams.get("config");
		return sources.find((s) => s.name === name) ?? defaultSource;
	};
	const configView = (current: string): ConfigView | undefined =>
		multi ? { names: sources.map((s) => s.name), current } : undefined;

	// Session ids are UUIDs, so session URLs need no config qualifier.
	async function findSession(id: string | undefined) {
		if (!id) return undefined;
		for (const source of sources) {
			const session = await source.store.getSession(id);
			if (session) return { session, store: source.store, name: source.name };
		}
		return undefined;
	}

	return {
		"/": async (req: Request) => {
			const project = new URL(req.url).searchParams.get("project");
			const source = pickSource(req);
			const sessions = await source.store.listSessions();
			const projects = [...new Set(sessions.map((s) => s.directory))].sort();
			return new Response(
				listPage({ sessions, projects }, project, configView(source.name)),
				html,
			);
		},

		"/search": async (req: Request) => {
			const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
			const source = pickSource(req);
			const results = q ? await runSearch(source.store, q) : [];
			const totalHits = results.reduce((n, r) => n + r.totalHits, 0);
			return new Response(
				searchPage({
					query: q,
					results,
					totalHits,
					config: configView(source.name),
				}),
				html,
			);
		},

		"/sessions/:id": async (req: Request) => {
			const found = await findSession((req as BunRequest).params.id);
			if (!found) return notFound("Session not found");
			const { session, store } = found;
			const agents = await store.listSubagents(session);
			const parsed = await store.parseSession(session.jsonl);
			const groups = buildTurnGroups(parsed.entries);
			const opts = {
				sessionId: session.id,
				agentByToolUseId: agentMap(agents),
				rawBasePath: `/sessions/${session.id}/raw`,
			};

			// Usage totals span the session plus its subagents (real spend lives in
			// the sidecar agent files), so aggregate over all of them together.
			const entries = [...parsed.entries];
			for (const agent of agents) {
				const agentParsed = await store.parseSession(agent.jsonl);
				entries.push(...agentParsed.entries);
			}
			const usage = aggregateUsage(entries);

			return new Response(
				detailPage({
					session,
					agents,
					groups,
					opts,
					usage,
					backHref: multi ? `/?config=${encodeURIComponent(found.name)}` : "/",
				}),
				html,
			);
		},

		"/sessions/:id/agents/:agentId": async (req: Request) => {
			const p = (req as BunRequest).params;
			const found = await findSession(p.id);
			if (!found) return notFound("Subagent not found");
			const { session, store } = found;
			const agents = await store.listSubagents(session);
			const agent = agents.find((a) => a.agentId === p.agentId);
			if (!agent) return notFound("Subagent not found");
			const parsed = await store.parseSession(agent.jsonl);
			const groups = buildTurnGroups(parsed.entries);
			const opts = {
				sessionId: session.id,
				agentByToolUseId: agentMap(agents),
				rawBasePath: `/sessions/${session.id}/agents/${p.agentId}/raw`,
			};
			return new Response(
				subagentPage({
					session,
					agent,
					groups,
					opts,
					usage: aggregateUsage(parsed.entries),
				}),
				html,
			);
		},

		"/sessions/:id/raw": async (req: Request) => {
			const found = await findSession((req as BunRequest).params.id);
			if (!found) return notFound("Session not found");
			const { session, store } = found;
			const entries = await store.readRawEntries(session.jsonl);
			return new Response(
				rawPage({ session, backPath: `/sessions/${session.id}`, entries }),
				html,
			);
		},

		"/sessions/:id/agents/:agentId/raw": async (req: Request) => {
			const p = (req as BunRequest).params;
			const found = await findSession(p.id);
			if (!found) return notFound("Subagent not found");
			const { session, store } = found;
			const agents = await store.listSubagents(session);
			const agent = agents.find((a) => a.agentId === p.agentId);
			if (!agent) return notFound("Subagent not found");
			const entries = await store.readRawEntries(agent.jsonl);
			return new Response(
				rawPage({
					session,
					agent,
					backPath: `/sessions/${session.id}/agents/${p.agentId}`,
					entries,
				}),
				html,
			);
		},
	};
}
