// Contracts use the tree-shakable zod/mini API: they are bundled into the web app.
import * as z from 'zod/mini';

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  version: z.string(),
  uptimeSeconds: z.number().check(z.nonnegative()),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
