import { z } from 'zod';

export const TutorHintPolicySchema = z.enum([
  'dont_give_full_solution',
  'guided',
  'direct'
]);

export const TutorPlanStepSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  success_criteria: z.array(z.string().min(1)).default([]),
  hint_policy: TutorHintPolicySchema
});

export const TutorPlanSchema = z.object({
  goal: z.string().min(1),
  prerequisites: z.array(z.string().min(1)).default([]),
  common_mistakes: z.array(z.string().min(1)).default([]),
  steps: z.array(TutorPlanStepSchema).min(1)
});

export const TutorStateSchema = z.object({
  currentStepId: z.string().min(1).nullable().default(null),
  completedStepIds: z.array(z.string().min(1)).default([])
});

export const TutorPayloadSchema = z.object({
  plan: TutorPlanSchema,
  state: TutorStateSchema
});

export type TutorPlan = z.infer<typeof TutorPlanSchema>;
export type TutorState = z.infer<typeof TutorStateSchema>;
export type TutorPayload = z.infer<typeof TutorPayloadSchema>;

export function normalizeTutorState(value: unknown): TutorState {
  const parsed = TutorStateSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  return { currentStepId: null, completedStepIds: [] };
}

export function safeParseTutorPlan(value: unknown): { ok: true; plan: TutorPlan } | { ok: false; error: string } {
  const parsed = TutorPlanSchema.safeParse(value);
  if (parsed.success) return { ok: true, plan: parsed.data };
  return { ok: false, error: parsed.error.message };
}
