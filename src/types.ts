export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type JobMessage =
  | {
      type: "github-webhook";
      deliveryId: string;
      eventName: string;
      payload: GitHubWebhookPayload;
    }
  | {
      type: "refresh-registry";
      requestedBy: "schedule" | "api" | "test";
    };

export type GitHubWebhookPayload = {
  action?: string;
  installation?: {
    id: number;
    account?: {
      login?: string;
      id?: number;
      type?: string;
    };
    target_type?: string;
    repository_selection?: string;
    permissions?: Record<string, string>;
    events?: string[];
    suspended_at?: string | null;
  };
  repository?: GitHubRepositoryPayload;
  repositories?: GitHubRepositoryPayload[];
  pull_request?: GitHubPullRequestPayload;
  issue?: GitHubIssuePayload;
  label?: {
    name?: string;
  };
};

export type GitHubRepositoryPayload = {
  id?: number;
  name: string;
  full_name: string;
  private?: boolean;
  html_url?: string;
  default_branch?: string;
  owner?: {
    login?: string;
  };
};

export type GitHubPullRequestPayload = {
  number: number;
  title: string;
  state: string;
  html_url?: string;
  merged_at?: string | null;
  user?: {
    login?: string;
  };
  author_association?: string;
  head?: {
    sha?: string;
    ref?: string;
  };
  base?: {
    ref?: string;
  };
  labels?: Array<{ name?: string }>;
  body?: string | null;
};

export type GitHubIssuePayload = {
  number: number;
  title: string;
  state: string;
  html_url?: string;
  user?: {
    login?: string;
  };
  author_association?: string;
  labels?: Array<{ name?: string }>;
  body?: string | null;
  pull_request?: unknown;
};

export type RegistryRepoConfig = {
  repo: string;
  emissionShare: number;
  issueDiscoveryShare: number;
  labelMultipliers: Record<string, number>;
  trustedLabelPipeline?: boolean | null;
  maintainerCut: number;
  defaultLabelMultiplier?: number | null;
  fixedBaseScore?: number | null;
  eligibilityMode?: string | null;
  raw: Record<string, JsonValue>;
};

export type RegistrySnapshot = {
  id: string;
  generatedAt: string;
  fetchedAt: string;
  source: {
    kind: "api" | "raw-github";
    url: string;
  };
  repoCount: number;
  totalEmissionShare: number;
  warnings: string[];
  repositories: RegistryRepoConfig[];
};

export type AdvisoryConclusion = "success" | "neutral" | "action_required";
export type AdvisorySeverity = "info" | "warning" | "critical";

export type AdvisoryFinding = {
  code: string;
  title: string;
  severity: AdvisorySeverity;
  detail: string;
  action?: string;
  publicText?: string;
};

export type Advisory = {
  id: string;
  targetType: "repository" | "pull_request" | "issue";
  targetKey: string;
  repoFullName: string;
  pullNumber?: number;
  issueNumber?: number;
  headSha?: string;
  conclusion: AdvisoryConclusion;
  severity: AdvisorySeverity;
  title: string;
  summary: string;
  findings: AdvisoryFinding[];
  generatedAt: string;
};

export type RepositoryRecord = {
  fullName: string;
  owner: string;
  name: string;
  installationId?: number | null | undefined;
  isInstalled: boolean;
  isRegistered: boolean;
  isPrivate: boolean;
  htmlUrl?: string | null | undefined;
  defaultBranch?: string | null | undefined;
  registryConfig?: RegistryRepoConfig | null | undefined;
};

export type PullRequestRecord = {
  repoFullName: string;
  number: number;
  title: string;
  state: string;
  authorLogin?: string | null | undefined;
  authorAssociation?: string | null | undefined;
  headSha?: string | null | undefined;
  headRef?: string | null | undefined;
  baseRef?: string | null | undefined;
  htmlUrl?: string | null | undefined;
  mergedAt?: string | null | undefined;
  body?: string | null | undefined;
  createdAt?: string | null | undefined;
  updatedAt?: string | null | undefined;
  labels: string[];
  linkedIssues: number[];
};

export type IssueRecord = {
  repoFullName: string;
  number: number;
  title: string;
  state: string;
  authorLogin?: string | null | undefined;
  authorAssociation?: string | null | undefined;
  htmlUrl?: string | null | undefined;
  body?: string | null | undefined;
  createdAt?: string | null | undefined;
  updatedAt?: string | null | undefined;
  labels: string[];
  linkedPrs: number[];
};

export type BountyRecord = {
  id: string;
  repoFullName: string;
  issueNumber: number;
  status: string;
  amountText?: string | null | undefined;
  sourceUrl?: string | null | undefined;
  payload: Record<string, JsonValue>;
  discoveredAt?: string | null | undefined;
  updatedAt?: string | null | undefined;
};
