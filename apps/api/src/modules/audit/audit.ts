import { and, count, eq, gte } from 'drizzle-orm';
import type { Database } from '../../db/client';
import { auditEvents } from '../../db/schema';

export const AUDIT_ACTIONS = [
  'auth.signed_in',
  'auth.signed_out',
  'auth.signed_out_everywhere',
  'onboarding.student_completed',
  'onboarding.doctor_code_rejected',
  'onboarding.doctor_verification_sent',
  'onboarding.doctor_email_code_rejected',
  'onboarding.doctor_activated',
  'admin.role_granted',
  'admin.doctor_code_rotated',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

interface AuditEntry {
  actorUserId: string | null;
  action: AuditAction;
  /**
   * Taken from the application clock, not the database default, because time windows
   * (such as "wrong codes in the last hour") are computed with that same clock.
   */
  at: Date;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null | undefined;
}

export async function recordAudit(db: Database, entry: AuditEntry): Promise<void> {
  await db.insert(auditEvents).values({
    actorUserId: entry.actorUserId,
    action: entry.action,
    metadata: entry.metadata ?? {},
    ipAddress: entry.ipAddress ?? null,
    createdAt: entry.at,
  });
}

/** Counts a user's events since a moment, e.g. rejected codes in the last hour. */
export async function countRecentAudit(
  db: Database,
  actorUserId: string,
  action: AuditAction,
  since: Date,
): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.actorUserId, actorUserId),
        eq(auditEvents.action, action),
        gte(auditEvents.createdAt, since),
      ),
    );
  return row?.total ?? 0;
}
