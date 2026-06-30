"use server";

import { revalidatePath } from "next/cache";
import { createOrUpdateIncidentFromSignal, type Provider } from "@opsly/core";
import { prisma } from "@opsly/db";
import { requireAdmin } from "../auth";

export async function triggerIntegrationTestIncidentAction(formData: FormData) {
  const admin = await requireAdmin();
  const integrationId = String(formData.get("integrationId") ?? "");
  const integration = await prisma.integration.findFirst({
    where: {
      id: integrationId,
      organizationId: admin.memberships[0]?.organizationId
    },
    include: {
      service: true,
      routingRules: true
    }
  });

  if (!integration?.service) {
    return;
  }

  const now = new Date();
  const provider: Provider = integration.type === "nightwatch" ? "nightwatch" : integration.type === "sentry" ? "sentry" : "api";
  const signal =
    provider === "nightwatch"
      ? {
          provider,
          eventType: "trigger" as const,
          externalId: `test-nightwatch-${now.getTime()}`,
          dedupeKey: `test:nightwatch:${integration.id}:${now.getTime()}`,
          title: "Test Nightwatch slow route",
          message: "Synthetic Nightwatch test event from Opsly integration setup",
          severity: "warning" as const,
          environment: "Test",
          serviceHints: {
            serviceSlug: integration.service.slug,
            applicationName: "Rows Backend",
            applicationId: "9f2c42c9-d339-4b43-8eac-00e04871c794"
          },
          occurredAt: now,
          rawSummary: {
            route: "/api/opsly/test",
            durationMs: 4357,
            thresholdMs: 4000,
            source: "opsly_test_button"
          }
        }
      : {
          provider,
          eventType: "trigger" as const,
          externalId: `test-sentry-${now.getTime()}`,
          dedupeKey: `test:sentry:${integration.id}:${now.getTime()}`,
          title: "Test Sentry frontend issue",
          message: "Synthetic Sentry test event from Opsly integration setup",
          severity: "error" as const,
          environment: "test",
          serviceHints: {
            serviceSlug: integration.service.slug,
            projectSlug: "rows-frontend-dev"
          },
          occurredAt: now,
          rawSummary: {
            shortId: "ROWS-FRONTEND-DEV-TEST",
            culprit: "/opsly/test",
            source: "opsly_test_button"
          }
        };

  const result = await createOrUpdateIncidentFromSignal({
    organizationId: integration.organizationId,
    integrationId: integration.id,
    signal,
    actor: { type: "user", id: admin.id, displayName: admin.name },
    routingRules: integration.routingRules.map((rule) => ({
      id: rule.id,
      name: rule.name,
      order: rule.order,
      enabled: rule.enabled,
      conditions: (rule.conditionsJson ?? {}) as never,
      actions: (rule.actionsJson ?? {}) as never
    }))
  });

  if (result.incident) {
    await prisma.auditLog.create({
      data: {
        organizationId: integration.organizationId,
        actorUserId: admin.id,
        actorType: "user",
        action: "integration.test_incident_triggered",
        targetType: "incident",
        targetId: result.incident.id,
        metadataJson: { integrationId: integration.id, provider } as never
      }
    });
  }

  revalidatePath("/dashboard");
  revalidatePath("/incidents");
  revalidatePath("/integrations");
}
