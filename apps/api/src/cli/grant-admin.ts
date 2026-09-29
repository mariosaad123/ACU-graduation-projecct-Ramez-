import { eq } from 'drizzle-orm';
import { loadEnv } from '../config/env';
import { createDatabase } from '../db/client';
import { users } from '../db/schema';
import { recordAudit } from '../modules/audit/audit';
import { deleteUserSessions } from '../modules/auth/sessions';

/** Makes an existing account an administrator. The person must have signed in once already. */
const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
  console.error('Usage: pnpm --filter @acu/api admin:grant <email>');
  process.exit(1);
}

const env = loadEnv();
const database = createDatabase(env.DATABASE_URL);

try {
  await database.migrate();
  const now = new Date();
  const [user] = await database.db
    .update(users)
    .set({ role: 'admin', updatedAt: now })
    .where(eq(users.email, email))
    .returning({ id: users.id });

  if (!user) {
    console.error(`No account uses ${email}. Ask them to sign in once, then run this again.`);
    process.exitCode = 1;
  } else {
    // Existing sessions were issued for the old role; the person signs in again as an admin.
    await deleteUserSessions(database.db, user.id);
    await recordAudit(database.db, {
      actorUserId: user.id,
      action: 'admin.role_granted',
      at: now,
      metadata: { role: 'admin' },
    });
    console.log(`${email} is now an administrator.`);
  }
} finally {
  await database.close();
}
