// Applies pending migrations to DATABASE_URL: node packages/db/src/run-migrations.ts
import { createPool } from "./client.ts";
import { migrate } from "./migrate.ts";

const pool = createPool();
try {
  const ran = await migrate(pool);
  console.log(ran.length === 0 ? "No pending migrations" : `Applied: ${ran.join(", ")}`);
} finally {
  await pool.end();
}
