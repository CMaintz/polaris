import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { describe, expect, it } from "vitest";
import { ConnectionService } from "../../application/action/connections";
import { DraftingService } from "../../application/action/drafting";
import { planningAppliers } from "../../application/action/appliers";
import { PlanningAgent } from "../../application/action/planning-agent";
import { ProposalService } from "../../application/action/proposals";
import { PublishingService } from "../../application/action/publishing";
import {
  TEST_CLOCK,
  actionKit,
  present,
  draftService,
  factsOf,
  fakeModels,
  planItems,
  resolver,
  secondUser,
  stores,
} from "../../testing/action";
import { AesGcmSecretBox } from "../../infrastructure/crypto/secret-box";
import {
  SqliteConnectionStore,
  SqliteOAuthStateStore,
} from "../../infrastructure/publishing/connection-store";
import { LinkedInApiProvider } from "../../infrastructure/publishing/linkedin-provider";
import { ManualPublishingProvider } from "../../infrastructure/publishing/manual-provider";
import { type AppEnv, errorResponse } from "../http";
import { actionRoutes } from "./action";
import { SESSION_COOKIE } from "./auth";

const TOKEN = ["fake", "token", "q".repeat(20)].join("-");

const linkedInFetch = (async (url: string | URL) => {
  if (String(url).endsWith("/accessToken"))
    return Response.json({ access_token: TOKEN, expires_in: 5184000 });
  return Response.json({ sub: "abc", name: "Ada" });
}) as typeof fetch;

async function setup() {
  const kit = await actionKit();
  const { container } = kit;
  const resolveAccount = resolver(container);
  const deps = { resolveAccount, audit: container.audit, clock: TEST_CLOCK };
  const box = new AesGcmSecretBox(Buffer.alloc(32, 5).toString("base64"));
  const config = {
    clientId: "c",
    clientSecret: "s",
    redirectUri: "https://p.example/cb",
    apiVersion: "202610",
  };
  const linkedin = new LinkedInApiProvider(
    config,
    new SqliteConnectionStore(container.db),
    box,
    linkedInFetch,
    TEST_CLOCK,
  );
  const providers = [linkedin, new ManualPublishingProvider()];
  const drafts = draftService(container);
  const { proposals: proposalStore, publications } = stores(container);
  const proposals = new ProposalService({
    ...deps,
    store: proposalStore,
    appliers: planningAppliers(container.planning),
  });
  const models = fakeModels(() => null).models;
  const ai = {
    models,
    recorder: container.aiStore,
    jobs: container.jobs,
    facts: factsOf(container),
    clock: TEST_CLOCK,
  };
  const routes = actionRoutes({
    drafts,
    drafting: new DraftingService({ ...ai, drafts }),
    proposals,
    planner: new PlanningAgent({ ...ai, ...deps, proposals, planItems: planItems(container) }),
    publishing: new PublishingService({
      ...deps,
      drafts,
      publications,
      providers,
      planItems: planItems(container),
      jobs: container.jobs,
    }),
    connections: new ConnectionService({
      ...deps,
      findAccount: (userId) => container.content.findAccount(userId),
      providers,
      states: new SqliteOAuthStateStore(container.db),
    }),
  });
  const app = new Hono<AppEnv>();
  app.onError((error, c) => errorResponse(c, error));
  app.use(async (c, next) => {
    c.set("user", await container.auth.authenticate(getCookie(c, SESSION_COOKIE)));
    await next();
  });
  app.route("/action", routes);
  const as =
    (cookie: string) =>
    async (path: string, init: RequestInit = {}) =>
      app.request(`/action${path}`, {
        ...init,
        headers: { cookie, "content-type": "application/json" },
      });
  const other = await secondUser(container);
  return {
    ...kit,
    proposalStore,
    ada: as(kit.user.cookie),
    eve: as(other.user.cookie),
    anonymous: as(""),
  };
}

const post = (body: object = {}) => ({ method: "POST", body: JSON.stringify(body) });

describe("action routes", () => {
  it("keeps drafts and proposals inside their account", async () => {
    const { ada, eve, proposalStore, accountId } = await setup();
    const { draft } = (await (await ada("/drafts", post({ title: "Mine", text: "x" }))).json()) as {
      draft: { id: string };
    };
    expect((await eve(`/drafts/${draft.id}`)).status).toBe(404);
    expect((await eve(`/drafts/${draft.id}/approve`, post())).status).toBe(404);
    await proposalStore.createMany(
      accountId,
      [
        {
          kind: "goal",
          payload: {
            name: "g",
            metric: "posts",
            target: 4,
            startDate: "2026-04-01",
            endDate: "2026-04-30",
          },
          origin: "ai",
          rationale: "r",
          evidence: [],
          interactionId: null,
          basedOnDemo: false,
        },
      ],
      null,
      "2026-03-15T00:00:00Z",
    );
    const { proposals } = (await (await ada("/proposals")).json()) as {
      proposals: { id: string }[];
    };
    expect((await eve(`/proposals/${present(proposals[0]).id}/approve`, post())).status).toBe(404);
    expect(await (await eve("/proposals")).json()).toEqual({ proposals: [] });
  });

  it("requires a signed-in user", async () => {
    const { anonymous } = await setup();
    expect((await anonymous("/drafts")).status).toBe(401);
    expect((await anonymous("/connections/linkedin-api/callback?code=c&state=s")).status).toBe(401);
  });
});

describe("LinkedIn connection", () => {
  const stateOf = async (request: (p: string, i?: RequestInit) => Promise<Response>) => {
    const { url } = (await (await request("/connections/linkedin-api/connect", post())).json()) as {
      url: string;
    };
    return new URL(url).searchParams.get("state") ?? "";
  };

  it("connects only with a state this user started, and only once", async () => {
    const { ada, eve } = await setup();
    const forged = await ada("/connections/linkedin-api/callback?code=c&state=forged");
    expect(forged.headers.get("location")).toContain("publishing=error");
    const evesState = await stateOf(eve);
    const stolen = await ada(`/connections/linkedin-api/callback?code=c&state=${evesState}`);
    expect(stolen.headers.get("location")).toContain("publishing=error");
    const state = await stateOf(ada);
    const ok = await ada(`/connections/linkedin-api/callback?code=c&state=${state}`);
    expect(ok.headers.get("location")).toBe("/settings?publishing=connected");
    const replay = await ada(`/connections/linkedin-api/callback?code=c&state=${state}`);
    expect(replay.headers.get("location")).toContain("publishing=error");
  });

  it("lists the connection without its token, and disconnect revokes it", async () => {
    const { ada, eve } = await setup();
    const state = await stateOf(ada);
    await ada(`/connections/linkedin-api/callback?code=c&state=${state}`);
    const listed = await (await ada("/connections")).text();
    expect(listed).not.toContain(TOKEN);
    expect(JSON.parse(listed).connections[0]).toMatchObject({
      id: "linkedin-api",
      state: "connected",
      displayName: "Ada",
    });
    expect((await (await eve("/connections")).json()).connections[0].state).toBe("not_connected");
    expect((await ada("/connections/linkedin-api", { method: "DELETE" })).status).toBe(204);
    expect((await (await ada("/connections")).json()).connections[0].state).toBe("not_connected");
  });
});
