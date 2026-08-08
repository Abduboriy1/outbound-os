/**
 * Demo workspace. Everything here is obviously fictional — the point is to make
 * the pipeline, scoring, and approval queue explorable on a fresh install, not
 * to imply real customers.
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../server/generated/prisma/client";
import type { LeadStage } from "../server/generated/prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const DEMO_EMAIL = "demo@example.com";
const DEMO_PASSWORD = "demo12345";

function daysAgo(n: number) {
  return new Date(Date.now() - n * 24 * 3600 * 1000);
}

function daysAhead(n: number) {
  return new Date(Date.now() + n * 24 * 3600 * 1000);
}

const COMPANIES: {
  name: string;
  domain: string;
  industry: string;
  location: string;
  employeeCount: number;
  description: string;
  stage: LeadStage;
  fit: number;
  opportunity: number;
  contact: { firstName: string; lastName: string; title: string; email: string };
}[] = [
  {
    name: "Northline Freight (sample)",
    domain: "northline-freight.example",
    industry: "Logistics",
    location: "Columbus, OH",
    employeeCount: 140,
    description:
      "Regional LTL carrier running dispatch from a TMS with weekly Excel consolidation for customer reporting.",
    stage: "READY_FOR_OUTREACH",
    fit: 92,
    opportunity: 81,
    contact: {
      firstName: "Dana",
      lastName: "Okafor",
      title: "VP Operations",
      email: "dana.okafor@northline-freight.example",
    },
  },
  {
    name: "Harbor Point Logistics (sample)",
    domain: "harborpoint.example",
    industry: "Transportation",
    location: "Savannah, GA",
    employeeCount: 62,
    description:
      "Drayage operator coordinating container moves across three portals with duplicate data entry.",
    stage: "CONTACTED",
    fit: 88,
    opportunity: 74,
    contact: {
      firstName: "Ruben",
      lastName: "Castillo",
      title: "Director of Operations",
      email: "ruben.castillo@harborpoint.example",
    },
  },
  {
    name: "Meridian Field Services (sample)",
    domain: "meridianfield.example",
    industry: "Professional Services",
    location: "Denver, CO",
    employeeCount: 210,
    description:
      "Field service firm reconciling technician timesheets against invoicing by hand each month.",
    stage: "RESPONDED",
    fit: 79,
    opportunity: 86,
    contact: {
      firstName: "Priya",
      lastName: "Raman",
      title: "COO",
      email: "priya.raman@meridianfield.example",
    },
  },
  {
    name: "Cedar & Vale Supply (sample)",
    domain: "cedarvale.example",
    industry: "Distribution",
    location: "Portland, OR",
    employeeCount: 45,
    description:
      "Wholesale distributor whose order intake arrives by email and is retyped into an ERP.",
    stage: "DISCOVERY",
    fit: 84,
    opportunity: 78,
    contact: {
      firstName: "Marcus",
      lastName: "Lindqvist",
      title: "Owner",
      email: "marcus@cedarvale.example",
    },
  },
  {
    name: "Beacon Compliance Group (sample)",
    domain: "beaconcompliance.example",
    industry: "Professional Services",
    location: "Austin, TX",
    employeeCount: 88,
    description:
      "Compliance consultancy assembling client audit packets from four disconnected tools.",
    stage: "OPPORTUNITY",
    fit: 81,
    opportunity: 90,
    contact: {
      firstName: "Alice",
      lastName: "Werner",
      title: "Managing Director",
      email: "alice.werner@beaconcompliance.example",
    },
  },
  {
    name: "Trailhead Equipment Rental (sample)",
    domain: "trailheadrental.example",
    industry: "Equipment Rental",
    location: "Boise, ID",
    employeeCount: 34,
    description:
      "Rental yard tracking availability in a shared spreadsheet that several branches edit at once.",
    stage: "PROSPECT",
    fit: 68,
    opportunity: 62,
    contact: {
      firstName: "Sam",
      lastName: "Whitfield",
      title: "General Manager",
      email: "sam.whitfield@trailheadrental.example",
    },
  },
];

async function main() {
  const existing = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });
  if (existing) {
    console.log(`Demo user ${DEMO_EMAIL} already exists — skipping seed.`);
    return;
  }

  const user = await prisma.user.create({
    data: {
      email: DEMO_EMAIL,
      name: "Demo Operator",
      passwordHash: await bcrypt.hash(DEMO_PASSWORD, 12),
      tone: "direct, plain, specific — no hype, no flattery",
      settings: {
        create: {
          senderName: "Demo Operator",
          senderEmail: DEMO_EMAIL,
          physicalAddress: "123 Example Street, Springfield, IL 62704",
          dailySendLimit: 25,
        },
      },
    },
  });

  // Plan §38 defaults: research and scoring run automatically, anything a
  // prospect would see requires review.
  await prisma.automationSetting.createMany({
    data: [
      { userId: user.id, key: "initial_outreach", mode: "AI_REVIEW_REQUIRED" },
      { userId: user.id, key: "reply", mode: "AI_REVIEW_REQUIRED" },
      { userId: user.id, key: "research", mode: "AUTO_APPROVED" },
      { userId: user.id, key: "lead_scoring", mode: "AUTO_APPROVED" },
      { userId: user.id, key: "follow_up_task", mode: "AUTO_APPROVED" },
      { userId: user.id, key: "proposal", mode: "AI_REVIEW_REQUIRED" },
    ],
  });

  const icp = await prisma.icp.create({
    data: {
      userId: user.id,
      name: "Logistics Automation ICP",
      description:
        "Operations-heavy companies that have outgrown spreadsheets but are too specific for off-the-shelf software.",
      industries: ["Logistics", "Trucking", "Transportation", "Distribution"],
      minEmployees: 20,
      maxEmployees: 500,
      geographies: ["United States"],
      problems: [
        "spreadsheets",
        "repetitive data entry",
        "manual reporting",
        "disconnected software",
        "dispatch workflows",
        "compliance workflows",
        "duplicate data entry",
      ],
      targetRoles: [
        "Owner",
        "COO",
        "VP Operations",
        "Director of Operations",
        "CTO",
      ],
      minDealSize: 8000,
      maxDealSize: 60000,
      isDefault: true,
      weights: {
        fit: { industry: 30, size: 20, geography: 10, role: 20, budget: 20 },
        opportunity: {
          painSignals: 35,
          hiring: 15,
          manualWorkflows: 20,
          growth: 10,
          decisionMaker: 20,
        },
      },
    },
  });

  for (const [index, def] of COMPANIES.entries()) {
    const company = await prisma.company.create({
      data: {
        userId: user.id,
        name: def.name,
        domain: def.domain,
        website: `https://${def.domain}`,
        industry: def.industry,
        location: def.location,
        employeeCount: def.employeeCount,
        description: def.description,
      },
    });

    const contact = await prisma.contact.create({
      data: {
        userId: user.id,
        companyId: company.id,
        firstName: def.contact.firstName,
        lastName: def.contact.lastName,
        title: def.contact.title,
        email: def.contact.email,
        decisionRole: def.contact.title === "Owner" ? "DECISION_MAKER" : "CHAMPION",
        influenceScore: 70 + (index % 3) * 10,
        relationshipStatus: "NEW",
      },
    });

    const overall = Math.round((def.fit + def.opportunity) / 2);

    const lead = await prisma.lead.create({
      data: {
        userId: user.id,
        companyId: company.id,
        contactId: contact.id,
        icpId: icp.id,
        stage: def.stage,
        sourceType: index === 0 ? "WEBSITE_FORM" : "MANUAL",
        estimatedValueMin: 15000,
        estimatedValueMax: 30000,
        fitScore: def.fit,
        opportunityScore: def.opportunity,
        overallScore: overall,
        nextAction:
          def.stage === "READY_FOR_OUTREACH"
            ? "Approve and send initial outreach"
            : "Send follow-up",
        nextActionDueAt: daysAhead(index - 2),
        lastActivityAt: daysAgo(index + 1),
        lastContactedAt: def.stage === "PROSPECT" ? null : daysAgo(index + 3),
        stageHistory: {
          create: {
            previousStage: null,
            newStage: def.stage,
            reason: "Seeded demo data",
            actorType: "SYSTEM",
          },
        },
        scores: {
          create: {
            fitScore: def.fit,
            opportunityScore: def.opportunity,
            overallScore: overall,
            rationale:
              "Seeded score. Re-run research to replace it with a computed value.",
          },
        },
      },
    });

    await prisma.activity.create({
      data: {
        userId: user.id,
        leadId: lead.id,
        companyId: company.id,
        contactId: contact.id,
        type: "LEAD_CREATED",
        summary: `Lead created for ${company.name}`,
        actorType: "SYSTEM",
        occurredAt: daysAgo(index + 5),
      },
    });

    await prisma.task.create({
      data: {
        userId: user.id,
        leadId: lead.id,
        contactId: contact.id,
        title:
          def.stage === "READY_FOR_OUTREACH"
            ? `Review outreach draft for ${company.name}`
            : `Follow up with ${contact.firstName}`,
        dueAt: daysAhead(index - 2),
        createdByAi: index % 2 === 0,
      },
    });
  }

  await prisma.goal.createMany({
    data: [
      { userId: user.id, metric: "COMPANIES_RESEARCHED", period: "WEEKLY", target: 30 },
      { userId: user.id, metric: "CONTACTS_IDENTIFIED", period: "WEEKLY", target: 30 },
      { userId: user.id, metric: "OUTREACH_SENT", period: "WEEKLY", target: 30 },
      { userId: user.id, metric: "FOLLOW_UPS_SENT", period: "WEEKLY", target: 10 },
      { userId: user.id, metric: "CONVERSATIONS", period: "WEEKLY", target: 5 },
      { userId: user.id, metric: "DISCOVERY_CALLS", period: "WEEKLY", target: 3 },
      { userId: user.id, metric: "PROPOSALS", period: "WEEKLY", target: 1 },
    ],
  });

  await prisma.caseStudy.create({
    data: {
      userId: user.id,
      slug: "sample-automated-weekly-reporting",
      title: "Automated weekly operations reporting (illustrative)",
      industry: "Logistics",
      problem:
        "Weekly customer reports were assembled by exporting three systems to CSV and merging them in Excel.",
      solution:
        "A scheduled pipeline that pulls each source on a timer and publishes a shared operations dashboard.",
      technologies: ["TypeScript", "Postgres", "Scheduled jobs"],
      businessResult:
        "Reporting moved from a recurring manual task to an automatic one, with the same numbers available daily instead of weekly.",
      publicUse: false,
    },
  });

  console.log(
    `Seeded demo workspace.\n  email:    ${DEMO_EMAIL}\n  password: ${DEMO_PASSWORD}`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
