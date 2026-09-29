import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, type DatabaseConnection } from './client';
import { doctorProfiles, users } from './schema';

let connection: DatabaseConnection;

beforeAll(async () => {
  connection = createDatabase('pglite:memory');
  await connection.migrate();
});

afterAll(async () => {
  await connection.close();
});

describe('database schema', () => {
  it('stores and reads a user through the migrated schema', async () => {
    const [created] = await connection.db
      .insert(users)
      .values({ googleSubject: 'google-1', email: 'a@example.com', name: 'Amal' })
      .returning();

    expect(created?.role).toBeNull();
    expect(created?.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('enforces unique Google accounts', async () => {
    const insert = () =>
      connection.db
        .insert(users)
        .values({ googleSubject: 'google-2', email: 'b@example.com', name: 'Bassem' });

    await insert();
    await expect(insert()).rejects.toThrow();
  });

  it('keeps staff IDs and university emails unique across doctors', async () => {
    const [first, second] = await connection.db
      .insert(users)
      .values([
        { googleSubject: 'google-3', email: 'c@example.com', name: 'Dr. C' },
        { googleSubject: 'google-4', email: 'd@example.com', name: 'Dr. D' },
      ])
      .returning();
    if (!first || !second) {
      throw new Error('Seed users were not created');
    }

    await connection.db.insert(doctorProfiles).values({
      userId: first.id,
      staffId: 'ACU-1',
      displayName: 'Dr. C',
      universityEmail: 'c@acu.edu.eg',
    });

    await expect(
      connection.db.insert(doctorProfiles).values({
        userId: second.id,
        staffId: 'ACU-1',
        displayName: 'Dr. D',
        universityEmail: 'd@acu.edu.eg',
      }),
    ).rejects.toThrow();
  });

  it('removes a user’s profiles when the user is deleted', async () => {
    const [doctor] = await connection.db
      .select()
      .from(doctorProfiles)
      .where(eq(doctorProfiles.staffId, 'ACU-1'));
    if (!doctor) {
      throw new Error('Doctor profile missing');
    }

    await connection.db.delete(users).where(eq(users.id, doctor.userId));

    const remaining = await connection.db
      .select()
      .from(doctorProfiles)
      .where(eq(doctorProfiles.userId, doctor.userId));
    expect(remaining).toHaveLength(0);
  });
});
