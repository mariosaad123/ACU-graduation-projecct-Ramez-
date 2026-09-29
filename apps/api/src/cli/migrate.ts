import { loadEnv } from '../config/env';
import { createDatabase } from '../db/client';

const env = loadEnv();
const database = createDatabase(env.DATABASE_URL);

try {
  await database.migrate();
  console.log('Database is up to date.');
} finally {
  await database.close();
}
