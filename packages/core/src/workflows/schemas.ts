import { z } from 'zod';

export const specSchema = z.object({
  summary: z.string(),
  targets: z.array(z.enum(['web', 'api', 'mobile'])).min(1),
  imposedStack: z.array(z.string()).describe('Technologies explicitement imposées par le cahier des charges'),
  userStories: z.array(
    z.object({
      id: z.string(),
      priority: z.enum(['must', 'should', 'could', 'wont']),
      story: z.string(),
      acceptanceCriteria: z.array(z.string()),
    }),
  ),
  nonFunctional: z.array(z.string()),
  assumptions: z.array(z.string()),
});
export type Spec = z.infer<typeof specSchema>;

export const planSchema = z.object({
  stack: z.record(z.string(), z.string()),
  architectureMarkdown: z.string(),
  apiMarkdown: z.string(),
  tasks: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      role: z.enum(['backend', 'frontend', 'fullstack', 'mobile']),
      description: z.string(),
      covers: z.array(z.string()).describe('Identifiants des user stories couvertes'),
    }),
  ),
});
export type Plan = z.infer<typeof planSchema>;

export const reviewSchema = z.object({
  findings: z.array(
    z.object({
      severity: z.enum(['info', 'low', 'medium', 'high', 'critical']),
      file: z.string(),
      line: z.number().optional(),
      title: z.string(),
      fix: z.string(),
    }),
  ),
});

const checkSchema = z.object({
  id: z.string(),
  passed: z.boolean(),
  summary: z.string(),
  details: z.string().optional(),
});

/** Données transmises d'étape en étape (sans secret : elles sont persistées dans les snapshots). */
export const chainSchema = z.object({
  tenantId: z.string(),
  runId: z.string(),
  projectId: z.string(),
  projectName: z.string(),
  specText: z.string(),
  sourceRepo: z.string().optional(),
  spec: specSchema.optional(),
  plan: planSchema.optional(),
  repo: z.object({ fullName: z.string(), htmlUrl: z.string(), prUrl: z.string().optional() }).optional(),
  vercelProject: z.string().optional(),
  stagingUrl: z.string().optional(),
  productionUrl: z.string().optional(),
  loop: z.object({
    phase: z.enum(['code', 'staging']),
    iteration: z.number(),
    signatures: z.array(z.string()),
    escalationLevel: z.number(),
    done: z.boolean(),
    aborted: z.string().optional(),
  }),
  lastChecks: z.array(checkSchema),
  operations: z.array(z.string()),
  outcome: z.enum(['pending', 'production', 'staging-only', 'failed']),
});
export type ChainData = z.infer<typeof chainSchema>;
