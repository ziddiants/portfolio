// Content model (ERD § Content model, N16). All copy lives in src/content/; these schemas reject a
// missing or malformed field at build time. Source IDs are public; what they point to is private (T3).
import { defineCollection } from 'astro:content';
import { file, glob } from 'astro/loaders';
import { z } from 'astro/zod';

// Every entry names at least one source (VF-05 checks the IDs against the private register).
const sources = z.array(z.string().regex(/^S-\d{3}$/)).min(1);

const caseStudies = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/case-studies' }),
  schema: z.object({
    title: z.string(),
    order: z.number(),
    label: z.string(),
    summary: z.string(),
    meta: z.object({
      role: z.string(),
      team: z.string().optional(),
      builtWith: z.string().optional(),
    }),
    ledger: z.string().optional(),
    cardMeta: z.string(),
    cardProblem: z.string().max(160),
    cardRole: z.string(),
    cardOutcome: z.string().max(160),
    prototypeUrl: z.url().optional(),
    disclaimer: z.string().optional(),
    figures: z
      .array(z.object({ src: z.string(), alt: z.string().min(1), caption: z.string() }))
      .default([]),
    sources,
  }),
});

const projects = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/projects' }),
  schema: z.object({
    title: z.string(),
    order: z.number(),
    tag: z.literal('1-week sprint'),
    cardProblem: z.string().max(160),
    cardLine: z.string().optional(),
    problem: z.string(),
    insight: z.string(),
    decision: z.string(),
    mvp: z.string(),
    measure: z.string(),
    prototype: z.object({
      status: z.enum(['live', 'in-progress']),
      url: z.url().optional(),
      demoLogin: z.object({ user: z.string(), password: z.string() }).optional(),
    }),
    prdFile: z.string(),
    sources,
  }),
});

const hero = defineCollection({
  loader: file('./src/content/home/hero.yaml'),
  schema: z.object({
    heroLine: z.string(),
    domainChips: z.array(z.string()).min(1),
    sources,
  }),
});

const principles = defineCollection({
  loader: file('./src/content/home/principles.yaml'),
  schema: z.object({
    order: z.number(),
    title: z.string(),
    proof: z.string(),
    sources,
  }),
});

const about = defineCollection({
  loader: glob({ pattern: 'about.md', base: './src/content/home' }),
  schema: z.object({ sources }),
});

const experience = defineCollection({
  loader: file('./src/content/home/experience.yaml'),
  schema: z.object({
    company: z.string(),
    role: z.string(),
    dates: z.string(),
    location: z.string(),
    bullets: z.array(z.string()).min(1),
    sources,
  }),
});

const toolkit = defineCollection({
  loader: file('./src/content/home/toolkit.yaml'),
  schema: z.object({
    group: z.string(),
    tools: z.array(z.string()).min(1),
    sources,
  }),
});

const contact = defineCollection({
  loader: file('./src/content/home/contact.yaml'),
  schema: z.object({
    lead: z.string(),
    email: z.email(),
    linkedin: z.string(),
    github: z.string(),
    sources,
  }),
});

export const collections = {
  caseStudies,
  projects,
  hero,
  principles,
  about,
  experience,
  toolkit,
  contact,
};
