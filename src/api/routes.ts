import { Hono } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";
import { normalizeGittBountySnapshot } from "../bounties/ingest";
import {
  getBounty,
  getIssue,
  getPullRequest,
  getRepository,
  listAllIssues,
  listAllPullRequests,
  listBounties,
  listContributorIssues,
  listContributorPullRequests,
  listIssues,
  listOtherOpenPullRequests,
  listOpenIssues,
  listOpenPullRequests,
  listPullRequests,
  listRepositories,
  persistAdvisory,
  upsertBounty,
} from "../db/repositories";
import { fetchPublicContributorProfile } from "../github/public";
import { handleGitHubWebhook } from "../github/webhook";
import { buildOpenApiSpec } from "../openapi/spec";
import { getLatestRegistrySnapshot, refreshRegistry } from "../registry/sync";
import { buildIssueAdvisory, buildPullRequestAdvisory, buildRepositoryAdvisory } from "../rules/advisory";
import {
  buildBountyAdvisory,
  buildCollisionReport,
  buildConfigQuality,
  buildContributorOpportunities,
  buildContributorProfile,
  buildMaintainerPacket,
  buildPreflightResult,
  buildQueueHealth,
} from "../signals/engine";
import type { JobMessage } from "../types";
import { nowIso } from "../utils/json";
import { buildWorkboard } from "./workboard";

type AppBindings = { Bindings: Env };

const preflightSchema = z.object({
  repoFullName: z.string().min(3),
  contributorLogin: z.string().min(1).optional(),
  title: z.string().min(1),
  body: z.string().optional(),
  labels: z.array(z.string()).optional(),
  changedFiles: z.array(z.string()).optional(),
  linkedIssues: z.array(z.number().int().positive()).optional(),
  tests: z.array(z.string()).optional(),
  authorAssociation: z.string().optional(),
});

export function createApp() {
  const app = new Hono<AppBindings>();
  app.use("*", cors());

  app.get("/health", (c) => c.json({ status: "ok", service: "gittensory-api", time: nowIso() }));
  app.get("/openapi.json", (c) => c.json(buildOpenApiSpec()));

  app.get("/v1/registry/snapshot", async (c) => {
    const snapshot = await getLatestRegistrySnapshot(c.env);
    if (!snapshot) return c.json({ error: "registry_snapshot_not_found" }, 404);
    return c.json(snapshot);
  });

  app.get("/v1/repos", async (c) => c.json(await listRepositories(c.env)));

  app.get("/v1/repos/:owner/:repo", async (c) => {
    const repo = await getRepository(c.env, `${c.req.param("owner")}/${c.req.param("repo")}`);
    if (!repo) return c.json({ error: "repo_not_found" }, 404);
    return c.json(repo);
  });

  app.get("/v1/repos/:owner/:repo/advisory", async (c) => {
    const fullName = `${c.req.param("owner")}/${c.req.param("repo")}`;
    const repo = await getRepository(c.env, fullName);
    const advisory = buildRepositoryAdvisory(repo, fullName);
    await persistAdvisory(c.env, advisory);
    return c.json(advisory);
  });

  app.get("/v1/repos/:owner/:repo/workboard", async (c) => {
    const fullName = `${c.req.param("owner")}/${c.req.param("repo")}`;
    const repo = await getRepository(c.env, fullName);
    const issues = await listOpenIssues(c.env, fullName);
    return c.json(buildWorkboard(repo, issues));
  });

  app.get("/v1/repos/:owner/:repo/queue-health", async (c) => {
    const fullName = `${c.req.param("owner")}/${c.req.param("repo")}`;
    const repo = await getRepository(c.env, fullName);
    const issues = await listIssues(c.env, fullName);
    const pullRequests = await listPullRequests(c.env, fullName);
    const collisions = buildCollisionReport(fullName, issues, pullRequests);
    return c.json(buildQueueHealth(repo, issues, pullRequests, collisions));
  });

  app.get("/v1/repos/:owner/:repo/collisions", async (c) => {
    const fullName = `${c.req.param("owner")}/${c.req.param("repo")}`;
    const issues = await listIssues(c.env, fullName);
    const pullRequests = await listPullRequests(c.env, fullName);
    return c.json(buildCollisionReport(fullName, issues, pullRequests));
  });

  app.get("/v1/repos/:owner/:repo/config-quality", async (c) => {
    const fullName = `${c.req.param("owner")}/${c.req.param("repo")}`;
    const repo = await getRepository(c.env, fullName);
    const issues = await listIssues(c.env, fullName);
    const pullRequests = await listPullRequests(c.env, fullName);
    return c.json(buildConfigQuality(repo, issues, pullRequests, fullName));
  });

  app.get("/v1/repos/:owner/:repo/maintainer-packet", async (c) => {
    const fullName = `${c.req.param("owner")}/${c.req.param("repo")}`;
    const repo = await getRepository(c.env, fullName);
    const issues = await listOpenIssues(c.env, fullName);
    const pullRequests = await listOpenPullRequests(c.env, fullName);
    return c.json(buildMaintainerPacket(repo, issues, pullRequests, fullName));
  });

  app.get("/v1/repos/:owner/:repo/pulls/:number/advisory", async (c) => {
    const fullName = `${c.req.param("owner")}/${c.req.param("repo")}`;
    const number = Number(c.req.param("number"));
    const repo = await getRepository(c.env, fullName);
    const pr = Number.isFinite(number) ? await getPullRequest(c.env, fullName, number) : null;
    const otherOpenPullRequests = Number.isFinite(number) ? await listOtherOpenPullRequests(c.env, fullName, number) : [];
    const advisory = buildPullRequestAdvisory(repo, pr, { otherOpenPullRequests });
    await persistAdvisory(c.env, advisory);
    return c.json(advisory);
  });

  app.get("/v1/repos/:owner/:repo/issues/:number/advisory", async (c) => {
    const fullName = `${c.req.param("owner")}/${c.req.param("repo")}`;
    const number = Number(c.req.param("number"));
    const repo = await getRepository(c.env, fullName);
    const issue = Number.isFinite(number) ? await getIssue(c.env, fullName, number) : null;
    const advisory = buildIssueAdvisory(repo, issue);
    await persistAdvisory(c.env, advisory);
    return c.json(advisory);
  });

  app.get("/v1/contributors/:login/profile", async (c) => {
    const login = c.req.param("login");
    const [github, pullRequests, issues] = await Promise.all([
      fetchPublicContributorProfile(login),
      listContributorPullRequests(c.env, login),
      listContributorIssues(c.env, login),
    ]);
    return c.json(buildContributorProfile(login, github, pullRequests, issues));
  });

  app.get("/v1/contributors/:login/opportunities", async (c) => {
    const login = c.req.param("login");
    const [github, contributorPullRequests, contributorIssues, repositories, allIssues, allPullRequests] = await Promise.all([
      fetchPublicContributorProfile(login),
      listContributorPullRequests(c.env, login),
      listContributorIssues(c.env, login),
      listRepositories(c.env),
      listAllIssues(c.env),
      listAllPullRequests(c.env),
    ]);
    const profile = buildContributorProfile(login, github, contributorPullRequests, contributorIssues);
    return c.json({
      profile,
      opportunities: buildContributorOpportunities(profile, repositories, allIssues, allPullRequests),
    });
  });

  app.post("/v1/preflight/pr", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = preflightSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: "invalid_preflight_request", issues: parsed.error.issues }, 400);
    const repo = await getRepository(c.env, parsed.data.repoFullName);
    const issues = await listIssues(c.env, parsed.data.repoFullName);
    const pullRequests = await listPullRequests(c.env, parsed.data.repoFullName);
    return c.json(buildPreflightResult(parsed.data, repo, issues, pullRequests));
  });

  app.get("/v1/bounties", async (c) => c.json(await listBounties(c.env)));

  app.get("/v1/bounties/:id/advisory", async (c) => {
    const bounty = await getBounty(c.env, c.req.param("id"));
    if (!bounty) return c.json({ error: "bounty_not_found" }, 404);
    const [repo, issue] = await Promise.all([
      getRepository(c.env, bounty.repoFullName),
      getIssue(c.env, bounty.repoFullName, bounty.issueNumber),
    ]);
    return c.json(buildBountyAdvisory(bounty, repo, issue));
  });

  app.post("/v1/github/webhook", handleGitHubWebhook);

  app.post("/v1/internal/jobs/refresh-registry", async (c) => {
    const token = c.req.header("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token || token !== c.env.INTERNAL_JOB_TOKEN) return c.json({ error: "unauthorized" }, 401);
    const message: JobMessage = { type: "refresh-registry", requestedBy: "api" };
    await c.env.JOBS.send(message);
    return c.json({ ok: true, status: "queued" }, 202);
  });

  app.post("/v1/internal/jobs/refresh-registry/run", async (c) => {
    const token = c.req.header("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token || token !== c.env.INTERNAL_JOB_TOKEN) return c.json({ error: "unauthorized" }, 401);
    return c.json(await refreshRegistry(c.env));
  });

  app.post("/v1/internal/bounties/import", async (c) => {
    const token = c.req.header("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token || token !== c.env.INTERNAL_JOB_TOKEN) return c.json({ error: "unauthorized" }, 401);
    const body = await c.req.json().catch(() => null);
    const bounties = normalizeGittBountySnapshot(body);
    await Promise.all(bounties.map((bounty) => upsertBounty(c.env, bounty)));
    return c.json({ ok: true, imported: bounties.length });
  });

  return app;
}
