// Shared data + seeding logic for the 10 prebuilt Performance Marketing SOP
// templates. Used by both the manual "Load Templates" endpoint
// (sopController.seedTemplates) and the automatic first-boot seed in
// server.js, so the two never drift apart.

const mk = (items) => items.map((title, i) => ({ title, order: i + 1 }))

const SOP_TEMPLATES = [
  // ── SOP 1 ──────────────────────────────────────────────────────────────
  {
    title: 'Meta Ads Campaign Planning',
    department: 'marketing',
    description: 'End-to-end planning process for Meta advertising campaigns — from client goals to internal review before launch.',
    estimatedDuration: '2–3 days',
    isTemplate: true,
    templateCategory: 'Performance Marketing',
    status: 'active',
    tags: ['meta', 'ads', 'campaign', 'planning'],
    days: [
      {
        dayNumber: 1,
        title: 'Campaign Planning',
        items: mk([
          'Client Goals Collected',
          'Target Audience Defined',
          'Competitor Research Completed',
          'Offer Selected',
          'Campaign Objective Selected',
          'Budget Approved',
          'Creative Requirements Prepared',
          'KPI Targets Defined',
          'Campaign Structure Created',
          'Internal Review Completed',
        ]),
      },
    ],
  },

  // ── SOP 2 ──────────────────────────────────────────────────────────────
  {
    title: 'Looker Studio Dashboard Setup',
    department: 'technical',
    description: 'Step-by-step setup of a Looker Studio reporting dashboard connected to GA4, Google Ads, and Meta Ads.',
    estimatedDuration: '1 day',
    isTemplate: true,
    templateCategory: 'Analytics',
    status: 'active',
    tags: ['analytics', 'looker', 'dashboard', 'reporting'],
    days: [
      {
        dayNumber: 1,
        title: 'Dashboard Setup',
        items: mk([
          'GA4 Access Received',
          'Google Ads Access Received',
          'Meta Ads Access Received',
          'Data Sources Connected',
          'Dashboard Template Created',
          'KPI Metrics Configured',
          'Client Branding Added',
          'Dashboard Tested',
          'Dashboard Shared With Client',
        ]),
      },
    ],
  },

  // ── SOP 3 ──────────────────────────────────────────────────────────────
  {
    title: 'Client Onboarding (14-Day)',
    department: 'operations',
    description: 'Complete 14-day client onboarding checklist from contract signing through access collection, tracking setup, and first campaign launch.',
    estimatedDuration: '14 days',
    isTemplate: true,
    templateCategory: 'Operations',
    status: 'active',
    tags: ['onboarding', 'client', '14-day'],
    days: [
      {
        dayNumber: 1,
        title: 'Day 1 — Admin & Welcome',
        items: mk([
          'Contract Signed',
          'Invoice Paid',
          'Welcome Email Sent',
          'Client Added To CRM',
          'WhatsApp Group Created',
        ]),
      },
      {
        dayNumber: 2,
        title: 'Day 2 — Platform Access',
        items: mk([
          'Meta Access Received',
          'Google Ads Access Received',
          'Pixel Access Received',
          'GA4 Access Received',
        ]),
      },
      {
        dayNumber: 3,
        title: 'Day 3 — Tracking Audit',
        items: mk([
          'Tracking Audit Completed',
          'Pixel Verified',
          'Conversion Events Verified',
          'Looker Dashboard Setup',
        ]),
      },
      {
        dayNumber: 7,
        title: 'Day 4–7 — Research & Creative',
        items: mk([
          'Competitor Research Completed',
          'Audience Research Completed',
          'Creative Brief Approved',
          'Funnel Audit Completed',
        ]),
      },
      {
        dayNumber: 14,
        title: 'Day 8–14 — Campaign Launch',
        items: mk([
          'Campaign Setup Completed',
          'Internal QA Completed',
          'Launch Approved',
          'Campaign Live',
        ]),
      },
    ],
  },

  // ── SOP 4 ──────────────────────────────────────────────────────────────
  {
    title: 'Creative Brief & Hook System',
    department: 'marketing',
    description: 'Research-driven process for building high-converting ad creatives — from offer research and audience pain points to approved production-ready briefs.',
    estimatedDuration: '1–2 days',
    isTemplate: true,
    templateCategory: 'Creative',
    status: 'active',
    tags: ['creative', 'brief', 'hooks', 'ads'],
    days: [
      {
        dayNumber: 1,
        title: 'Creative Brief',
        items: mk([
          'Offer Research Completed',
          'Audience Pain Points Identified',
          'Competitor Ads Reviewed',
          'Hook Research Completed',
          'Creative Angles Defined',
          'Creative Brief Created',
          'Internal Approval Received',
          'Creative Production Started',
        ]),
      },
    ],
  },

  // ── SOP 5 ──────────────────────────────────────────────────────────────
  {
    title: 'Daily Media Buying Optimization',
    department: 'marketing',
    description: 'Daily optimization checklist for media buyers — review spend and performance, pause losers, scale winners, and log all decisions.',
    estimatedDuration: '1–2 hours/day',
    isTemplate: true,
    templateCategory: 'Performance Marketing',
    status: 'active',
    tags: ['media buying', 'optimization', 'daily', 'meta'],
    days: [
      {
        dayNumber: 1,
        title: 'Daily Optimization',
        items: mk([
          'Spend Reviewed',
          'CPL Reviewed',
          'ROAS Reviewed',
          'Winning Ads Identified',
          'Losing Ads Paused',
          'Budget Scaling Decisions Logged',
          'Changelog Updated',
          'Optimization Notes Added',
        ]),
      },
    ],
  },

  // ── SOP 6 ──────────────────────────────────────────────────────────────
  {
    title: 'Tracking & CAPI Setup',
    department: 'technical',
    description: 'Complete implementation checklist for Meta Pixel, Conversions API (CAPI), GTM, and GA4 — with deduplication and EMQ verification.',
    estimatedDuration: '1–2 days',
    isTemplate: true,
    templateCategory: 'Analytics',
    status: 'active',
    tags: ['tracking', 'capi', 'pixel', 'ga4', 'gtm'],
    days: [
      {
        dayNumber: 1,
        title: 'Tracking Setup',
        items: mk([
          'Meta Pixel Installed',
          'CAPI Configured',
          'GTM Configured',
          'GA4 Installed',
          'Event Tracking Verified',
          'Deduplication Tested',
          'EMQ Score Above 7',
          'Tracking Audit Passed',
        ]),
      },
    ],
  },

  // ── SOP 7 ──────────────────────────────────────────────────────────────
  {
    title: 'Weekly Client Reporting',
    department: 'client_success',
    description: 'Weekly process for pulling performance data, updating the Looker Studio dashboard, writing the summary, and delivering the report to the client.',
    estimatedDuration: '2–4 hours',
    isTemplate: true,
    templateCategory: 'Account Management',
    status: 'active',
    tags: ['reporting', 'weekly', 'client', 'looker'],
    days: [
      {
        dayNumber: 1,
        title: 'Weekly Report',
        items: mk([
          'Previous Week Data Pulled',
          'Dashboard Updated',
          'Performance Summary Prepared',
          'Wins Documented',
          'Challenges Documented',
          'Next Week Plan Prepared',
          'Client Approval Notes Added',
          'Report Sent',
        ]),
      },
    ],
  },

  // ── SOP 8 ──────────────────────────────────────────────────────────────
  {
    title: 'Funnel & CRO Audit',
    department: 'operations',
    description: 'End-to-end conversion rate audit using GA4, Microsoft Clarity, heatmaps, and session recordings — producing a prioritised CRO recommendations report.',
    estimatedDuration: '1–2 days',
    isTemplate: true,
    templateCategory: 'Growth',
    status: 'active',
    tags: ['cro', 'funnel', 'audit', 'analytics', 'clarity'],
    days: [
      {
        dayNumber: 1,
        title: 'Funnel & CRO Audit',
        items: mk([
          'Funnel Data Collected',
          'GA4 Audit Completed',
          'Clarity Review Completed',
          'Heatmap Analysis Completed',
          'Session Recording Review Completed',
          'CRO Opportunities Identified',
          'Recommendations Prepared',
          'Audit Report Shared',
        ]),
      },
    ],
  },

  // ── SOP 9 ──────────────────────────────────────────────────────────────
  {
    title: 'Hiring & Trial Task System',
    department: 'hr',
    description: 'Structured hiring pipeline — job posting, application screening, interviews, paid trial task evaluation, offer letter, and onboarding kickoff.',
    estimatedDuration: '7–10 days',
    isTemplate: true,
    templateCategory: 'HR',
    status: 'active',
    tags: ['hiring', 'recruitment', 'trial', 'hr'],
    days: [
      {
        dayNumber: 1,
        title: 'Hiring Process',
        items: mk([
          'Job Description Created',
          'Job Posted',
          'Applications Reviewed',
          'Candidate Shortlisted',
          'Trial Task Sent',
          'Trial Task Reviewed',
          'Interview Completed',
          'Hiring Decision Made',
          'Offer Letter Sent',
          'Onboarding Started',
        ]),
      },
    ],
  },

  // ── SOP 10 ─────────────────────────────────────────────────────────────
  {
    title: 'AI Research Workflow',
    department: 'operations',
    description: 'AI-assisted research workflow for deep client and market intelligence — review mining, competitor analysis, ad library research, messaging matrix, and strategy document.',
    estimatedDuration: '1 day',
    isTemplate: true,
    templateCategory: 'Operations',
    status: 'active',
    tags: ['ai', 'research', 'strategy', 'messaging'],
    days: [
      {
        dayNumber: 1,
        title: 'AI Research',
        items: mk([
          'Client Research Started',
          'Review Mining Completed',
          'Pain Points Identified',
          'Competitor Research Completed',
          'Ad Library Analysis Completed',
          'Messaging Matrix Created',
          'Creative Brief Generated',
          'Strategy Document Prepared',
          'Internal Review Completed',
        ]),
      },
    ],
  },
]

// Inserts the 10 templates if none exist yet. `createdById` may be null/undefined
// (e.g. at first server boot before any admin has logged in) — the SOP model's
// createdBy field is optional, so that's safe.
// Returns { seeded: boolean, count: number, message: string }.
async function seedSOPTemplates(SOP, createdById, tenantId) {
  const filter = { isTemplate: true, ...(tenantId ? { tenantId } : {}) }
  const existing = await SOP.countDocuments(filter)
  if (existing > 0) {
    return { seeded: false, count: existing, message: `${existing} templates already exist` }
  }

  const startCount = await SOP.countDocuments()
  const docs = SOP_TEMPLATES.map((t, i) => ({
    ...t,
    sopType: 'performance_marketing',
    sopId: `SOP-${String(startCount + i + 1).padStart(3, '0')}`,
    version: 1,
    versionHistory: [],
    viewCount: 0,
    createdBy: createdById || undefined,
    ...(tenantId ? { tenantId } : {}),
  }))
  await SOP.insertMany(docs, { ordered: false })
  return { seeded: true, count: docs.length, message: `${docs.length} SOP templates seeded successfully` }
}

module.exports = { SOP_TEMPLATES, seedSOPTemplates }
