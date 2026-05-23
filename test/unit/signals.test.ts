import { describe, expect, it } from "vitest";
import {
  buildCollisionReport,
  buildConfigQuality,
  buildContributorOpportunities,
  buildContributorProfile,
  buildLaneAdvice,
  buildPreflightResult,
  buildQueueHealth,
} from "../../src/signals/engine";
import type { IssueRecord, PullRequestRecord, RepositoryRecord } from "../../src/types";

const repo: RepositoryRecord = {
  fullName: "entrius/allways-ui",
  owner: "entrius",
  name: "allways-ui",
  isInstalled: true,
  isRegistered: true,
  isPrivate: false,
  registryConfig: {
    repo: "entrius/allways-ui",
    emissionShare: 0.01107,
    issueDiscoveryShare: 0,
    labelMultipliers: { bug: 1.1, enhancement: 1, feature: 1.25, refactor: 0.5 },
    trustedLabelPipeline: true,
    maintainerCut: 0,
    raw: {},
  },
};

const issues: IssueRecord[] = [
  {
    repoFullName: repo.fullName,
    number: 7,
    title: "Dashboard cache refresh fails after reconnect",
    state: "open",
    authorLogin: "reporter",
    labels: ["bug"],
    linkedPrs: [],
  },
  {
    repoFullName: repo.fullName,
    number: 8,
    title: "Add reconnect regression coverage",
    state: "open",
    authorLogin: "reporter",
    labels: ["feature"],
    linkedPrs: [],
  },
];

const pullRequests: PullRequestRecord[] = [
  {
    repoFullName: repo.fullName,
    number: 12,
    title: "Fix dashboard cache refresh after reconnect",
    state: "open",
    authorLogin: "oktofeesh1",
    authorAssociation: "NONE",
    labels: ["bug"],
    linkedIssues: [7],
    updatedAt: "2026-04-01T00:00:00.000Z",
  },
  {
    repoFullName: repo.fullName,
    number: 13,
    title: "Alternative cache reconnect fix",
    state: "open",
    authorLogin: "other",
    authorAssociation: "NONE",
    labels: ["bug"],
    linkedIssues: [7],
  },
];

describe("world-class backend signals", () => {
  it("classifies direct PR lanes from registry configuration", () => {
    const lane = buildLaneAdvice(repo, repo.fullName);
    expect(lane.lane).toBe("direct_pr");
    expect(lane.contributorGuidance).toMatch(/focused PRs/i);
  });

  it("detects duplicate and WIP collision clusters", () => {
    const report = buildCollisionReport(repo.fullName, issues, pullRequests);
    expect(report.summary.highRiskCount).toBeGreaterThan(0);
    expect(report.clusters[0]?.items.map((item) => item.number)).toContain(7);
  });

  it("builds maintainer burden from queue hygiene signals", () => {
    const collisions = buildCollisionReport(repo.fullName, issues, pullRequests);
    const health = buildQueueHealth(repo, issues, pullRequests, collisions);
    expect(health.signals.openPullRequests).toBe(2);
    expect(health.findings.map((finding) => finding.code)).toContain("collision_clusters");
  });

  it("audits configured labels against local observed label usage", () => {
    const quality = buildConfigQuality(repo, issues, pullRequests, repo.fullName);
    expect(quality.notObservedConfiguredLabels).toContain("refactor");
    expect(quality.findings.map((finding) => finding.code)).toContain("configured_labels_not_observed");
  });

  it("profiles contributors and ranks evidence-backed opportunities", () => {
    const profile = buildContributorProfile(
      "oktofeesh1",
      { login: "oktofeesh1", topLanguages: ["TypeScript"], source: "github" },
      pullRequests,
      [],
    );
    const opportunities = buildContributorOpportunities(profile, [repo], issues, pullRequests);
    expect(profile.trustSignals.level).toBe("new");
    expect(opportunities[0]?.repoFullName).toBe(repo.fullName);
  });

  it("preflights planned PRs without reward language", () => {
    const result = buildPreflightResult(
      {
        repoFullName: repo.fullName,
        title: "Fix dashboard cache refresh after reconnect",
        body: "Fixes #7",
        changedFiles: ["src/cache.ts"],
      },
      repo,
      issues,
      pullRequests,
    );
    expect(result.status).toBe("needs_work");
    expect(JSON.stringify(result)).not.toMatch(/reward|farming/i);
    expect(result.findings.map((finding) => finding.code)).toContain("missing_test_evidence");
  });
});
