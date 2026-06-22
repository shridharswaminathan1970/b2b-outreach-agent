import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS ?? 12);

// Fixed ids so seed + the multitenancy migration agree (idempotent re-seed).
const DEFAULT_COMPANY_ID = '00000000-0000-0000-0000-000000000001';
const DEFAULT_TEAM_ID = '00000000-0000-0000-0000-000000000002';

async function seedUsers() {
  // Tenant: every user/record belongs to a company.
  const company = await prisma.company.upsert({
    where: { id: DEFAULT_COMPANY_ID },
    update: {},
    create: {
      id: DEFAULT_COMPANY_ID,
      name: 'Default Company',
      status: 'active',
      // salesFramework defaults to "general"; switch a tenant to "ignite_apex"
      // from Company Settings to run the IGNITE-APEX Sales OS.
      // Generic product context — every AI generation reads this; nothing about
      // any specific product is hardcoded. Replace with your own product.
      settingsJson: {
        product: {
          name: 'eMOBIQ AI',
          vendor: 'Orangekloud Technology',
          category: 'AI low-code / vibe-coding platform',
          valueProp:
            'lets business teams and IT build and iterate on internal tools in plain language, cutting turnaround from weeks to under a day',
          market: 'operations and IT teams with internal-tooling backlogs',
          icp: 'mid-market teams losing weeks to slow internal software changes',
        },
      },
    },
  });
  const team = await prisma.team.upsert({
    where: { id: DEFAULT_TEAM_ID },
    update: {},
    create: {
      id: DEFAULT_TEAM_ID,
      companyId: company.id,
      name: 'Default Team',
      department: 'Sales',
    },
  });

  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com';
  const adminPasswordHash = await bcrypt.hash(
    process.env.SEED_ADMIN_PASSWORD ?? 'Admin@SecurePassword123',
    BCRYPT_ROUNDS,
  );
  // SUPER_ADMIN sits atop the company hierarchy (no team, no manager).
  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      name: process.env.SEED_ADMIN_NAME ?? 'Admin',
      email: adminEmail,
      passwordHash: adminPasswordHash,
      role: 'super_admin',
      companyId: company.id,
    },
  });

  const mgrPasswordHash = await bcrypt.hash('Test@Password123', BCRYPT_ROUNDS);
  const manager = await prisma.user.upsert({
    where: { email: 'manager@example.com' },
    update: {},
    create: {
      name: 'Test Sales Manager',
      email: 'manager@example.com',
      passwordHash: mgrPasswordHash,
      role: 'sales_manager',
      companyId: company.id,
      teamId: team.id,
      reportsToUserId: admin.id,
    },
  });

  const sdrPasswordHash = await bcrypt.hash('Test@Password123', BCRYPT_ROUNDS);
  const sdr = await prisma.user.upsert({
    where: { email: 'sdr@example.com' },
    update: {},
    create: {
      name: 'Test SDR',
      email: 'sdr@example.com',
      passwordHash: sdrPasswordHash,
      role: 'sdr',
      companyId: company.id,
      teamId: team.id,
      reportsToUserId: manager.id,
    },
  });

  // Designate the manager as the team's reporting head.
  await prisma.team.update({
    where: { id: team.id },
    data: { managerUserId: manager.id },
  });

  return { admin, manager, sdr, company, team };
}

async function seedPromptVersions(createdById: string) {
  const promptVersions = [
    {
      name: 'Draft Generation v1',
      purpose: 'draft_generation',
      promptText: [
        'You are an SDR writing a short, personalized cold outreach email on behalf of {{vendor_name}}, which offers {{product_name}}: {{value_prop}}.',
        'Use the details below to write a subject line and body. Keep it concise, specific, and free of generic marketing language.',
        '',
        'Contact name: {{contact_name}}',
        'Company: {{company}}',
        'Title: {{title}}',
        'Pain points: {{pain_points}}',
        'Target market: {{market}}',
        '',
        'Return the subject and body only.',
      ].join('\n'),
      modelName: process.env.ANTHROPIC_MODEL_DRAFT ?? 'claude-sonnet-4-6',
      maxTokens: Number(process.env.ANTHROPIC_MAX_TOKENS_DRAFT ?? 1500),
      temperature: 0.7,
    },
    {
      name: 'Reply Classification v1',
      purpose: 'reply_classification',
      promptText: [
        'Classify the following email reply into exactly one of these categories:',
        'interested, objection, out_of_office, unsubscribe, bounce, unknown.',
        'Return a JSON object with "classification", "confidence" (0-1), and "summary".',
        '',
        'Reply text: {{reply_text}}',
      ].join('\n'),
      modelName: process.env.ANTHROPIC_MODEL_CLASSIFY ?? 'claude-haiku-4-5-20251001',
      maxTokens: Number(process.env.ANTHROPIC_MAX_TOKENS_CLASSIFY ?? 300),
      temperature: 0,
    },
    {
      name: 'Research Brief v1',
      purpose: 'research_brief',
      promptText: [
        'Produce a short structured research brief to inform a personalized outreach email.',
        '',
        'Contact name: {{contact_name}}',
        'Company: {{company}}',
        'Title: {{title}}',
        'Pain points: {{pain_points}}',
        '',
        'Return 3-5 bullet points covering likely priorities, possible pain points, and a relevant hook.',
      ].join('\n'),
      modelName: process.env.ANTHROPIC_MODEL_RESEARCH ?? 'claude-sonnet-4-6',
      maxTokens: 800,
      temperature: 0.3,
    },
    {
      name: 'Quality Evaluation v1',
      purpose: 'quality_eval',
      promptText: [
        'Score the following draft email on personalization, clarity, and tone.',
        'Return a JSON object with "quality_score" (0-1), "personalization_score" (0-1), and "notes".',
        '',
        'Contact name: {{contact_name}}',
        'Company: {{company}}',
        'Subject: {{subject}}',
        'Body: {{body}}',
      ].join('\n'),
      modelName: process.env.ANTHROPIC_MODEL_DRAFT ?? 'claude-sonnet-4-6',
      maxTokens: 500,
      temperature: 0.2,
    },
  ];

  for (const pv of promptVersions) {
    const existing = await prisma.promptVersion.findFirst({
      where: { purpose: pv.purpose, isActive: true },
    });
    if (!existing) {
      await prisma.promptVersion.create({
        data: { ...pv, version: 1, isActive: true, createdBy: createdById },
      });
    }
  }
}

async function seedKnowledgeSnippets(createdById: string, companyId: string) {
  const snippets = [
    {
      name: 'eMOBIQ AI Platform Overview',
      category: 'product',
      tags: ['emobiq', 'vibe-coding', 'low-code', 'platform'],
      content:
        "eMOBIQ AI is Orangekloud's vibe coding platform — an AI-native environment that lets business teams and IT " +
        'consultants describe what they need in plain language and get a working internal tool, dashboard, or workflow ' +
        'automation in minutes instead of weeks. It removes the back-and-forth of traditional custom development: no ' +
        'opaque developer invoices, no multi-week tickets for a simple dashboard fix, and no waiting on a backlog. ' +
        'eMOBIQ AI integrates with common business systems (ERPs, CRMs, spreadsheets) and lets non-engineers iterate on ' +
        'internal software safely, with built-in guardrails, versioning, and one-click rollback.',
    },
    {
      name: 'Free Pilot Offer',
      category: 'offer',
      tags: ['pilot', 'free-trial', 'offer'],
      content:
        'We offer qualified prospects a free 2-week pilot: our team works with one of your real internal use cases (a ' +
        'dashboard, an approval workflow, or a reporting tool) and rebuilds it in eMOBIQ AI at no cost. You keep the ' +
        'resulting app whether or not you continue with us afterward. No credit card, no long-term contract — just a ' +
        "working tool delivered in days so you can see the platform's speed and quality firsthand.",
    },
    {
      name: 'SME Digital Transformation Case Study',
      category: 'case_study',
      tags: ['case-study', 'sme', 'manufacturing'],
      content:
        'A 120-person manufacturing distributor was relying on a patchwork of spreadsheets and a single overworked ' +
        'in-house developer to maintain its order-tracking tools. Requests for small dashboard changes routinely took ' +
        '3-4 weeks to ship, and the backlog kept growing. After adopting eMOBIQ AI, their operations team rebuilt their ' +
        'three most-used internal tools themselves within the first month, cut average change turnaround from weeks to ' +
        "under a day, and freed their one developer to focus on the company's customer-facing product instead of " +
        'internal tooling.',
    },
  ];

  for (const s of snippets) {
    const existing = await prisma.knowledgeSnippet.findFirst({ where: { name: s.name } });
    if (!existing) {
      await prisma.knowledgeSnippet.create({ data: { ...s, createdBy: createdById, companyId } });
    }
  }
}

async function seedTemplates(createdById: string, companyId: string) {
  const templates = [
    {
      name: 'Touch 1 - Value Email',
      subjectTemplate: 'Quick question about internal tools at {{company}}',
      bodyTemplate: [
        'Hi {{contact_name}},',
        '',
        "Most teams I talk to at companies like {{company}} have at least one internal dashboard or workflow that's " +
          'stuck in a developer queue for weeks.',
        '',
        'eMOBIQ AI lets your own team describe what they need in plain language and get a working tool back in ' +
          'minutes — no backlog, no invoice surprises.',
        '',
        'Worth a 15-minute look?',
        '',
        'Best,',
        '{{sender_name}}',
      ].join('\n'),
      persona: 'sdr_outbound',
      touchNumber: 1,
      campaignType: 'outbound_cold',
      variables: ['{{contact_name}}', '{{company}}', '{{sender_name}}'],
    },
    {
      name: 'Touch 7 - Webinar Invite',
      subjectTemplate: 'Live walkthrough: building internal tools in minutes ({{webinar_date}})',
      bodyTemplate: [
        'Hi {{contact_name}},',
        '',
        "We're running a live 30-minute walkthrough on {{webinar_date}} showing how teams use eMOBIQ AI to ship " +
          'internal tools without waiting on a dev queue.',
        '',
        'Would you like a seat?',
        '',
        'Best,',
        '{{sender_name}}',
      ].join('\n'),
      persona: 'sdr_outbound',
      touchNumber: 7,
      campaignType: 'outbound_cold',
      variables: ['{{contact_name}}', '{{webinar_date}}', '{{sender_name}}'],
    },
  ];

  const created: Record<number, string> = {};
  for (const t of templates) {
    let row = await prisma.template.findFirst({ where: { name: t.name } });
    if (!row) {
      row = await prisma.template.create({ data: { ...t, createdBy: createdById, companyId } });
    }
    created[t.touchNumber] = row.id;
  }
  return created;
}

async function seedCampaignAndSequence(
  createdById: string,
  templateIdByTouch: Record<number, string>,
  companyId: string,
  teamId: string,
) {
  let campaign = await prisma.campaign.findFirst({ where: { name: 'eMOBIQ AI Launch Campaign' } });
  if (!campaign) {
    campaign = await prisma.campaign.create({
      data: {
        name: 'eMOBIQ AI Launch Campaign',
        objective: 'Generate free-pilot signups for eMOBIQ AI',
        persona: 'sdr_outbound',
        icpRulesJson: {
          seniority: ['c_suite', 'vp', 'director'],
          sizeBand: ['11-50', '51-200', '201-500'],
        },
        status: 'draft',
        createdBy: createdById,
        ownerUserId: createdById,
        companyId,
        teamId,
      },
    });
  }

  let sequence = await prisma.sequence.findFirst({
    where: { campaignId: campaign.id, name: '9-Touch IHL Sequence' },
  });
  if (!sequence) {
    sequence = await prisma.sequence.create({
      data: {
        campaignId: campaign.id,
        name: '9-Touch IHL Sequence',
        description: '9-touch interest/hook/landing email sequence for the eMOBIQ AI launch campaign',
        version: 1,
        status: 'draft',
        totalSteps: 9,
      },
    });

    const delaysHours = [0, 96, 96, 120, 120, 120, 120, 96, 72];
    for (let i = 0; i < delaysHours.length; i++) {
      const stepOrder = i + 1;
      await prisma.sequenceStep.create({
        data: {
          sequenceId: sequence.id,
          stepOrder,
          channel: 'email',
          delayHours: delaysHours[i],
          delayType: 'business_hours',
          templateId: templateIdByTouch[stepOrder] ?? null,
          stopConditions: { on_reply: true, on_unsubscribe: true },
        },
      });
    }
  }

  return { campaign, sequence };
}

async function seedContacts(companyId: string, teamId: string) {
  const accountsAndContacts = [
    {
      account: {
        name: 'National University of Singapore',
        domain: 'nus.edu.sg',
        industry: 'Higher Education',
        sizeBand: '1000+',
        country: 'Singapore',
        website: 'https://www.nus.edu.sg',
      },
      contact: {
        firstName: 'Wei Ling',
        lastName: 'Tan',
        name: 'Wei Ling Tan',
        email: 'weiling.tan@nus.edu.sg',
        title: 'Dean of Computing',
        seniority: 'c_suite',
        department: 'Computing',
        location: 'Singapore',
      },
    },
    {
      account: {
        name: 'Meridian ERP Solutions',
        domain: 'meridianerp.com.my',
        industry: 'ERP Reseller',
        sizeBand: '51-200',
        country: 'Malaysia',
        website: 'https://www.meridianerp.com.my',
      },
      contact: {
        firstName: 'Arif',
        lastName: 'Rahman',
        name: 'Arif Rahman',
        email: 'arif.rahman@meridianerp.com.my',
        title: 'Chief Technology Officer',
        seniority: 'c_suite',
        department: 'Engineering',
        location: 'Kuala Lumpur, Malaysia',
      },
    },
    {
      account: {
        name: 'NovaStack Technologies',
        domain: 'novastack.io',
        industry: 'Technology Startup',
        sizeBand: '1-10',
        country: 'United Arab Emirates',
        website: 'https://www.novastack.io',
      },
      contact: {
        firstName: 'Sara',
        lastName: 'Al Mansoori',
        name: 'Sara Al Mansoori',
        email: 'sara@novastack.io',
        title: 'Founder',
        seniority: 'c_suite',
        department: 'Executive',
        location: 'Dubai, UAE',
      },
    },
  ];

  for (const { account, contact } of accountsAndContacts) {
    let accountRow = await prisma.account.findFirst({ where: { name: account.name } });
    if (!accountRow) {
      accountRow = await prisma.account.create({
        data: { ...account, enriched: false, companyId },
      });
    }

    const existingContact = await prisma.contact.findFirst({ where: { email: contact.email } });
    if (!existingContact) {
      await prisma.contact.create({
        data: {
          ...contact,
          accountId: accountRow.id,
          companyId,
          teamId,
          status: 'new',
          enriched: false,
          validated: false,
          suppressed: false,
          source: 'manual',
        },
      });
    }
  }
}

async function main() {
  const { admin, company, team } = await seedUsers();
  await seedPromptVersions(admin.id);
  await seedKnowledgeSnippets(admin.id, company.id);
  const templateIdByTouch = await seedTemplates(admin.id, company.id);
  await seedCampaignAndSequence(admin.id, templateIdByTouch, company.id, team.id);
  await seedContacts(company.id, team.id);

  console.log('Seed complete.');
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
