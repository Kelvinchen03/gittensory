import { afterEach, describe, expect, it, vi } from "vitest";
import { upsertBounty, upsertIssueFromGitHub, upsertPullRequestFromGitHub } from "../../src/db/repositories";
import { createApp } from "../../src/api/routes";
import { normalizeRegistryPayload } from "../../src/registry/normalize";
import { persistRegistrySnapshot } from "../../src/registry/sync";
import { createTestEnv } from "../helpers/d1";

describe("api routes", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("serves health and OpenAPI without storage", async () => {
    const app = createApp();
    const env = createTestEnv();

    const health = await app.request("/health", {}, env);
    expect(health.status).toBe(200);
    await expect(health.json()).resolves.toMatchObject({ status: "ok", service: "gittensory-api" });

    const spec = await app.request("/openapi.json", {}, env);
    expect(spec.status).toBe(200);
    await expect(spec.json()).resolves.toMatchObject({ info: { title: "Gittensory API" } });
  });

  it("queues signed GitHub webhooks and rejects invalid signatures", async () => {
    const app = createApp();
    const queued: unknown[] = [];
    const env = createTestEnv({
      JOBS: {
        async send(message: unknown) {
          queued.push(message);
        },
      } as unknown as Queue,
    });
    const body = JSON.stringify({
      action: "opened",
      installation: { id: 123 },
      repository: { full_name: "JSONbored/gittensory", name: "gittensory" },
    });
    const signature = await signWebhook(body, env.GITHUB_WEBHOOK_SECRET);

    const accepted = await app.request(
      "/v1/github/webhook",
      {
        method: "POST",
        body,
        headers: {
          "x-github-delivery": "delivery-1",
          "x-github-event": "pull_request",
          "x-hub-signature-256": signature,
        },
      },
      env,
    );

    expect(accepted.status).toBe(202);
    expect(queued).toHaveLength(1);

    const duplicate = await app.request(
      "/v1/github/webhook",
      {
        method: "POST",
        body,
        headers: {
          "x-github-delivery": "delivery-1",
          "x-github-event": "pull_request",
          "x-hub-signature-256": signature,
        },
      },
      env,
    );

    expect(duplicate.status).toBe(202);
    expect(await duplicate.json()).toMatchObject({ status: "duplicate" });
    expect(queued).toHaveLength(1);

    const rejected = await app.request(
      "/v1/github/webhook",
      {
        method: "POST",
        body,
        headers: {
          "x-github-delivery": "delivery-2",
          "x-github-event": "pull_request",
          "x-hub-signature-256": "sha256=bad",
        },
      },
      env,
    );

    expect(rejected.status).toBe(401);
  });

  it("serves deterministic signal endpoints from cached registry and GitHub metadata", async () => {
    const app = createApp();
    const env = createTestEnv();
    await seedSignalData(env);
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.endsWith("/users/oktofeesh1")) {
        return Response.json({ login: "oktofeesh1", public_repos: 42, followers: 7 });
      }
      if (url.includes("/users/oktofeesh1/repos")) {
        return Response.json([{ language: "TypeScript" }, { language: "Python" }, { language: "TypeScript" }]);
      }
      return new Response("not found", { status: 404 });
    });

    const queueHealth = await app.request("/v1/repos/entrius/allways-ui/queue-health", {}, env);
    expect(queueHealth.status).toBe(200);
    await expect(queueHealth.json()).resolves.toMatchObject({ repoFullName: "entrius/allways-ui", signals: { openPullRequests: 2 } });

    const configQuality = await app.request("/v1/repos/entrius/allways-ui/config-quality", {}, env);
    expect(configQuality.status).toBe(200);
    await expect(configQuality.json()).resolves.toMatchObject({ notObservedConfiguredLabels: expect.arrayContaining(["refactor"]) });

    const preflight = await app.request(
      "/v1/preflight/pr",
      {
        method: "POST",
        body: JSON.stringify({
          repoFullName: "entrius/allways-ui",
          title: "Fix dashboard cache refresh after reconnect",
          body: "Fixes #7",
          changedFiles: ["src/cache.ts"],
        }),
      },
      env,
    );
    expect(preflight.status).toBe(200);
    await expect(preflight.json()).resolves.toMatchObject({ status: "needs_work" });

    const opportunities = await app.request("/v1/contributors/oktofeesh1/opportunities", {}, env);
    expect(opportunities.status).toBe(200);
    const opportunityPayload = (await opportunities.json()) as {
      profile: { github: { topLanguages: string[] } };
      opportunities: Array<{ repoFullName: string }>;
    };
    expect(opportunityPayload.profile.github.topLanguages).toEqual(["TypeScript", "Python"]);
    expect(opportunityPayload.opportunities[0]).toMatchObject({ repoFullName: "entrius/allways-ui" });

    const imported = await app.request(
      "/v1/internal/bounties/import",
      {
        method: "POST",
        headers: { authorization: `Bearer ${env.INTERNAL_JOB_TOKEN}` },
        body: JSON.stringify({
          success: true,
          issue_count: 1,
          issues: [
            {
              id: 2,
              repository_full_name: "entrius/allways-ui",
              issue_number: 8,
              status: "Cancelled",
              bounty_alpha: "0.0000",
              target_alpha: "17.0000",
            },
          ],
        }),
      },
      env,
    );
    expect(imported.status).toBe(200);
    await expect(imported.json()).resolves.toMatchObject({ imported: 1 });

    const bounties = await app.request("/v1/bounties", {}, env);
    expect(bounties.status).toBe(200);
    await expect(bounties.json()).resolves.toHaveLength(2);

    const bountyAdvisory = await app.request("/v1/bounties/bounty-1/advisory", {}, env);
    expect(bountyAdvisory.status).toBe(200);
    await expect(bountyAdvisory.json()).resolves.toMatchObject({ lifecycle: "historical", fundingStatus: "target_only" });
  });
});

async function signWebhook(body: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const signed = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return `sha256=${[...new Uint8Array(signed)].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

async function seedSignalData(env: Env): Promise<void> {
  const snapshot = normalizeRegistryPayload(
    {
      "entrius/allways-ui": {
        emission_share: 0.01107,
        issue_discovery_share: 0,
        label_multipliers: { bug: 1.1, enhancement: 1, feature: 1.25, refactor: 0.5 },
        trusted_label_pipeline: true,
        maintainer_cut: 0,
      },
    },
    { kind: "raw-github", url: "https://example.test/master_repositories.json" },
    "2026-05-23T00:00:00.000Z",
  );
  await persistRegistrySnapshot(env, snapshot);
  await upsertIssueFromGitHub(env, "entrius/allways-ui", {
    number: 7,
    title: "Dashboard cache refresh fails after reconnect",
    state: "open",
    html_url: "https://github.com/entrius/allways-ui/issues/7",
    user: { login: "reporter" },
    labels: [{ name: "bug" }],
    body: "Cache refresh fails after reconnect.",
  });
  await upsertIssueFromGitHub(env, "entrius/allways-ui", {
    number: 8,
    title: "Add reconnect regression coverage",
    state: "open",
    html_url: "https://github.com/entrius/allways-ui/issues/8",
    user: { login: "reporter" },
    labels: [{ name: "feature" }],
    body: "Reconnect flows need regression coverage.",
  });
  await upsertPullRequestFromGitHub(env, "entrius/allways-ui", {
    number: 12,
    title: "Fix dashboard cache refresh after reconnect",
    state: "open",
    html_url: "https://github.com/entrius/allways-ui/pull/12",
    user: { login: "oktofeesh1" },
    author_association: "NONE",
    head: { sha: "abc123", ref: "fix-cache" },
    base: { ref: "test" },
    labels: [{ name: "bug" }],
    body: "Fixes #7",
  });
  await upsertPullRequestFromGitHub(env, "entrius/allways-ui", {
    number: 13,
    title: "Alternative cache reconnect fix",
    state: "open",
    html_url: "https://github.com/entrius/allways-ui/pull/13",
    user: { login: "other" },
    author_association: "NONE",
    head: { sha: "def456", ref: "alt-cache" },
    base: { ref: "test" },
    labels: [{ name: "bug" }],
    body: "Fixes #7",
  });
  await upsertBounty(env, {
    id: "bounty-1",
    repoFullName: "entrius/allways-ui",
    issueNumber: 7,
    status: "Completed",
    amountText: "0.0000",
    sourceUrl: "contract://issues/1",
    payload: { target_alpha: "74.0000", bounty_alpha: "0.0000" },
  });
}
