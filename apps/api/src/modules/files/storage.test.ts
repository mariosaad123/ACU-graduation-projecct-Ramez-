import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestContext, type TestContext } from '../../test/harness';
import { DatabaseStorage } from './storage';

let context: TestContext;
let storage: DatabaseStorage;

beforeAll(async () => {
  context = await createTestContext();
  storage = new DatabaseStorage(context.database.db);
});

afterAll(async () => {
  await context.close();
});

describe('keeping uploads in the database', () => {
  it('stores, reads back byte for byte, and removes', async () => {
    const key = `${randomUUID()}.webp`;
    const bytes = Buffer.from([0, 255, 1, 128, 82, 73, 70, 70]);

    await storage.put(key, bytes);
    const read = await storage.read(key);

    expect(Buffer.isBuffer(read)).toBe(true);
    expect(read?.equals(bytes)).toBe(true);
    await storage.remove(key);
    expect(await storage.read(key)).toBeNull();
  });

  it('never overwrites a file already stored under a key', async () => {
    const key = `${randomUUID()}.pdf`;
    await storage.put(key, Buffer.from('first'));

    await expect(storage.put(key, Buffer.from('second'))).rejects.toThrow();
    expect((await storage.read(key))?.toString()).toBe('first');
  });

  it('refuses keys it did not make', async () => {
    await expect(storage.read('../../etc/passwd')).rejects.toThrow(/unexpected storage key/);
  });
});
