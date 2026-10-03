// scripts/run-embedded-postgres.mjs
// Runs a persistent local PostgreSQL 18 instance using embedded-postgres binaries

import EmbeddedPostgres from 'embedded-postgres';
import path from 'path';
import fs from 'fs';

const dataDir = path.resolve('./.embedded_postgres_data');
const isFirstInit = !fs.existsSync(dataDir);

const pg = new EmbeddedPostgres({
  port: 5432,
  databaseDir: dataDir,
  user: 'postgres',
  password: 'postgres_secure_pass',
  persistent: true,
  initdbFlags: ['-E', 'UTF8', '--locale=C'],
});

async function main() {
  if (isFirstInit) {
    console.log('[PG] Initializing local PostgreSQL 18 database cluster...');
    await pg.initialise();
  }
  
  console.log('[PG] Starting PostgreSQL 18 server on port 5432...');
  await pg.start();
  console.log('EMBEDDED_POSTGRES_READY_PORT_5432');

  // Handle graceful shutdown
  const shutdown = async () => {
    console.log('[PG] Stopping PostgreSQL server...');
    await pg.stop().catch(() => {});
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Keep alive
  setInterval(() => {}, 60000);
}

main().catch(err => {
  console.error('[PG] Fatal error starting PostgreSQL:', err);
  process.exit(1);
});
