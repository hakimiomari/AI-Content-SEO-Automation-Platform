/* eslint-disable no-console */
import { PrismaClient, Role, Plan } from '../packages/database/generated/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const password = await bcrypt.hash('Password123!', 12);

  // Platform super admin (no company)
  await prisma.user.upsert({
    where: { email: 'admin@platform.local' },
    update: {},
    create: {
      email: 'admin@platform.local',
      name: 'Platform Admin',
      passwordHash: password,
      role: Role.SUPER_ADMIN,
      emailVerified: new Date(),
    },
  });

  // Demo tenant
  const company = await prisma.company.upsert({
    where: { slug: 'acme-demo' },
    update: {},
    create: {
      name: 'Acme Demo Co',
      slug: 'acme-demo',
      industry: 'SaaS',
      description: 'Demo company seeded for local development.',
      subscription: { create: { plan: Plan.GROWTH } },
    },
  });

  await prisma.user.upsert({
    where: { email: 'owner@acme.local' },
    update: {},
    create: {
      email: 'owner@acme.local',
      name: 'Acme Owner',
      passwordHash: password,
      role: Role.COMPANY_ADMIN,
      companyId: company.id,
      emailVerified: new Date(),
    },
  });

  await prisma.user.upsert({
    where: { email: 'editor@acme.local' },
    update: {},
    create: {
      email: 'editor@acme.local',
      name: 'Acme Editor',
      passwordHash: password,
      role: Role.CONTENT_MANAGER,
      companyId: company.id,
      emailVerified: new Date(),
    },
  });

  const website = await prisma.website.upsert({
    where: { companyId_domain: { companyId: company.id, domain: 'acme.example.com' } },
    update: {},
    create: {
      companyId: company.id,
      name: 'Acme Marketing Site',
      url: 'https://acme.example.com',
      domain: 'acme.example.com',
      brandVoice: 'Confident, practical, friendly.',
      businessProfile: {
        audience: 'Small business owners',
        products: ['Acme CRM', 'Acme Invoicing'],
        competitors: ['HubSpot', 'Zoho'],
      },
    },
  });

  const project = await prisma.project.create({
    data: {
      companyId: company.id,
      websiteId: website.id,
      name: 'Q4 Organic Growth',
      topic: 'CRM software for small businesses',
      description: 'Grow organic traffic for the CRM product line.',
    },
  });

  const cluster = await prisma.keywordCluster.create({
    data: {
      projectId: project.id,
      name: 'CRM for small business',
      pillar: true,
      intent: 'COMMERCIAL',
    },
  });

  await prisma.keyword.createMany({
    data: [
      {
        projectId: project.id,
        clusterId: cluster.id,
        term: 'best crm for small business',
        volume: 12100,
        difficulty: 62,
        intent: 'COMMERCIAL',
        opportunity: 78,
        source: 'ai',
      },
      {
        projectId: project.id,
        clusterId: cluster.id,
        term: 'crm for startups',
        volume: 2900,
        difficulty: 41,
        intent: 'COMMERCIAL',
        opportunity: 84,
        source: 'ai',
      },
      {
        projectId: project.id,
        clusterId: cluster.id,
        term: 'what is a crm',
        volume: 40500,
        difficulty: 55,
        intent: 'INFORMATIONAL',
        opportunity: 60,
        source: 'ai',
      },
    ],
    skipDuplicates: true,
  });

  console.log('✔ Seed complete');
  console.log('  SUPER_ADMIN    admin@platform.local / Password123!');
  console.log('  COMPANY_ADMIN  owner@acme.local     / Password123!');
  console.log('  CONTENT_MGR    editor@acme.local    / Password123!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
