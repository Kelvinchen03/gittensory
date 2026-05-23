import type {
  AdvisoryFinding,
  BountyRecord,
  IssueRecord,
  PullRequestRecord,
  RepositoryRecord,
} from "../types";
import type { PublicContributorProfile } from "../github/public";
import { nowIso } from "../utils/json";

export type ParticipationLane = "direct_pr" | "issue_discovery" | "split" | "inactive" | "unknown";
export type SignalFinding = AdvisoryFinding;

export type LaneAdvice = {
  lane: ParticipationLane;
  repoFullName: string;
  issueDiscoveryShare?: number | undefined;
  directPrShare?: number | undefined;
  summary: string;
  contributorGuidance: string;
  maintainerGuidance: string;
};

export type CollisionItem = {
  type: "issue" | "pull_request";
  number: number;
  title: string;
  authorLogin?: string | null | undefined;
  htmlUrl?: string | null | undefined;
};

export type CollisionCluster = {
  id: string;
  risk: "low" | "medium" | "high";
  reason: string;
  items: CollisionItem[];
};

export type CollisionReport = {
  repoFullName: string;
  generatedAt: string;
  summary: {
    clusterCount: number;
    highRiskCount: number;
    itemsReviewed: number;
  };
  clusters: CollisionCluster[];
};

export type QueueHealth = {
  repoFullName: string;
  generatedAt: string;
  burdenScore: number;
  level: "low" | "medium" | "high" | "critical";
  summary: string;
  signals: {
    openIssues: number;
    openPullRequests: number;
    unlinkedPullRequests: number;
    stalePullRequests: number;
    maintainerAuthoredPullRequests: number;
    collisionClusters: number;
  };
  findings: SignalFinding[];
};

export type ConfigQuality = {
  repoFullName: string;
  generatedAt: string;
  score: number;
  level: "excellent" | "good" | "needs_attention" | "fragile";
  lane: LaneAdvice;
  configuredLabels: string[];
  observedLabels: string[];
  notObservedConfiguredLabels: string[];
  findings: SignalFinding[];
};

export type ContributorProfile = {
  login: string;
  generatedAt: string;
  github: PublicContributorProfile;
  registeredRepoActivity: {
    pullRequests: number;
    mergedPullRequests: number;
    issues: number;
    reposTouched: string[];
    dominantLabels: string[];
  };
  trustSignals: {
    evidenceScore: number;
    level: "new" | "emerging" | "established";
    unlinkedOpenPullRequests: number;
    maintainerAssociatedPullRequests: number;
  };
};

export type ContributorOpportunity = {
  repoFullName: string;
  issueNumber?: number | undefined;
  title: string;
  fit: "good" | "caution" | "hold";
  score: number;
  lane: ParticipationLane;
  reasons: string[];
  warnings: string[];
};

export type PreflightInput = {
  repoFullName: string;
  contributorLogin?: string | undefined;
  title: string;
  body?: string | undefined;
  labels?: string[] | undefined;
  changedFiles?: string[] | undefined;
  linkedIssues?: number[] | undefined;
  tests?: string[] | undefined;
  authorAssociation?: string | undefined;
};

export type PreflightResult = {
  repoFullName: string;
  generatedAt: string;
  status: "ready" | "needs_work" | "hold";
  lane: LaneAdvice;
  reviewBurden: "low" | "medium" | "high";
  linkedIssues: number[];
  findings: SignalFinding[];
  collisions: CollisionCluster[];
};

export type MaintainerPacket = {
  repoFullName: string;
  generatedAt: string;
  queueHealth: QueueHealth;
  configQuality: ConfigQuality;
  collisions: CollisionReport;
  pullRequestPackets: Array<{
    number: number;
    title: string;
    authorLogin?: string | null | undefined;
    reviewPriority: "review" | "needs_author" | "watch";
    reasons: string[];
  }>;
  suggestedActions: string[];
};

export type BountyAdvisory = {
  id: string;
  repoFullName: string;
  issueNumber: number;
  status: string;
  lifecycle: "active" | "historical" | "unknown";
  fundingStatus: "funded" | "target_only" | "unknown";
  consensusRisk: "low" | "medium" | "high";
  findings: SignalFinding[];
};

const STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "this",
  "that",
  "when",
  "into",
  "issue",
  "pull",
  "request",
  "add",
  "fix",
  "update",
  "improve",
]);

export function buildLaneAdvice(repo: RepositoryRecord | null, fullName: string): LaneAdvice {
  const config = repo?.registryConfig;
  if (!repo || !repo.isRegistered || !config) {
    return {
      lane: "unknown",
      repoFullName: fullName,
      summary: "Repository registration is not available in the local Gittensory cache.",
      contributorGuidance: "Do not assume this repo is ready for Gittensor-specific contribution guidance yet.",
      maintainerGuidance: "Refresh the registry snapshot or install the GitHub App so Gittensory can evaluate the repo.",
    };
  }
  if (config.emissionShare <= 0) {
    return {
      lane: "inactive",
      repoFullName: fullName,
      issueDiscoveryShare: config.issueDiscoveryShare,
      directPrShare: 0,
      summary: "Repository is registered but has no active allocation in the current snapshot.",
      contributorGuidance: "Treat this as normal upstream contribution work unless the registry changes.",
      maintainerGuidance: "Do not expect Gittensor-driven contributor flow from this repo while allocation is zero.",
    };
  }
  const issueDiscoveryShare = clamp(config.issueDiscoveryShare, 0, 1);
  const directPrShare = 1 - issueDiscoveryShare;
  if (issueDiscoveryShare === 1) {
    return {
      lane: "issue_discovery",
      repoFullName: fullName,
      issueDiscoveryShare,
      directPrShare,
      summary: "Repository is configured for issue-discovery flow.",
      contributorGuidance: "Focus on high-proof issue discovery and avoid self-resolved issue loops.",
      maintainerGuidance: "Prioritize issue quality, duplicate risk, and whether reports are actionable for outside contributors.",
    };
  }
  if (issueDiscoveryShare === 0) {
    return {
      lane: "direct_pr",
      repoFullName: fullName,
      issueDiscoveryShare,
      directPrShare,
      summary: "Repository is configured for direct PR review.",
      contributorGuidance: "Prefer focused PRs with clear evidence, linked context, and low review churn.",
      maintainerGuidance: "Use PR hygiene, duplicate risk, and test evidence as the primary review filters.",
    };
  }
  return {
    lane: "split",
    repoFullName: fullName,
    issueDiscoveryShare,
    directPrShare,
    summary: "Repository is configured for both issue discovery and direct PR review.",
    contributorGuidance: "Pick one path intentionally: issue discovery for reports, direct PR for implementation.",
    maintainerGuidance: "Check whether each submission is using the right path before reviewing technical detail.",
  };
}

export function buildCollisionReport(repoFullName: string, issues: IssueRecord[], pullRequests: PullRequestRecord[]): CollisionReport {
  const openIssues = issues.filter((issue) => issue.state === "open");
  const openPullRequests = pullRequests.filter((pr) => pr.state === "open");
  const clusters = new Map<string, CollisionCluster>();

  for (const issue of openIssues) {
    const linkedPrs = openPullRequests.filter((pr) => pr.linkedIssues.includes(issue.number));
    if (linkedPrs.length === 0) continue;
    const items = [issueItem(issue), ...linkedPrs.map(prItem)];
    clusters.set(`issue-${issue.number}`, {
      id: `issue-${issue.number}`,
      risk: linkedPrs.length > 1 || issue.linkedPrs.length > 1 ? "high" : "medium",
      reason: `Open PR work references issue #${issue.number}.`,
      items,
    });
  }

  const items = [...openIssues.map(issueItem), ...openPullRequests.map(prItem)];
  for (let leftIndex = 0; leftIndex < items.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < items.length; rightIndex += 1) {
      const left = items[leftIndex];
      const right = items[rightIndex];
      if (!left || !right) continue;
      const overlap = titleOverlap(left.title, right.title);
      if (overlap.score < 0.58 || overlap.shared < 2) continue;
      const key = [itemKey(left), itemKey(right)].sort().join("--");
      if (clusters.has(key)) continue;
      clusters.set(key, {
        id: key,
        risk: overlap.score >= 0.75 ? "high" : "medium",
        reason: `Titles share ${overlap.shared} meaningful terms.`,
        items: [left, right],
      });
    }
  }

  const clusterList = [...clusters.values()].sort((left, right) => riskRank(right.risk) - riskRank(left.risk));
  return {
    repoFullName,
    generatedAt: nowIso(),
    summary: {
      clusterCount: clusterList.length,
      highRiskCount: clusterList.filter((cluster) => cluster.risk === "high").length,
      itemsReviewed: openIssues.length + openPullRequests.length,
    },
    clusters: clusterList,
  };
}

export function buildQueueHealth(
  repo: RepositoryRecord | null,
  issues: IssueRecord[],
  pullRequests: PullRequestRecord[],
  collisions: CollisionReport,
): QueueHealth {
  const repoFullName = repo?.fullName ?? collisions.repoFullName;
  const openIssues = issues.filter((issue) => issue.state === "open");
  const openPullRequests = pullRequests.filter((pr) => pr.state === "open");
  const unlinkedPullRequests = openPullRequests.filter((pr) => pr.linkedIssues.length === 0);
  const stalePullRequests = openPullRequests.filter((pr) => daysSince(pr.updatedAt ?? pr.createdAt) >= 14);
  const maintainerAuthoredPullRequests = openPullRequests.filter((pr) => isMaintainerAssociation(pr.authorAssociation));
  const burdenScore = clamp(
    openPullRequests.length * 6 +
      openIssues.length +
      unlinkedPullRequests.length * 8 +
      stalePullRequests.length * 6 +
      collisions.summary.clusterCount * 10,
    0,
    100,
  );
  const level = burdenScore >= 80 ? "critical" : burdenScore >= 55 ? "high" : burdenScore >= 25 ? "medium" : "low";
  const findings: SignalFinding[] = [];
  if (unlinkedPullRequests.length > 0) {
    findings.push({
      code: "unlinked_prs",
      severity: "warning",
      title: "Open PRs are missing linked issue context",
      detail: `${unlinkedPullRequests.length} open pull request(s) in the local cache do not reference a closing issue.`,
      action: "Ask contributors to link relevant issues or explain no-issue PR intent clearly.",
    });
  }
  if (collisions.summary.clusterCount > 0) {
    findings.push({
      code: "collision_clusters",
      severity: collisions.summary.highRiskCount > 0 ? "warning" : "info",
      title: "Duplicate or overlapping work is visible",
      detail: `${collisions.summary.clusterCount} possible overlap cluster(s) were detected.`,
      action: "Review overlapping submissions before spending detailed review time.",
    });
  }
  if (stalePullRequests.length > 0) {
    findings.push({
      code: "stale_prs",
      severity: "info",
      title: "Some open PRs appear stale",
      detail: `${stalePullRequests.length} open pull request(s) have not updated in at least 14 days.`,
    });
  }
  return {
    repoFullName,
    generatedAt: nowIso(),
    burdenScore,
    level,
    summary: `Queue burden is ${level} with ${openPullRequests.length} open PR(s), ${openIssues.length} open issue(s), and ${collisions.summary.clusterCount} overlap cluster(s).`,
    signals: {
      openIssues: openIssues.length,
      openPullRequests: openPullRequests.length,
      unlinkedPullRequests: unlinkedPullRequests.length,
      stalePullRequests: stalePullRequests.length,
      maintainerAuthoredPullRequests: maintainerAuthoredPullRequests.length,
      collisionClusters: collisions.summary.clusterCount,
    },
    findings,
  };
}

export function buildConfigQuality(
  repo: RepositoryRecord | null,
  issues: IssueRecord[],
  pullRequests: PullRequestRecord[],
  fullName: string,
): ConfigQuality {
  const lane = buildLaneAdvice(repo, fullName);
  const configuredLabels = Object.keys(repo?.registryConfig?.labelMultipliers ?? {}).sort();
  const observedLabels = [...new Set([...issues, ...pullRequests].flatMap((record) => record.labels))].sort();
  const notObservedConfiguredLabels = configuredLabels.filter((label) => !observedLabels.includes(label));
  const findings: SignalFinding[] = [];
  let score = 100;

  if (lane.lane === "unknown") {
    score -= 45;
    findings.push({
      code: "registry_unknown",
      severity: "warning",
      title: "Registry config is unavailable",
      detail: "Gittensory cannot verify this repo's Gittensor participation lane from the local snapshot.",
    });
  }
  if (lane.lane === "inactive") {
    score -= 35;
    findings.push({
      code: "inactive_allocation",
      severity: "info",
      title: "Repo has no active allocation",
      detail: "The current registry config has no active allocation for this repo.",
    });
  }
  if (repo?.registryConfig?.trustedLabelPipeline && configuredLabels.length === 0) {
    score -= 25;
    findings.push({
      code: "trusted_labels_without_multipliers",
      severity: "warning",
      title: "Trusted label pipeline has no configured multipliers",
      detail: "The registry says labels are trusted, but no label multipliers are configured.",
    });
  }
  if (notObservedConfiguredLabels.length > 0) {
    score -= Math.min(30, notObservedConfiguredLabels.length * 8);
    findings.push({
      code: "configured_labels_not_observed",
      severity: "info",
      title: "Configured labels were not observed locally",
      detail: `Configured labels not seen in cached issues/PRs: ${notObservedConfiguredLabels.join(", ")}.`,
      action: "Verify those labels exist and are actually used by maintainers or trusted automation.",
    });
  }

  const finalScore = clamp(score, 0, 100);
  return {
    repoFullName: fullName,
    generatedAt: nowIso(),
    score: finalScore,
    level: finalScore >= 90 ? "excellent" : finalScore >= 70 ? "good" : finalScore >= 45 ? "needs_attention" : "fragile",
    lane,
    configuredLabels,
    observedLabels,
    notObservedConfiguredLabels,
    findings,
  };
}

export function buildContributorProfile(
  login: string,
  github: PublicContributorProfile,
  pullRequests: PullRequestRecord[],
  issues: IssueRecord[],
): ContributorProfile {
  const authoredPullRequests = pullRequests.filter((pr) => sameLogin(pr.authorLogin, login));
  const authoredIssues = issues.filter((issue) => sameLogin(issue.authorLogin, login));
  const mergedPullRequests = authoredPullRequests.filter((pr) => pr.mergedAt || pr.state === "merged");
  const reposTouched = [...new Set([...authoredPullRequests, ...authoredIssues].map((record) => record.repoFullName))].sort();
  const dominantLabels = topItems([...authoredPullRequests, ...authoredIssues].flatMap((record) => record.labels), 8);
  const unlinkedOpenPullRequests = authoredPullRequests.filter((pr) => pr.state === "open" && pr.linkedIssues.length === 0).length;
  const maintainerAssociatedPullRequests = authoredPullRequests.filter((pr) => isMaintainerAssociation(pr.authorAssociation)).length;
  const evidenceScore = clamp(mergedPullRequests.length * 15 + reposTouched.length * 10 + authoredIssues.length * 2 - unlinkedOpenPullRequests * 8, 0, 100);
  return {
    login,
    generatedAt: nowIso(),
    github,
    registeredRepoActivity: {
      pullRequests: authoredPullRequests.length,
      mergedPullRequests: mergedPullRequests.length,
      issues: authoredIssues.length,
      reposTouched,
      dominantLabels,
    },
    trustSignals: {
      evidenceScore,
      level: evidenceScore >= 60 ? "established" : evidenceScore >= 25 ? "emerging" : "new",
      unlinkedOpenPullRequests,
      maintainerAssociatedPullRequests,
    },
  };
}

export function buildContributorOpportunities(
  profile: ContributorProfile,
  repositories: RepositoryRecord[],
  issues: IssueRecord[],
  pullRequests: PullRequestRecord[],
): ContributorOpportunity[] {
  const opportunities: ContributorOpportunity[] = [];
  const touchedRepos = new Set(profile.registeredRepoActivity.reposTouched);
  const labelHistory = new Set(profile.registeredRepoActivity.dominantLabels);

  for (const repo of repositories.filter((candidate) => candidate.isRegistered)) {
    const lane = buildLaneAdvice(repo, repo.fullName);
    const repoIssues = issues.filter((issue) => issue.repoFullName === repo.fullName && issue.state === "open");
    const repoPullRequests = pullRequests.filter((pr) => pr.repoFullName === repo.fullName && pr.state === "open");
    const linkedIssueNumbers = new Set(repoPullRequests.flatMap((pr) => pr.linkedIssues));
    const availableIssues = repoIssues.filter((issue) => issue.linkedPrs.length === 0 && !linkedIssueNumbers.has(issue.number));
    const queuePenalty = Math.min(20, repoPullRequests.length * 2);
    for (const issue of availableIssues.slice(0, 5)) {
      const labelFit = issue.labels.filter((label) => labelHistory.has(label)).length;
      const score = clamp(
        50 +
          (touchedRepos.has(repo.fullName) ? 20 : 0) +
          labelFit * 5 +
          (lane.lane === "split" ? 8 : 0) +
          (lane.lane === "direct_pr" ? 5 : 0) -
          queuePenalty -
          (lane.lane === "inactive" || lane.lane === "unknown" ? 35 : 0),
        0,
        100,
      );
      opportunities.push({
        repoFullName: repo.fullName,
        issueNumber: issue.number,
        title: issue.title,
        fit: score >= 70 ? "good" : score >= 40 ? "caution" : "hold",
        score,
        lane: lane.lane,
        reasons: [
          lane.summary,
          ...(touchedRepos.has(repo.fullName) ? ["Contributor has prior activity in this registered repo."] : []),
          ...(labelFit > 0 ? [`Issue labels overlap contributor history: ${issue.labels.filter((label) => labelHistory.has(label)).join(", ")}.`] : []),
        ],
        warnings: [
          ...(repoPullRequests.length >= 8 ? ["This repo has a busy open PR queue."] : []),
          ...(lane.lane === "issue_discovery" ? ["This repo is not a direct-PR-first lane."] : []),
          ...(lane.lane === "unknown" || lane.lane === "inactive" ? ["Gittensory cannot recommend this as a strong contribution target right now."] : []),
        ],
      });
    }
  }

  return opportunities.sort((left, right) => right.score - left.score || left.repoFullName.localeCompare(right.repoFullName)).slice(0, 25);
}

export function buildPreflightResult(
  input: PreflightInput,
  repo: RepositoryRecord | null,
  issues: IssueRecord[],
  pullRequests: PullRequestRecord[],
): PreflightResult {
  const lane = buildLaneAdvice(repo, input.repoFullName);
  const linkedIssues = [...new Set([...(input.linkedIssues ?? []), ...extractLinkedIssueNumbers(input.body ?? "")])].sort((left, right) => left - right);
  const collisions = buildCollisionReport(input.repoFullName, issues, pullRequests).clusters.filter((cluster) =>
    cluster.items.some((item) => linkedIssues.includes(item.number) || item.title.toLowerCase().includes(input.title.toLowerCase())),
  );
  const findings: SignalFinding[] = [];
  if (lane.lane === "unknown" || lane.lane === "inactive") {
    findings.push({
      code: "lane_not_recommended",
      severity: "warning",
      title: "Repo lane is not ready for a confident recommendation",
      detail: lane.summary,
      action: "Refresh registry data or choose a registered active repo.",
    });
  }
  if (linkedIssues.length === 0 && lane.lane !== "issue_discovery") {
    findings.push({
      code: "missing_linked_issue",
      severity: "warning",
      title: "No linked issue detected",
      detail: "The planned PR does not reference a closing issue or explicit linked issue number.",
      action: "Link the issue being solved, or explicitly explain why this is a no-issue PR.",
    });
  }
  if (collisions.length > 0) {
    findings.push({
      code: "possible_duplicate_work",
      severity: collisions.some((cluster) => cluster.risk === "high") ? "warning" : "info",
      title: "Possible duplicate or overlapping work",
      detail: `${collisions.length} related open work cluster(s) were detected.`,
      action: "Check active issues and PRs before submitting.",
    });
  }
  const changedFiles = input.changedFiles ?? [];
  const tests = input.tests ?? [];
  if (changedFiles.some((file) => isCodeFile(file)) && tests.length === 0 && !changedFiles.some((file) => isTestFile(file))) {
    findings.push({
      code: "missing_test_evidence",
      severity: "warning",
      title: "No test evidence supplied",
      detail: "Code files are listed, but no tests or test files were supplied in preflight input.",
      action: "Add focused test evidence or explain why existing coverage is sufficient.",
    });
  }
  const reviewBurden = changedFiles.length >= 12 || collisions.length > 0 ? "high" : changedFiles.length >= 5 ? "medium" : "low";
  const hasWarning = findings.some((finding) => finding.severity === "warning" || finding.severity === "critical");
  return {
    repoFullName: input.repoFullName,
    generatedAt: nowIso(),
    status: lane.lane === "unknown" || lane.lane === "inactive" ? "hold" : hasWarning ? "needs_work" : "ready",
    lane,
    reviewBurden,
    linkedIssues,
    findings,
    collisions,
  };
}

export function buildMaintainerPacket(
  repo: RepositoryRecord | null,
  issues: IssueRecord[],
  pullRequests: PullRequestRecord[],
  fullName: string,
): MaintainerPacket {
  const collisions = buildCollisionReport(fullName, issues, pullRequests);
  const queueHealth = buildQueueHealth(repo, issues, pullRequests, collisions);
  const configQuality = buildConfigQuality(repo, issues, pullRequests, fullName);
  const pullRequestPackets = pullRequests
    .filter((pr) => pr.state === "open")
    .slice(0, 25)
    .map((pr) => {
      const reasons = [
        ...(pr.linkedIssues.length === 0 ? ["Missing linked issue context."] : []),
        ...(isMaintainerAssociation(pr.authorAssociation) ? ["Author has maintainer association."] : []),
        ...(collisions.clusters.some((cluster) => cluster.items.some((item) => item.type === "pull_request" && item.number === pr.number))
          ? ["Potential overlap with other open work."]
          : []),
        ...(pr.labels.length > 0 ? [`Labels: ${pr.labels.join(", ")}.`] : []),
      ];
      return {
        number: pr.number,
        title: pr.title,
        authorLogin: pr.authorLogin,
        reviewPriority: reasons.some((reason) => reason.includes("Missing") || reason.includes("overlap")) ? "needs_author" : "review",
        reasons: reasons.length > 0 ? reasons : ["No obvious queue hygiene issue detected in cached metadata."],
      } as const;
    });
  const suggestedActions = [
    ...(queueHealth.signals.unlinkedPullRequests > 0 ? ["Ask authors of unlinked PRs to add issue context or a no-issue rationale."] : []),
    ...(collisions.summary.clusterCount > 0 ? ["Triage overlap clusters before deep technical review."] : []),
    ...(configQuality.level === "fragile" || configQuality.level === "needs_attention" ? ["Review repo Gittensor config quality before inviting more contributor flow."] : []),
    ...(queueHealth.level === "critical" || queueHealth.level === "high" ? ["Prioritize queue clearing before encouraging new work."] : []),
  ];
  return {
    repoFullName: fullName,
    generatedAt: nowIso(),
    queueHealth,
    configQuality,
    collisions,
    pullRequestPackets,
    suggestedActions: suggestedActions.length > 0 ? suggestedActions : ["Queue looks manageable from cached Gittensory signals."],
  };
}

export function buildBountyAdvisory(bounty: BountyRecord, repo: RepositoryRecord | null, issue: IssueRecord | null): BountyAdvisory {
  const status = bounty.status.toLowerCase();
  const lifecycle = status.includes("complete") || status.includes("cancel") || status.includes("closed") ? "historical" : status ? "active" : "unknown";
  const target = bounty.payload.target_bounty ?? bounty.payload.target_alpha;
  const amount = bounty.payload.bounty_amount ?? bounty.payload.bounty_alpha;
  const fundingStatus = amount && amount !== 0 && amount !== "0.0000" ? "funded" : target ? "target_only" : "unknown";
  const findings: SignalFinding[] = [];
  if (lifecycle === "historical") {
    findings.push({
      code: "historical_bounty",
      severity: "info",
      title: "Bounty is historical",
      detail: "This bounty is completed, cancelled, or otherwise not active in the local bounty cache.",
    });
  }
  if (!repo?.isRegistered) {
    findings.push({
      code: "bounty_repo_unregistered",
      severity: "warning",
      title: "Bounty repo is not registered locally",
      detail: "The bounty references a repository that is not in the current local registry cache.",
    });
  }
  if (!issue) {
    findings.push({
      code: "bounty_issue_not_cached",
      severity: "info",
      title: "Linked issue is not cached",
      detail: "Gittensory has not cached the GitHub issue associated with this bounty.",
    });
  }
  return {
    id: bounty.id,
    repoFullName: bounty.repoFullName,
    issueNumber: bounty.issueNumber,
    status: bounty.status,
    lifecycle,
    fundingStatus,
    consensusRisk: issue && issue.linkedPrs.length > 1 ? "medium" : lifecycle === "active" && !issue ? "high" : "low",
    findings,
  };
}

function issueItem(issue: IssueRecord): CollisionItem {
  return {
    type: "issue",
    number: issue.number,
    title: issue.title,
    authorLogin: issue.authorLogin,
    htmlUrl: issue.htmlUrl,
  };
}

function prItem(pr: PullRequestRecord): CollisionItem {
  return {
    type: "pull_request",
    number: pr.number,
    title: pr.title,
    authorLogin: pr.authorLogin,
    htmlUrl: pr.htmlUrl,
  };
}

function itemKey(item: CollisionItem): string {
  return `${item.type}-${item.number}`;
}

function titleOverlap(left: string, right: string): { score: number; shared: number } {
  const leftTerms = tokenize(left);
  const rightTerms = tokenize(right);
  if (leftTerms.length === 0 || rightTerms.length === 0) return { score: 0, shared: 0 };
  const rightSet = new Set(rightTerms);
  const shared = new Set(leftTerms.filter((term) => rightSet.has(term))).size;
  return { score: shared / Math.min(new Set(leftTerms).size, new Set(rightTerms).size), shared };
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter((term) => term.length > 2 && !STOPWORDS.has(term));
}

function extractLinkedIssueNumbers(text: string): number[] {
  const matches = [...text.matchAll(/\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)\b/gi)];
  return [...new Set(matches.map((match) => Number(match[1])).filter((value) => Number.isInteger(value) && value > 0))];
}

function isMaintainerAssociation(value: string | null | undefined): boolean {
  return value === "OWNER" || value === "MEMBER" || value === "COLLABORATOR";
}

function sameLogin(value: string | null | undefined, login: string): boolean {
  return value?.toLowerCase() === login.toLowerCase();
}

function topItems(items: string[], limit: number): string[] {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(item, (counts.get(item) ?? 0) + 1);
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([item]) => item);
}

function daysSince(value: string | null | undefined): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.floor((Date.now() - parsed) / 86_400_000);
}

function isCodeFile(file: string): boolean {
  return /\.(ts|tsx|js|jsx|py|rb|rs|kt|scala|java|go|sql)$/i.test(file) && !isTestFile(file);
}

function isTestFile(file: string): boolean {
  return /(^|\/)(test|tests|spec|__tests__)\//i.test(file) || /\.(test|spec)\.(ts|tsx|js|jsx|py|rb|rs)$/i.test(file);
}

function riskRank(risk: CollisionCluster["risk"]): number {
  if (risk === "high") return 3;
  if (risk === "medium") return 2;
  return 1;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
