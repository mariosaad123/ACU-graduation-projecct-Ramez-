import { Router } from 'express';
import type { HealthResponse } from '@acu/shared';

export function createHealthRouter(version: string): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    const body: HealthResponse = {
      status: 'ok',
      version,
      uptimeSeconds: Math.round(process.uptime()),
    };
    res.json(body);
  });

  return router;
}
