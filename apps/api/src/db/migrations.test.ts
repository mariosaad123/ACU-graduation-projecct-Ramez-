import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Upgrades a database that already holds data, one migration at a time, the way a deployed
 * database is upgraded. A fresh database (what the other tests use) cannot catch a migration that
 * loses or breaks existing rows.
 */
const MIGRATIONS = path.resolve(process.cwd(), 'drizzle');

function migration(tag: string): string {
  return readFileSync(path.join(MIGRATIONS, `${tag}.sql`), 'utf8');
}

let client: PGlite;

beforeAll(async () => {
  client = new PGlite();
  await client.exec(migration('0000_initial_schema'));
  await client.exec(`
    INSERT INTO users (id, google_subject, email, name, role) VALUES
      ('00000000-0000-4000-8000-000000000001', 'google-a', 'a@example.com', 'Student A', 'student'),
      ('00000000-0000-4000-8000-000000000002', 'google-b', 'b@example.com', 'Student B', 'student');
    INSERT INTO student_profiles (user_id, learning_language, goal, created_at) VALUES
      ('00000000-0000-4000-8000-000000000001', 'fr', 'travel', '2026-09-01T10:00:00Z'),
      ('00000000-0000-4000-8000-000000000002', 'ja', 'study', '2026-09-02T10:00:00Z');
  `);
  await client.exec(migration('0001_student_languages'));
});

afterAll(async () => {
  await client.close();
});

describe('0001_student_languages', () => {
  it('moves each student’s language into their list of languages', async () => {
    const { rows } = await client.query<{ user_id: string; language: string; enrolled_at: Date }>(
      'SELECT user_id, language, enrolled_at FROM student_languages ORDER BY user_id',
    );

    expect(rows).toEqual([
      {
        user_id: '00000000-0000-4000-8000-000000000001',
        language: 'fr',
        enrolled_at: new Date('2026-09-01T10:00:00Z'),
      },
      {
        user_id: '00000000-0000-4000-8000-000000000002',
        language: 'ja',
        enrolled_at: new Date('2026-09-02T10:00:00Z'),
      },
    ]);
  });

  it('keeps that language as the active one', async () => {
    const { rows } = await client.query<{ active_language: string; goal: string }>(
      'SELECT active_language, goal FROM student_profiles ORDER BY user_id',
    );

    expect(rows).toEqual([
      { active_language: 'fr', goal: 'travel' },
      { active_language: 'ja', goal: 'study' },
    ]);
  });

  it('only lets a profile point at a language the student has', async () => {
    await expect(
      client.query(
        `UPDATE student_profiles SET active_language = 'de'
         WHERE user_id = '00000000-0000-4000-8000-000000000001'`,
      ),
    ).rejects.toThrow(/student_profiles_active_language_fk/);
  });
});
