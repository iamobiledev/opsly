import bcrypt from "bcryptjs";
import { prisma } from "./client";

const adminEmail = process.env.OPS_ADMIN_EMAIL ?? "allen@rowshr.com";
const adminName = process.env.OPS_ADMIN_NAME ?? "Allen Abraham";
const adminPassword = process.env.OPS_ADMIN_PASSWORD ?? "change-me-before-production";

async function main() {
  const passwordHash = await bcrypt.hash(adminPassword, 12);

  const org = await prisma.organization.upsert({
    where: { slug: "rows" },
    create: { name: "ROWS", slug: "rows" },
    update: { name: "ROWS" }
  });

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    create: {
      email: adminEmail,
      name: adminName,
      passwordHash,
      timezone: "America/New_York"
    },
    update: {
      name: adminName,
      passwordHash
    }
  });

  await prisma.membership.upsert({
    where: { organizationId_userId: { organizationId: org.id, userId: admin.id } },
    create: { organizationId: org.id, userId: admin.id, role: "owner" },
    update: { role: "owner" }
  });

  const frontendTeam = await prisma.team.upsert({
    where: { organizationId_slug: { organizationId: org.id, slug: "frontend" } },
    create: {
      organizationId: org.id,
      name: "Frontend",
      slug: "frontend",
      description: "ROWS Next.js frontend and Vercel tenant deployments"
    },
    update: {}
  });

  const backendTeam = await prisma.team.upsert({
    where: { organizationId_slug: { organizationId: org.id, slug: "backend" } },
    create: {
      organizationId: org.id,
      name: "Backend",
      slug: "backend",
      description: "ROWS Laravel backend, queues, jobs, and Nightwatch alerts"
    },
    update: {}
  });

  const operationsTeam = await prisma.team.upsert({
    where: { organizationId_slug: { organizationId: org.id, slug: "operations" } },
    create: {
      organizationId: org.id,
      name: "Operations",
      slug: "operations",
      description: "Incident command, escalation ownership, and production operations"
    },
    update: {}
  });

  for (const team of [frontendTeam, backendTeam, operationsTeam]) {
    await prisma.teamMembership.upsert({
      where: { teamId_userId: { teamId: team.id, userId: admin.id } },
      create: { teamId: team.id, userId: admin.id, role: "owner" },
      update: { role: "owner" }
    });
  }

  const schedule = await prisma.schedule.upsert({
    where: { organizationId_name: { organizationId: org.id, name: "ROWS Primary On-call" } },
    create: {
      organizationId: org.id,
      teamId: operationsTeam.id,
      name: "ROWS Primary On-call",
      timezone: "America/New_York",
      description: "Default bootstrap rotation. Replace with the real ROWS responder roster."
    },
    update: { teamId: operationsTeam.id }
  });

  const layer = await prisma.scheduleLayer.upsert({
    where: { id: "seed-rows-primary-layer" },
    create: {
      id: "seed-rows-primary-layer",
      scheduleId: schedule.id,
      name: "Primary weekly rotation",
      startsAt: new Date("2026-01-01T14:00:00.000Z"),
      rotationType: "weekly",
      rotationLengthMinutes: 10_080,
      handoffTime: "09:00"
    },
    update: { scheduleId: schedule.id }
  });

  await prisma.scheduleParticipant.upsert({
    where: { layerId_userId: { layerId: layer.id, userId: admin.id } },
    create: { layerId: layer.id, userId: admin.id, position: 0 },
    update: { position: 0 }
  });

  const policy = await prisma.escalationPolicy.upsert({
    where: { organizationId_name: { organizationId: org.id, name: "ROWS Default Escalation" } },
    create: {
      organizationId: org.id,
      teamId: operationsTeam.id,
      name: "ROWS Default Escalation",
      repeatCount: 1,
      description: "Notify the primary on-call immediately, then the operations owner after ten minutes."
    },
    update: { teamId: operationsTeam.id }
  });

  await prisma.escalationRule.upsert({
    where: { policyId_level: { policyId: policy.id, level: 0 } },
    create: {
      policyId: policy.id,
      level: 0,
      delayMinutes: 0,
      targetType: "schedule",
      targetId: schedule.id
    },
    update: {
      delayMinutes: 0,
      targetType: "schedule",
      targetId: schedule.id
    }
  });

  await prisma.escalationRule.upsert({
    where: { policyId_level: { policyId: policy.id, level: 1 } },
    create: {
      policyId: policy.id,
      level: 1,
      delayMinutes: 10,
      targetType: "team",
      targetId: operationsTeam.id
    },
    update: {
      delayMinutes: 10,
      targetType: "team",
      targetId: operationsTeam.id
    }
  });

  const frontendService = await prisma.service.upsert({
    where: { organizationId_slug: { organizationId: org.id, slug: "rows-frontend" } },
    create: {
      organizationId: org.id,
      teamId: frontendTeam.id,
      escalationPolicyId: policy.id,
      name: "ROWS Frontend",
      slug: "rows-frontend",
      description: "Next.js frontend deployed per tenant on Vercel; Sentry project rows-frontend-dev.",
      defaultUrgency: "error"
    },
    update: {
      teamId: frontendTeam.id,
      escalationPolicyId: policy.id
    }
  });

  const backendService = await prisma.service.upsert({
    where: { organizationId_slug: { organizationId: org.id, slug: "rows-backend" } },
    create: {
      organizationId: org.id,
      teamId: backendTeam.id,
      escalationPolicyId: policy.id,
      name: "ROWS Backend",
      slug: "rows-backend",
      description: "Laravel 12 / PHP 8.4 backend observed by Laravel Nightwatch.",
      defaultUrgency: "error"
    },
    update: {
      teamId: backendTeam.id,
      escalationPolicyId: policy.id
    }
  });

  const frontendIntegration = await prisma.integration.upsert({
    where: { routingKey: "rows-sentry-frontend" },
    create: {
      organizationId: org.id,
      serviceId: frontendService.id,
      type: "sentry",
      name: "Sentry rows-frontend-dev",
      routingKey: "rows-sentry-frontend",
      secretEncrypted: "env:SENTRY_WEBHOOK_SECRET",
      configJson: {
        sentryOrg: "rows",
        sentryRegionUrl: "https://us.sentry.io",
        sentryProject: "rows-frontend-dev",
        environments: ["key-health", "steady-steps", "amethyst", "radiant", "test"]
      }
    },
    update: {
      serviceId: frontendService.id,
      secretEncrypted: "env:SENTRY_WEBHOOK_SECRET"
    }
  });

  const backendIntegration = await prisma.integration.upsert({
    where: { routingKey: "rows-nightwatch-backend" },
    create: {
      organizationId: org.id,
      serviceId: backendService.id,
      type: "nightwatch",
      name: "Nightwatch Rows Backend",
      routingKey: "rows-nightwatch-backend",
      secretEncrypted: "env:NIGHTWATCH_WEBHOOK_SECRET",
      configJson: {
        nightwatchOrganizationId: "9f2c42a7-1b3e-4886-acc0-275ead62523f",
        nightwatchApplicationId: "9f2c42c9-d339-4b43-8eac-00e04871c794",
        applicationName: "Rows Backend",
        environments: ["Test", "Dev Server", "Amethyst", "Stellar", "Careers"]
      }
    },
    update: {
      serviceId: backendService.id,
      secretEncrypted: "env:NIGHTWATCH_WEBHOOK_SECRET"
    }
  });

  await prisma.routingRule.upsert({
    where: { integrationId_order: { integrationId: frontendIntegration.id, order: 10 } },
    create: {
      integrationId: frontendIntegration.id,
      order: 10,
      name: "ROWS frontend production-like errors",
      conditionsJson: {
        environmentIn: ["key-health", "steady-steps", "amethyst", "radiant"],
        severityIn: ["error", "critical"]
      },
      actionsJson: {
        urgency: "critical",
        serviceSlug: "rows-frontend"
      }
    },
    update: {}
  });

  await prisma.routingRule.upsert({
    where: { integrationId_order: { integrationId: backendIntegration.id, order: 10 } },
    create: {
      integrationId: backendIntegration.id,
      order: 10,
      name: "ROWS backend customer exceptions",
      conditionsJson: {
        environmentNotIn: ["Dev Server"],
        severityIn: ["error", "critical"]
      },
      actionsJson: {
        urgency: "critical",
        serviceSlug: "rows-backend"
      }
    },
    update: {}
  });

  await prisma.suppressionRule.upsert({
    where: { id: "seed-debugbar-suppression" },
    create: {
      id: "seed-debugbar-suppression",
      serviceId: backendService.id,
      name: "Suppress Laravel debugbar dev-server assets",
      conditionsJson: {
        routeStartsWith: "/_debugbar/",
        environmentIn: ["Dev Server"]
      },
      enabled: true
    },
    update: { serviceId: backendService.id, enabled: true }
  });

  await prisma.slackChannelBinding.upsert({
    where: {
      organizationId_channelId_serviceId: {
        organizationId: org.id,
        channelId: process.env.ROWS_FRONTEND_ALERTS_CHANNEL_ID ?? "C0AK9BYH475",
        serviceId: frontendService.id
      }
    },
    create: {
      organizationId: org.id,
      serviceId: frontendService.id,
      channelId: process.env.ROWS_FRONTEND_ALERTS_CHANNEL_ID ?? "C0AK9BYH475",
      channelName: "frontend-alerts",
      mode: "alerts"
    },
    update: { channelName: "frontend-alerts" }
  });

  await prisma.slackChannelBinding.upsert({
    where: {
      organizationId_channelId_serviceId: {
        organizationId: org.id,
        channelId: process.env.ROWS_BACKEND_ALERTS_CHANNEL_ID ?? "C098K02H8H0",
        serviceId: backendService.id
      }
    },
    create: {
      organizationId: org.id,
      serviceId: backendService.id,
      channelId: process.env.ROWS_BACKEND_ALERTS_CHANNEL_ID ?? "C098K02H8H0",
      channelName: "backend-alerts",
      mode: "alerts"
    },
    update: { channelName: "backend-alerts" }
  });

  await prisma.auditLog.create({
    data: {
      organizationId: org.id,
      actorUserId: admin.id,
      actorType: "system",
      action: "seed.rows_defaults",
      targetType: "organization",
      targetId: org.id,
      metadataJson: {
        services: ["ROWS Frontend", "ROWS Backend"],
        integrations: ["Sentry rows-frontend-dev", "Nightwatch Rows Backend"]
      }
    }
  });

  console.info("Seeded Opsly ROWS defaults", {
    organization: org.slug,
    admin: admin.email,
    services: [frontendService.slug, backendService.slug]
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
