import { stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline/promises';
import { isNull } from 'drizzle-orm';
import { loadEnv } from '../config/env';
import { createDatabase } from '../db/client';
import { doctorAccessCodes } from '../db/schema';
import { hashSecret } from '../lib/crypto';
import { recordAudit } from '../modules/audit/audit';

const MIN_LENGTH = 8;

/**
 * Sets the faculty-wide code doctors enter when they register. The previous code stops working.
 * The code is typed at a prompt rather than passed as an argument, so it never lands in the
 * shell history; in non-interactive environments it is read from DOCTOR_ACCESS_CODE.
 */
async function readCode(): Promise<string> {
  if (!stdin.isTTY) {
    return process.env.DOCTOR_ACCESS_CODE?.trim() ?? '';
  }
  const prompt = createInterface({ input: stdin, output: stdout });
  try {
    const code = (await prompt.question('New doctor access code: ')).trim();
    const again = (await prompt.question('Type it again: ')).trim();
    if (code !== again) {
      throw new Error('The two entries do not match.');
    }
    return code;
  } finally {
    prompt.close();
  }
}

const code = await readCode();
if (code.length < MIN_LENGTH) {
  console.error(`The code must be at least ${MIN_LENGTH} characters long.`);
  process.exit(1);
}

const env = loadEnv();
const database = createDatabase(env.DATABASE_URL);

try {
  await database.migrate();
  const codeHash = await hashSecret(code);
  const now = new Date();

  await database.db.transaction(async (tx) => {
    await tx
      .update(doctorAccessCodes)
      .set({ revokedAt: now })
      .where(isNull(doctorAccessCodes.revokedAt));
    await tx.insert(doctorAccessCodes).values({ codeHash, createdAt: now });
  });
  await recordAudit(database.db, {
    actorUserId: null,
    action: 'admin.doctor_code_rotated',
    at: now,
  });

  console.log('Doctor access code updated. Share it with faculty staff through a private channel.');
} finally {
  await database.close();
}
