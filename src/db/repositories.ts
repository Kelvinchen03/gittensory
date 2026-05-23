import { and, desc, eq, not } from "drizzle-orm";
import { getDb } from "./client";
import { advisories, bounties, installations, issues, pullRequests, repositories, webhookEvents } from "./schema";
import type {
  Advisory,
  BountyRecord,
  GitHubIssuePayload,
  GitHubPullRequestPayload,
  GitHubRepositoryPayload,
  GitHubWebhookPayload,
  IssueRecord,
  PullRequestRecord,
  RegistryRepoConfig,
  RepositoryRecord,
} from "../types";
import { jsonString, nowIso, parseJson, repoParts } from "../utils/json";

export async function upsertInstallation(env: Env, payload: GitHubWebhookPayload): Promise<void> {
  if (!payload.installation?.id) return;
  const account = payload.installation.account;
  const db = getDb(env.DB);
  await db
    .insert(installations)
    .values({
      id: payload.installation.id,
      accountLogin: account?.login ?? "unknown",
      accountId: account?.id ?? 0,
      targetType: payload.installation.target_type ?? account?.type ?? "unknown",
      repositorySelection: payload.installation.repository_selection,
      permissionsJson: jsonString((payload.installation.permissions ?? {}) as Record<string, string>),
      eventsJson: jsonString(payload.installation.events ?? []),
      suspendedAt: payload.installation.suspended_at ?? undefined,
      updatedAt: nowIso(),
    })
    .onConflictDoUpdate({
      target: installations.id,
      set: {
        accountLogin: account?.login ?? "unknown",
        accountId: account?.id ?? 0,
        targetType: payload.installation.target_type ?? account?.type ?? "unknown",
        repositorySelection: payload.installation.repository_selection,
        permissionsJson: jsonString((payload.installation.permissions ?? {}) as Record<string, string>),
        eventsJson: jsonString(payload.installation.events ?? []),
        suspendedAt: payload.installation.suspended_at ?? undefined,
        updatedAt: nowIso(),
      },
    });
}

export async function markInstallationDeleted(env: Env, installationId: number): Promise<void> {
  const db = getDb(env.DB);
  await db.update(installations).set({ suspendedAt: nowIso(), updatedAt: nowIso() }).where(eq(installations.id, installationId));
  await db
    .update(repositories)
    .set({ isInstalled: false, installationId: null, updatedAt: nowIso() })
    .where(eq(repositories.installationId, installationId));
}

export async function upsertRepositoryFromGitHub(env: Env, repo: GitHubRepositoryPayload, installationId?: number): Promise<void> {
  const db = getDb(env.DB);
  const parts = repoParts(repo.full_name);
  await db
    .insert(repositories)
    .values({
      fullName: repo.full_name,
      owner: repo.owner?.login ?? parts.owner,
      name: repo.name,
      installationId,
      isInstalled: installationId !== undefined,
      isPrivate: repo.private ?? false,
      htmlUrl: repo.html_url,
      defaultBranch: repo.default_branch,
      updatedAt: nowIso(),
    })
    .onConflictDoUpdate({
      target: repositories.fullName,
      set: {
        owner: repo.owner?.login ?? parts.owner,
        name: repo.name,
        installationId,
        isInstalled: installationId !== undefined,
        isPrivate: repo.private ?? false,
        htmlUrl: repo.html_url,
        defaultBranch: repo.default_branch,
        updatedAt: nowIso(),
      },
    });
}

export async function upsertPullRequestFromGitHub(
  env: Env,
  repoFullName: string,
  pr: GitHubPullRequestPayload,
): Promise<PullRequestRecord> {
  const record = toPullRequestRecord(repoFullName, pr);
  const db = getDb(env.DB);
  await db
    .insert(pullRequests)
    .values({
      id: `${repoFullName}#${pr.number}`,
      repoFullName,
      number: pr.number,
      title: pr.title,
      state: pr.state,
      authorLogin: pr.user?.login,
      authorAssociation: pr.author_association,
      headSha: pr.head?.sha,
      headRef: pr.head?.ref,
      baseRef: pr.base?.ref,
      mergedAt: pr.merged_at ?? undefined,
      htmlUrl: pr.html_url,
      labelsJson: jsonString(record.labels),
      linkedIssuesJson: jsonString(record.linkedIssues),
      payloadJson: jsonString(pr as unknown as Record<string, unknown>),
      updatedAt: nowIso(),
    })
    .onConflictDoUpdate({
      target: [pullRequests.repoFullName, pullRequests.number],
      set: {
        title: pr.title,
        state: pr.state,
        authorLogin: pr.user?.login,
        authorAssociation: pr.author_association,
        headSha: pr.head?.sha,
        headRef: pr.head?.ref,
        baseRef: pr.base?.ref,
        mergedAt: pr.merged_at ?? undefined,
        htmlUrl: pr.html_url,
        labelsJson: jsonString(record.labels),
        linkedIssuesJson: jsonString(record.linkedIssues),
        payloadJson: jsonString(pr as unknown as Record<string, unknown>),
        updatedAt: nowIso(),
      },
    });
  return record;
}

export async function upsertIssueFromGitHub(env: Env, repoFullName: string, issue: GitHubIssuePayload): Promise<IssueRecord> {
  const record = toIssueRecord(repoFullName, issue);
  const db = getDb(env.DB);
  await db
    .insert(issues)
    .values({
      id: `${repoFullName}#${issue.number}`,
      repoFullName,
      number: issue.number,
      title: issue.title,
      state: issue.state,
      authorLogin: issue.user?.login,
      authorAssociation: issue.author_association,
      htmlUrl: issue.html_url,
      labelsJson: jsonString(record.labels),
      linkedPrsJson: jsonString(record.linkedPrs),
      payloadJson: jsonString(issue as unknown as Record<string, unknown>),
      updatedAt: nowIso(),
    })
    .onConflictDoUpdate({
      target: [issues.repoFullName, issues.number],
      set: {
        title: issue.title,
        state: issue.state,
        authorLogin: issue.user?.login,
        authorAssociation: issue.author_association,
        htmlUrl: issue.html_url,
        labelsJson: jsonString(record.labels),
        linkedPrsJson: jsonString(record.linkedPrs),
        payloadJson: jsonString(issue as unknown as Record<string, unknown>),
        updatedAt: nowIso(),
      },
    });
  return record;
}

export async function getRepository(env: Env, fullName: string): Promise<RepositoryRecord | null> {
  const db = getDb(env.DB);
  const [row] = await db.select().from(repositories).where(eq(repositories.fullName, fullName)).limit(1);
  return row ? toRepositoryRecord(row) : null;
}

export async function listRepositories(env: Env): Promise<RepositoryRecord[]> {
  const db = getDb(env.DB);
  const rows = await db.select().from(repositories).orderBy(desc(repositories.isRegistered), repositories.fullName);
  return rows.map(toRepositoryRecord);
}

export async function getPullRequest(env: Env, fullName: string, number: number): Promise<PullRequestRecord | null> {
  const db = getDb(env.DB);
  const [row] = await db
    .select()
    .from(pullRequests)
    .where(and(eq(pullRequests.repoFullName, fullName), eq(pullRequests.number, number)))
    .limit(1);
  return row ? toPullRequestRecordFromRow(row) : null;
}

export async function getIssue(env: Env, fullName: string, number: number): Promise<IssueRecord | null> {
  const db = getDb(env.DB);
  const [row] = await db.select().from(issues).where(and(eq(issues.repoFullName, fullName), eq(issues.number, number))).limit(1);
  return row ? toIssueRecordFromRow(row) : null;
}

export async function listOpenIssues(env: Env, fullName: string): Promise<IssueRecord[]> {
  const db = getDb(env.DB);
  const rows = await db.select().from(issues).where(and(eq(issues.repoFullName, fullName), eq(issues.state, "open"))).limit(100);
  return rows.map(toIssueRecordFromRow);
}

export async function listIssues(env: Env, fullName: string): Promise<IssueRecord[]> {
  const db = getDb(env.DB);
  const rows = await db.select().from(issues).where(eq(issues.repoFullName, fullName)).limit(500);
  return rows.map(toIssueRecordFromRow);
}

export async function listAllIssues(env: Env): Promise<IssueRecord[]> {
  const db = getDb(env.DB);
  const rows = await db.select().from(issues).limit(2000);
  return rows.map(toIssueRecordFromRow);
}

export async function listOpenPullRequests(env: Env, fullName: string): Promise<PullRequestRecord[]> {
  const db = getDb(env.DB);
  const rows = await db.select().from(pullRequests).where(and(eq(pullRequests.repoFullName, fullName), eq(pullRequests.state, "open"))).limit(500);
  return rows.map(toPullRequestRecordFromRow);
}

export async function listPullRequests(env: Env, fullName: string): Promise<PullRequestRecord[]> {
  const db = getDb(env.DB);
  const rows = await db.select().from(pullRequests).where(eq(pullRequests.repoFullName, fullName)).limit(500);
  return rows.map(toPullRequestRecordFromRow);
}

export async function listAllPullRequests(env: Env): Promise<PullRequestRecord[]> {
  const db = getDb(env.DB);
  const rows = await db.select().from(pullRequests).limit(2000);
  return rows.map(toPullRequestRecordFromRow);
}

export async function listOtherOpenPullRequests(env: Env, fullName: string, number: number): Promise<PullRequestRecord[]> {
  const db = getDb(env.DB);
  const rows = await db
    .select()
    .from(pullRequests)
    .where(and(eq(pullRequests.repoFullName, fullName), eq(pullRequests.state, "open"), not(eq(pullRequests.number, number))))
    .limit(100);
  return rows.map(toPullRequestRecordFromRow);
}

export async function listContributorPullRequests(env: Env, login: string): Promise<PullRequestRecord[]> {
  const db = getDb(env.DB);
  const rows = await db.select().from(pullRequests).where(eq(pullRequests.authorLogin, login)).limit(1000);
  return rows.map(toPullRequestRecordFromRow);
}

export async function listContributorIssues(env: Env, login: string): Promise<IssueRecord[]> {
  const db = getDb(env.DB);
  const rows = await db.select().from(issues).where(eq(issues.authorLogin, login)).limit(1000);
  return rows.map(toIssueRecordFromRow);
}

export async function listBounties(env: Env): Promise<BountyRecord[]> {
  const db = getDb(env.DB);
  const rows = await db.select().from(bounties).orderBy(desc(bounties.updatedAt)).limit(1000);
  return rows.map(toBountyRecord);
}

export async function getBounty(env: Env, id: string): Promise<BountyRecord | null> {
  const db = getDb(env.DB);
  const [row] = await db.select().from(bounties).where(eq(bounties.id, id)).limit(1);
  return row ? toBountyRecord(row) : null;
}

export async function upsertBounty(env: Env, bounty: BountyRecord): Promise<void> {
  const db = getDb(env.DB);
  await db
    .insert(bounties)
    .values({
      id: bounty.id,
      repoFullName: bounty.repoFullName,
      issueNumber: bounty.issueNumber,
      status: bounty.status,
      amountText: bounty.amountText,
      sourceUrl: bounty.sourceUrl,
      payloadJson: jsonString(bounty.payload),
      updatedAt: nowIso(),
    })
    .onConflictDoUpdate({
      target: bounties.id,
      set: {
        repoFullName: bounty.repoFullName,
        issueNumber: bounty.issueNumber,
        status: bounty.status,
        amountText: bounty.amountText,
        sourceUrl: bounty.sourceUrl,
        payloadJson: jsonString(bounty.payload),
        updatedAt: nowIso(),
      },
    });
}

export async function persistAdvisory(env: Env, advisory: Advisory): Promise<void> {
  const db = getDb(env.DB);
  await db.insert(advisories).values({
    id: advisory.id,
    targetType: advisory.targetType,
    targetKey: advisory.targetKey,
    repoFullName: advisory.repoFullName,
    pullNumber: advisory.pullNumber,
    issueNumber: advisory.issueNumber,
    headSha: advisory.headSha,
    conclusion: advisory.conclusion,
    severity: advisory.severity,
    title: advisory.title,
    summary: advisory.summary,
    findingsJson: jsonString(advisory.findings as unknown as Record<string, unknown>[]),
    updatedAt: nowIso(),
  });
}

export async function recordWebhookEvent(
  env: Env,
  args: {
    deliveryId: string;
    eventName: string;
    action?: string | undefined;
    installationId?: number | undefined;
    repositoryFullName?: string | undefined;
    payloadHash: string;
    status: "queued" | "processed" | "error";
    errorSummary?: string;
  },
): Promise<void> {
  const db = getDb(env.DB);
  await db
    .insert(webhookEvents)
    .values({
      deliveryId: args.deliveryId,
      eventName: args.eventName,
      action: args.action,
      installationId: args.installationId,
      repositoryFullName: args.repositoryFullName,
      payloadHash: args.payloadHash,
      status: args.status,
      errorSummary: args.errorSummary,
      processedAt: args.status === "processed" || args.status === "error" ? nowIso() : undefined,
    })
    .onConflictDoUpdate({
      target: webhookEvents.deliveryId,
      set: {
        status: args.status,
        errorSummary: args.errorSummary,
        processedAt: args.status === "processed" || args.status === "error" ? nowIso() : undefined,
      },
    });
}

export async function getWebhookEvent(
  env: Env,
  deliveryId: string,
): Promise<{
  deliveryId: string;
  payloadHash: string;
  status: string;
} | null> {
  const db = getDb(env.DB);
  const [row] = await db.select().from(webhookEvents).where(eq(webhookEvents.deliveryId, deliveryId)).limit(1);
  if (!row) return null;
  return {
    deliveryId: row.deliveryId,
    payloadHash: row.payloadHash,
    status: row.status,
  };
}

function toRepositoryRecord(row: typeof repositories.$inferSelect): RepositoryRecord {
  return {
    fullName: row.fullName,
    owner: row.owner,
    name: row.name,
    installationId: row.installationId,
    isInstalled: row.isInstalled,
    isRegistered: row.isRegistered,
    isPrivate: row.isPrivate,
    htmlUrl: row.htmlUrl,
    defaultBranch: row.defaultBranch,
    registryConfig: parseJson<RegistryRepoConfig | null>(row.registryConfigJson, null),
  };
}

function toPullRequestRecord(repoFullName: string, pr: GitHubPullRequestPayload): PullRequestRecord {
  return {
    repoFullName,
    number: pr.number,
    title: pr.title,
    state: pr.state,
    authorLogin: pr.user?.login,
    authorAssociation: pr.author_association,
    headSha: pr.head?.sha,
    headRef: pr.head?.ref,
    baseRef: pr.base?.ref,
    htmlUrl: pr.html_url,
    mergedAt: pr.merged_at,
    body: pr.body,
    labels: (pr.labels ?? []).flatMap((label) => (label.name ? [label.name] : [])),
    linkedIssues: extractLinkedIssueNumbers(pr.body ?? ""),
  };
}

function toPullRequestRecordFromRow(row: typeof pullRequests.$inferSelect): PullRequestRecord {
  const payload = parseJson<{ body?: string | null; created_at?: string | null; updated_at?: string | null }>(row.payloadJson, {});
  return {
    repoFullName: row.repoFullName,
    number: row.number,
    title: row.title,
    state: row.state,
    authorLogin: row.authorLogin,
    authorAssociation: row.authorAssociation,
    headSha: row.headSha,
    headRef: row.headRef,
    baseRef: row.baseRef,
    htmlUrl: row.htmlUrl,
    mergedAt: row.mergedAt,
    body: payload.body,
    createdAt: payload.created_at,
    updatedAt: payload.updated_at ?? row.updatedAt,
    labels: parseJson<string[]>(row.labelsJson, []),
    linkedIssues: parseJson<number[]>(row.linkedIssuesJson, []),
  };
}

function toIssueRecord(repoFullName: string, issue: GitHubIssuePayload): IssueRecord {
  return {
    repoFullName,
    number: issue.number,
    title: issue.title,
    state: issue.state,
    authorLogin: issue.user?.login,
    authorAssociation: issue.author_association,
    htmlUrl: issue.html_url,
    body: issue.body,
    labels: (issue.labels ?? []).flatMap((label) => (label.name ? [label.name] : [])),
    linkedPrs: extractLinkedPrNumbers(issue.body ?? ""),
  };
}

function toIssueRecordFromRow(row: typeof issues.$inferSelect): IssueRecord {
  const payload = parseJson<{ body?: string | null; created_at?: string | null; updated_at?: string | null }>(row.payloadJson, {});
  return {
    repoFullName: row.repoFullName,
    number: row.number,
    title: row.title,
    state: row.state,
    authorLogin: row.authorLogin,
    authorAssociation: row.authorAssociation,
    htmlUrl: row.htmlUrl,
    body: payload.body,
    createdAt: payload.created_at,
    updatedAt: payload.updated_at ?? row.updatedAt,
    labels: parseJson<string[]>(row.labelsJson, []),
    linkedPrs: parseJson<number[]>(row.linkedPrsJson, []),
  };
}

function toBountyRecord(row: typeof bounties.$inferSelect): BountyRecord {
  return {
    id: row.id,
    repoFullName: row.repoFullName,
    issueNumber: row.issueNumber,
    status: row.status,
    amountText: row.amountText,
    sourceUrl: row.sourceUrl,
    payload: parseJson<Record<string, never>>(row.payloadJson, {}),
    discoveredAt: row.discoveredAt,
    updatedAt: row.updatedAt,
  };
}

export function extractLinkedIssueNumbers(text: string): number[] {
  const matches = [...text.matchAll(/\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)\b/gi)];
  return [...new Set(matches.map((match) => Number(match[1])).filter((value) => Number.isInteger(value) && value > 0))];
}

function extractLinkedPrNumbers(text: string): number[] {
  const matches = [...text.matchAll(/\b(?:PR|pull request)\s+#(\d+)\b/gi)];
  return [...new Set(matches.map((match) => Number(match[1])).filter((value) => Number.isInteger(value) && value > 0))];
}
