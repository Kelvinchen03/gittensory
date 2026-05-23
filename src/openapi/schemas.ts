import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";

extendZodWithOpenApi(z);

export const FindingSchema = z
  .object({
    code: z.string(),
    title: z.string(),
    severity: z.enum(["info", "warning", "critical"]),
    detail: z.string(),
    action: z.string().optional(),
    publicText: z.string().optional(),
  })
  .openapi("Finding");

export const AdvisorySchema = z
  .object({
    id: z.string(),
    targetType: z.enum(["repository", "pull_request", "issue"]),
    targetKey: z.string(),
    repoFullName: z.string(),
    pullNumber: z.number().optional(),
    issueNumber: z.number().optional(),
    headSha: z.string().optional(),
    conclusion: z.enum(["success", "neutral", "action_required"]),
    severity: z.enum(["info", "warning", "critical"]),
    title: z.string(),
    summary: z.string(),
    findings: z.array(FindingSchema),
    generatedAt: z.string(),
  })
  .openapi("Advisory");

export const RegistryRepoSchema = z
  .object({
    repo: z.string(),
    emissionShare: z.number(),
    issueDiscoveryShare: z.number(),
    labelMultipliers: z.record(z.number()),
    trustedLabelPipeline: z.boolean().nullable().optional(),
    maintainerCut: z.number(),
    defaultLabelMultiplier: z.number().nullable().optional(),
    fixedBaseScore: z.number().nullable().optional(),
    eligibilityMode: z.string().nullable().optional(),
    raw: z.record(z.unknown()),
  })
  .openapi("RegistryRepo");

export const RegistrySnapshotSchema = z
  .object({
    id: z.string(),
    generatedAt: z.string(),
    fetchedAt: z.string(),
    source: z.object({
      kind: z.enum(["api", "raw-github"]),
      url: z.string(),
    }),
    repoCount: z.number(),
    totalEmissionShare: z.number(),
    warnings: z.array(z.string()),
    repositories: z.array(RegistryRepoSchema),
  })
  .openapi("RegistrySnapshot");

export const RepositorySchema = z
  .object({
    fullName: z.string(),
    owner: z.string(),
    name: z.string(),
    installationId: z.number().nullable().optional(),
    isInstalled: z.boolean(),
    isRegistered: z.boolean(),
    isPrivate: z.boolean(),
    htmlUrl: z.string().nullable().optional(),
    defaultBranch: z.string().nullable().optional(),
    registryConfig: RegistryRepoSchema.nullable().optional(),
  })
  .openapi("Repository");

export const WorkboardItemSchema = z
  .object({
    repoFullName: z.string(),
    issueNumber: z.number(),
    title: z.string(),
    state: z.string(),
    htmlUrl: z.string().nullable().optional(),
    fit: z.enum(["good", "caution", "hold"]),
    reasons: z.array(z.string()),
  })
  .openapi("WorkboardItem");

export const LaneAdviceSchema = z
  .object({
    lane: z.enum(["direct_pr", "issue_discovery", "split", "inactive", "unknown"]),
    repoFullName: z.string(),
    issueDiscoveryShare: z.number().optional(),
    directPrShare: z.number().optional(),
    summary: z.string(),
    contributorGuidance: z.string(),
    maintainerGuidance: z.string(),
  })
  .openapi("LaneAdvice");

export const CollisionItemSchema = z
  .object({
    type: z.enum(["issue", "pull_request"]),
    number: z.number(),
    title: z.string(),
    authorLogin: z.string().nullable().optional(),
    htmlUrl: z.string().nullable().optional(),
  })
  .openapi("CollisionItem");

export const CollisionClusterSchema = z
  .object({
    id: z.string(),
    risk: z.enum(["low", "medium", "high"]),
    reason: z.string(),
    items: z.array(CollisionItemSchema),
  })
  .openapi("CollisionCluster");

export const CollisionReportSchema = z
  .object({
    repoFullName: z.string(),
    generatedAt: z.string(),
    summary: z.object({
      clusterCount: z.number(),
      highRiskCount: z.number(),
      itemsReviewed: z.number(),
    }),
    clusters: z.array(CollisionClusterSchema),
  })
  .openapi("CollisionReport");

export const QueueHealthSchema = z
  .object({
    repoFullName: z.string(),
    generatedAt: z.string(),
    burdenScore: z.number(),
    level: z.enum(["low", "medium", "high", "critical"]),
    summary: z.string(),
    signals: z.object({
      openIssues: z.number(),
      openPullRequests: z.number(),
      unlinkedPullRequests: z.number(),
      stalePullRequests: z.number(),
      maintainerAuthoredPullRequests: z.number(),
      collisionClusters: z.number(),
    }),
    findings: z.array(FindingSchema),
  })
  .openapi("QueueHealth");

export const ConfigQualitySchema = z
  .object({
    repoFullName: z.string(),
    generatedAt: z.string(),
    score: z.number(),
    level: z.enum(["excellent", "good", "needs_attention", "fragile"]),
    lane: LaneAdviceSchema,
    configuredLabels: z.array(z.string()),
    observedLabels: z.array(z.string()),
    notObservedConfiguredLabels: z.array(z.string()),
    findings: z.array(FindingSchema),
  })
  .openapi("ConfigQuality");

export const ContributorProfileSchema = z
  .object({
    login: z.string(),
    generatedAt: z.string(),
    github: z.object({
      login: z.string(),
      name: z.string().nullable().optional(),
      bio: z.string().nullable().optional(),
      company: z.string().nullable().optional(),
      publicRepos: z.number().optional(),
      followers: z.number().optional(),
      createdAt: z.string().optional(),
      updatedAt: z.string().optional(),
      topLanguages: z.array(z.string()),
      source: z.enum(["github", "unavailable"]),
    }),
    registeredRepoActivity: z.object({
      pullRequests: z.number(),
      mergedPullRequests: z.number(),
      issues: z.number(),
      reposTouched: z.array(z.string()),
      dominantLabels: z.array(z.string()),
    }),
    trustSignals: z.object({
      evidenceScore: z.number(),
      level: z.enum(["new", "emerging", "established"]),
      unlinkedOpenPullRequests: z.number(),
      maintainerAssociatedPullRequests: z.number(),
    }),
  })
  .openapi("ContributorProfile");

export const ContributorOpportunitySchema = z
  .object({
    repoFullName: z.string(),
    issueNumber: z.number().optional(),
    title: z.string(),
    fit: z.enum(["good", "caution", "hold"]),
    score: z.number(),
    lane: z.enum(["direct_pr", "issue_discovery", "split", "inactive", "unknown"]),
    reasons: z.array(z.string()),
    warnings: z.array(z.string()),
  })
  .openapi("ContributorOpportunity");

export const ContributorOpportunitiesResponseSchema = z
  .object({
    profile: ContributorProfileSchema,
    opportunities: z.array(ContributorOpportunitySchema),
  })
  .openapi("ContributorOpportunitiesResponse");

export const PreflightResultSchema = z
  .object({
    repoFullName: z.string(),
    generatedAt: z.string(),
    status: z.enum(["ready", "needs_work", "hold"]),
    lane: LaneAdviceSchema,
    reviewBurden: z.enum(["low", "medium", "high"]),
    linkedIssues: z.array(z.number()),
    findings: z.array(FindingSchema),
    collisions: z.array(CollisionClusterSchema),
  })
  .openapi("PreflightResult");

export const MaintainerPacketSchema = z
  .object({
    repoFullName: z.string(),
    generatedAt: z.string(),
    queueHealth: QueueHealthSchema,
    configQuality: ConfigQualitySchema,
    collisions: CollisionReportSchema,
    pullRequestPackets: z.array(
      z.object({
        number: z.number(),
        title: z.string(),
        authorLogin: z.string().nullable().optional(),
        reviewPriority: z.enum(["review", "needs_author", "watch"]),
        reasons: z.array(z.string()),
      }),
    ),
    suggestedActions: z.array(z.string()),
  })
  .openapi("MaintainerPacket");

export const BountySchema = z
  .object({
    id: z.string(),
    repoFullName: z.string(),
    issueNumber: z.number(),
    status: z.string(),
    amountText: z.string().nullable().optional(),
    sourceUrl: z.string().nullable().optional(),
    payload: z.record(z.unknown()),
    discoveredAt: z.string().nullable().optional(),
    updatedAt: z.string().nullable().optional(),
  })
  .openapi("Bounty");

export const BountyAdvisorySchema = z
  .object({
    id: z.string(),
    repoFullName: z.string(),
    issueNumber: z.number(),
    status: z.string(),
    lifecycle: z.enum(["active", "historical", "unknown"]),
    fundingStatus: z.enum(["funded", "target_only", "unknown"]),
    consensusRisk: z.enum(["low", "medium", "high"]),
    findings: z.array(FindingSchema),
  })
  .openapi("BountyAdvisory");

export const HealthSchema = z
  .object({
    status: z.literal("ok"),
    service: z.literal("gittensory-api"),
    time: z.string(),
  })
  .openapi("Health");
