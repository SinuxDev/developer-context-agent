import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

export type DrizzleDb = ReturnType<typeof drizzle>;
export type PostgresClient = postgres.Sql;

export interface Database {
  db: DrizzleDb;
  client: PostgresClient;
}

export function createDb(databaseUrl: string): Database {
  const client = postgres(databaseUrl, { max: 10 });
  const db = drizzle(client, { schema });
  return { db, client };
}

export async function checkDbConnection(client: postgres.Sql): Promise<boolean> {
  try {
    await client`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}
