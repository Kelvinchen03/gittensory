import { OpenApiGeneratorV3, OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import {
  AdvisorySchema,
  BountyAdvisorySchema,
  BountySchema,
  CollisionReportSchema,
  ConfigQualitySchema,
  ContributorOpportunitiesResponseSchema,
  ContributorOpportunitySchema,
  ContributorProfileSchema,
  HealthSchema,
  MaintainerPacketSchema,
  PreflightResultSchema,
  QueueHealthSchema,
  RegistrySnapshotSchema,
  RepositorySchema,
  WorkboardItemSchema,
} from "./schemas";

export function buildOpenApiSpec() {
  const registry = new OpenAPIRegistry();
  registry.register("Health", HealthSchema);
  registry.register("RegistrySnapshot", RegistrySnapshotSchema);
  registry.register("Repository", RepositorySchema);
  registry.register("Advisory", AdvisorySchema);
  registry.register("WorkboardItem", WorkboardItemSchema);
  registry.register("QueueHealth", QueueHealthSchema);
  registry.register("CollisionReport", CollisionReportSchema);
  registry.register("ConfigQuality", ConfigQualitySchema);
  registry.register("ContributorProfile", ContributorProfileSchema);
  registry.register("ContributorOpportunity", ContributorOpportunitySchema);
  registry.register("ContributorOpportunitiesResponse", ContributorOpportunitiesResponseSchema);
  registry.register("PreflightResult", PreflightResultSchema);
  registry.register("MaintainerPacket", MaintainerPacketSchema);
  registry.register("Bounty", BountySchema);
  registry.register("BountyAdvisory", BountyAdvisorySchema);

  registry.registerPath({
    method: "get",
    path: "/health",
    responses: {
      200: { description: "Service health", content: { "application/json": { schema: HealthSchema } } },
    },
  });
  registry.registerPath({
    method: "get",
    path: "/v1/registry/snapshot",
    responses: {
      200: { description: "Latest Gittensor registry snapshot", content: { "application/json": { schema: RegistrySnapshotSchema } } },
    },
  });
  registry.registerPath({
    method: "get",
    path: "/v1/repos",
    responses: {
      200: { description: "Known repositories", content: { "application/json": { schema: RepositorySchema.array() } } },
    },
  });
  registry.registerPath({
    method: "get",
    path: "/v1/repos/{owner}/{repo}",
    responses: {
      200: { description: "Repository detail", content: { "application/json": { schema: RepositorySchema } } },
      404: { description: "Repository not found" },
    },
  });
  for (const path of [
    "/v1/repos/{owner}/{repo}/advisory",
    "/v1/repos/{owner}/{repo}/pulls/{number}/advisory",
    "/v1/repos/{owner}/{repo}/issues/{number}/advisory",
  ]) {
    registry.registerPath({
      method: "get",
      path,
      responses: {
        200: { description: "Generated advisory", content: { "application/json": { schema: AdvisorySchema } } },
      },
    });
  }
  registry.registerPath({
    method: "get",
    path: "/v1/repos/{owner}/{repo}/workboard",
    responses: {
      200: { description: "Contributor workboard", content: { "application/json": { schema: WorkboardItemSchema.array() } } },
    },
  });
  registry.registerPath({
    method: "get",
    path: "/v1/repos/{owner}/{repo}/queue-health",
    responses: {
      200: { description: "Maintainer burden and queue health signals", content: { "application/json": { schema: QueueHealthSchema } } },
    },
  });
  registry.registerPath({
    method: "get",
    path: "/v1/repos/{owner}/{repo}/collisions",
    responses: {
      200: { description: "Duplicate and WIP collision clusters", content: { "application/json": { schema: CollisionReportSchema } } },
    },
  });
  registry.registerPath({
    method: "get",
    path: "/v1/repos/{owner}/{repo}/config-quality",
    responses: {
      200: { description: "Gittensor repository config quality signals", content: { "application/json": { schema: ConfigQualitySchema } } },
    },
  });
  registry.registerPath({
    method: "get",
    path: "/v1/repos/{owner}/{repo}/maintainer-packet",
    responses: {
      200: { description: "Maintainer-friendly repo review packet", content: { "application/json": { schema: MaintainerPacketSchema } } },
    },
  });
  registry.registerPath({
    method: "get",
    path: "/v1/contributors/{login}/profile",
    responses: {
      200: { description: "Contributor evidence profile", content: { "application/json": { schema: ContributorProfileSchema } } },
    },
  });
  registry.registerPath({
    method: "get",
    path: "/v1/contributors/{login}/opportunities",
    responses: {
      200: {
        description: "Contributor profile and ranked opportunities",
        content: {
          "application/json": {
            schema: ContributorOpportunitiesResponseSchema,
          },
        },
      },
    },
  });
  registry.registerPath({
    method: "post",
    path: "/v1/preflight/pr",
    responses: {
      200: { description: "Submission preflight result", content: { "application/json": { schema: PreflightResultSchema } } },
      400: { description: "Invalid preflight input" },
    },
  });
  registry.registerPath({
    method: "get",
    path: "/v1/bounties",
    responses: {
      200: { description: "Known bounty records", content: { "application/json": { schema: BountySchema.array() } } },
    },
  });
  registry.registerPath({
    method: "get",
    path: "/v1/bounties/{id}/advisory",
    responses: {
      200: { description: "Bounty lifecycle advisory", content: { "application/json": { schema: BountyAdvisorySchema } } },
      404: { description: "Bounty not found" },
    },
  });
  registry.registerPath({
    method: "post",
    path: "/v1/github/webhook",
    responses: {
      202: { description: "Webhook queued" },
      401: { description: "Invalid webhook signature" },
    },
  });
  registry.registerPath({
    method: "post",
    path: "/v1/internal/jobs/refresh-registry",
    responses: {
      202: { description: "Registry refresh queued" },
      401: { description: "Invalid internal token" },
    },
  });
  registry.registerPath({
    method: "post",
    path: "/v1/internal/bounties/import",
    responses: {
      200: { description: "Bounty snapshot imported" },
      401: { description: "Invalid internal token" },
    },
  });

  const generator = new OpenApiGeneratorV3(registry.definitions);
  return generator.generateDocument({
    openapi: "3.0.3",
    info: {
      title: "Gittensory API",
      version: "0.1.0",
      description: "Backend API for Gittensory advisory checks and Gittensor repository context.",
    },
  });
}
