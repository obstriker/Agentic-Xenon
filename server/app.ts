import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AnswerRequest, ChangeEvent, KeysRequest, PlanUpdate, SteerRequest, UndoResult } from "../shared/contract.ts";
import { HttpError } from "./http-error.ts";
import type { Emit, Runtime } from "./runtime.ts";

const bad = (m: string) => new HttpError(400, m);

type Ctx = { params: string[]; body: any; query: URLSearchParams };
type Handler = (c: Ctx) => unknown;

/** The HTTP surface. It validates input and talks to a `Runtime`; it knows nothing about herdr or SQLite. */
export function createApp(makeRuntime: (emit: Emit) => Runtime) {
  const clients = new Set<ServerResponse>();
  const emit = (e: ChangeEvent) => clients.forEach((res) => res.write(`event: change\ndata: ${JSON.stringify(e)}\n\n`));
  const rt = makeRuntime(emit);

  const agent = (raw: string) => {
    const id = decodeURIComponent(raw);
    if (!rt.hasAgent(id)) throw new HttpError(404, `No agent "${id}"`);
    return id;
  };
  const text = (v: unknown, what: string) => {
    if (typeof v !== "string" || !v.trim() || v.length > 4000) throw bad(`${what} must be 1–4000 characters`);
    return v.trim();
  };

  const A = "([^/]+)"; // agent ids can be herdr pane ids like "w1:p2", sent URL-encoded
  const routes: [string, RegExp, Handler][] = [
    ["GET", /^\/api\/health$/, () => ({ ok: true, runtime: rt.name })],
    ["GET", /^\/api\/agents$/, () => rt.agents()],
    ["GET", new RegExp(`^/api/agents/${A}/plan$`), ({ params }) => rt.plan(agent(params[0]))],
    ["PUT", new RegExp(`^/api/agents/${A}/plan$`), ({ params, body }) => {
      const { steps } = body as PlanUpdate;
      if (!Array.isArray(steps)) throw bad("steps must be a list");
      steps.forEach((s) => s.label !== undefined && text(s.label, "label"));
      return rt.updatePlan(agent(params[0]), steps);
    }],
    ["GET", /^\/api\/steering$/, () => rt.steering()],
    ["POST", new RegExp(`^/api/agents/${A}/steer$`), async ({ params, body }) => {
      const { text: t, mode, queuedId } = body as SteerRequest;
      if (mode !== "queue" && mode !== "interrupt") throw bad('mode must be "queue" or "interrupt"');
      return { id: await rt.steer(agent(params[0]), { text: text(t, "text"), mode, queuedId }) };
    }],
    ["DELETE", new RegExp(`^/api/agents/${A}/queue/([\\w-]+)$`), ({ params }) => rt.removeNote(agent(params[0]), params[1])],
    ["POST", new RegExp(`^/api/agents/${A}/pause$`), ({ params }) => rt.pause(agent(params[0]))],
    ["POST", new RegExp(`^/api/agents/${A}/resume$`), ({ params }) => rt.resume(agent(params[0]))],
    ["GET", new RegExp(`^/api/agents/${A}/ledger$`), ({ params }) => rt.ledger(agent(params[0]))],
    ["GET", new RegExp(`^/api/agents/${A}/output$`), async ({ params, query }) => {
      const lines = Math.min(Math.max(Number(query.get("lines")) || 80, 1), 1000);
      return { text: await rt.output(agent(params[0]), lines) };
    }],
    ["POST", new RegExp(`^/api/agents/${A}/keys$`), async ({ params, body }) => {
      const { keys } = body as KeysRequest;
      if (!Array.isArray(keys) || !keys.length || keys.length > 8 || !keys.every((k) => typeof k === "string" && /^[a-z0-9+_-]{1,20}$/i.test(k))) throw bad("keys must be 1–8 key names like esc or ctrl+c");
      await rt.keys(agent(params[0]), keys);
    }],
    ["POST", /^\/api\/ledger\/([\w-]+)\/undo$/, ({ params }): UndoResult => {
      const r = rt.undo(params[0]);
      if (!Array.isArray(r)) throw new HttpError(409, r.blocked);
      return { undone: r };
    }],
    ["GET", /^\/api\/requests$/, () => rt.requests()],
    ["POST", /^\/api\/requests\/([\w-]+)\/answer$/, ({ params, body }) => rt.answer(params[0], text((body as AnswerRequest).value, "value"))],
    ["DELETE", /^\/api\/requests\/([\w-]+)\/answer$/, ({ params }) => rt.reopen(params[0])],
    ["GET", /^\/api\/quotas$/, () => rt.quotas()],
  ];

  const readBody = (req: IncomingMessage) =>
    new Promise<any>((resolve, reject) => {
      let raw = "";
      req.on("data", (c) => {
        raw += c;
        if (raw.length > 1_000_000) reject(new HttpError(413, "Body too large"));
      });
      req.on("end", () => {
        try {
          resolve(raw ? JSON.parse(raw) : {});
        } catch {
          reject(bad("Body must be JSON"));
        }
      });
    });

  const server = createServer(async (req, res) => {
    const send = (status: number, data?: unknown) => {
      res.writeHead(status, { "content-type": "application/json", "access-control-allow-origin": "*", "access-control-allow-headers": "content-type", "access-control-allow-methods": "GET,POST,PUT,DELETE" });
      res.end(data === undefined ? undefined : JSON.stringify(data));
    };
    try {
      const url = new URL(req.url ?? "/", "http://x");
      const { pathname } = url;
      if (req.method === "OPTIONS") return send(204);
      if (pathname === "/api/events") {
        res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive", "access-control-allow-origin": "*" });
        res.write(": connected\n\n");
        clients.add(res);
        req.on("close", () => clients.delete(res));
        return;
      }
      for (const [method, re, handler] of routes) {
        const m = re.exec(pathname);
        if (m && method === req.method) {
          const out = await handler({ params: m.slice(1), query: url.searchParams, body: method === "GET" || method === "DELETE" ? {} : await readBody(req) });
          return out === undefined ? send(204) : send(200, out);
        }
      }
      send(routes.some(([, re]) => re.test(pathname)) ? 405 : 404, { error: "Not found" });
    } catch (e) {
      const err = e instanceof HttpError ? e : new HttpError(500, "Something went wrong on the server");
      if (!(e instanceof HttpError)) console.error(e);
      send(err.status, { error: err.message });
    }
  });

  return { server, runtime: rt, close: () => clients.forEach((c) => c.end()) };
}
