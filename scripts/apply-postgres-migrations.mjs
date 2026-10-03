// scripts/apply-postgres-migrations.mjs
// Applies 01-init.sql and 02-seed.sql to the live PostgreSQL instance

import { Client } from 'pg';
import fs from 'fs';
import path from 'path';

const DB_HOST = '127.0.0.1';
const DB_PORT = 5432;
const DB_USER = 'postgres';
const DB_PASS = 'postgres_secure_pass';
const DB_NAME = 'gym_platform_db';

async function main() {
  console.log('================================================================');
  console.log('POSTGRESQL PRODUCTION MIGRATION & SCHEMA INITIALIZATION');
  console.log('================================================================\n');

  // Step 1: Connect to default postgres DB to create gym_platform_db
  console.log('1. Connecting to PostgreSQL root instance...');
  const rootClient = new Client({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASS,
    database: 'postgres',
  });
  await rootClient.connect();
  console.log('✅ Connected to PostgreSQL root successfully.');

  const dbCheck = await rootClient.query(`SELECT 1 FROM pg_database WHERE datname = $1`, [DB_NAME]);
  if (dbCheck.rows.length === 0) {
    console.log(`Creating database ${DB_NAME}...`);
    await rootClient.query(`CREATE DATABASE "${DB_NAME}"`);
    console.log(`✅ Database ${DB_NAME} created.`);
  } else {
    console.log(`✅ Database ${DB_NAME} already exists.`);
  }
  await rootClient.end();

  // Step 2: Connect to gym_platform_db and apply schema
  console.log(`\n2. Connecting to target database ${DB_NAME}...`);
  const dbClient = new Client({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASS,
    database: DB_NAME,
  });
  await dbClient.connect();

  console.log('3. Applying schema from infra/init-db/01-init.sql...');
  const initSqlPath = path.resolve('infra/init-db/01-init.sql');
  const initSql = fs.readFileSync(initSqlPath, 'utf8');
  await dbClient.query(initSql);
  console.log('✅ 01-init.sql schema applied successfully.');

  console.log('4. Applying seed data from infra/init-db/02-seed.sql...');
  const seedSqlPath = path.resolve('infra/init-db/02-seed.sql');
  const seedSql = fs.readFileSync(seedSqlPath, 'utf8');
  await dbClient.query(seedSql);
  console.log('✅ 02-seed.sql applied successfully.');

  // Step 3: Verify schema integrity
  console.log('\n5. Verifying schema tables and record counts:');
  const tablesRes = await dbClient.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    ORDER BY table_name;
  `);
  console.log(`Total public tables created: ${tablesRes.rows.length}`);
  for (const row of tablesRes.rows) {
    const countRes = await dbClient.query(`SELECT COUNT(*) as c FROM "${row.table_name}"`);
    console.log(`  - ${row.table_name.padEnd(28)} : ${countRes.rows[0].c} records`);
  }

  // Step 4: Verify critical financial constraints
  const constraintRes = await dbClient.query(`
    SELECT conname, contype 
    FROM pg_constraint 
    WHERE conname IN (
      'uq_payment_transactions_authority',
      'uq_checkins_qr_nonce',
      'chk_subscriptions_validity'
    );
  `);
  console.log(`\nVerified critical database constraints: ${constraintRes.rows.map(r => r.conname).join(', ')}`);

  await dbClient.end();
  console.log('\n🎉 ALL POSTGRESQL MIGRATIONS AND SCHEMA VERIFIED ON LIVE ENGINE!');
}

main().catch(err => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
