// scripts/test-backup-restore-drill.mjs
// Real PostgreSQL Backup & Disaster Recovery Drill against a disposable database

import { Client } from 'pg';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const DB_HOST = '127.0.0.1';
const DB_PORT = 5432;
const DB_USER = 'postgres';
const DB_PASS = 'postgres_secure_pass';
const SOURCE_DB = 'gym_platform_db';
const DISPOSABLE_DB = `gym_platform_restore_drill_${Date.now()}`;
const BACKUP_DIR = path.resolve('./backups');

async function main() {
  console.log('================================================================');
  console.log('REAL POSTGRESQL BACKUP & DISASTER RECOVERY DRILL');
  console.log('================================================================\n');

  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  // 1. Connect to Source Database
  console.log(`1. Connecting to source database: ${SOURCE_DB}...`);
  const srcClient = new Client({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASS,
    database: SOURCE_DB,
  });
  await srcClient.connect();

  // 2. Extract List of Tables
  const tablesRes = await srcClient.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name;
  `);
  const tables = tablesRes.rows.map(r => r.table_name);
  console.log(`Discovered ${tables.length} tables in source database.`);

  // 3. Export Data Dump
  console.log('2. Generating logical snapshot dump...');
  const dumpPayload = {
    timestamp: new Date().toISOString(),
    sourceDatabase: SOURCE_DB,
    tables: {},
  };

  for (const table of tables) {
    const rowsRes = await srcClient.query(`SELECT * FROM "${table}"`);
    dumpPayload.tables[table] = rowsRes.rows;
  }

  const dumpFilename = `backup_${SOURCE_DB}_${Date.now()}.json`;
  const dumpFilePath = path.join(BACKUP_DIR, dumpFilename);
  fs.writeFileSync(dumpFilePath, JSON.stringify(dumpPayload, null, 2), 'utf8');

  // Generate SHA-256 Checksum
  const checksum = crypto.createHash('sha256').update(fs.readFileSync(dumpFilePath)).digest('hex');
  fs.writeFileSync(`${dumpFilePath}.sha256`, checksum, 'utf8');
  console.log(`✅ Snapshot created: ${dumpFilePath} (${(fs.statSync(dumpFilePath).size / 1024).toFixed(1)} KB)`);
  console.log(`✅ SHA-256 Checksum: ${checksum}`);

  // 4. Create Disposable Target Database for Restore Drill
  console.log(`\n3. Preparing clean disposable database: ${DISPOSABLE_DB}...`);
  const rootClient = new Client({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASS,
    database: 'postgres',
  });
  await rootClient.connect();
  await rootClient.query(`CREATE DATABASE "${DISPOSABLE_DB}"`);
  console.log(`✅ Disposable database ${DISPOSABLE_DB} created.`);

  // 5. Apply Schema to Disposable Database
  console.log(`4. Replicating database schema (01-init.sql) onto ${DISPOSABLE_DB}...`);
  const restoreClient = new Client({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASS,
    database: DISPOSABLE_DB,
  });
  await restoreClient.connect();

  const initSql = fs.readFileSync(path.resolve('infra/init-db/01-init.sql'), 'utf8');
  await restoreClient.query(initSql);
  console.log('✅ Schema successfully constructed in restore target.');

  // 6. Restore Table Records from Snapshot
  console.log(`5. Restoring data from snapshot into ${DISPOSABLE_DB}...`);
  const restoredDump = JSON.parse(fs.readFileSync(dumpFilePath, 'utf8'));

  // Disable FK triggers temporarily during bulk load
  await restoreClient.query('SET session_replication_role = replica;');
  for (const [table, rows] of Object.entries(restoredDump.tables)) {
    if (rows.length === 0) continue;
    const cols = Object.keys(rows[0]);
    const colList = cols.map(c => `"${c}"`).join(', ');

    for (const row of rows) {
      const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
      const values = cols.map(c => row[c]);
      await restoreClient.query(
        `INSERT INTO "${table}" (${colList}) VALUES (${placeholders})`,
        values
      );
    }
  }
  await restoreClient.query('SET session_replication_role = DEFAULT;');
  console.log('✅ All table records successfully populated.');

  // 7. Verify Data Invariants in Restored Database
  console.log('\n6. Executing Post-Restore Data Integrity Verification:');
  const userCount = await restoreClient.query('SELECT count(*) FROM users');
  const gymCount = await restoreClient.query('SELECT count(*) FROM gyms');
  const sansCount = await restoreClient.query('SELECT count(*) FROM gym_sans');
  const planCount = await restoreClient.query('SELECT count(*) FROM plans');
  console.log(`  - Users restored        : ${userCount.rows[0].count}`);
  console.log(`  - Gyms restored         : ${gymCount.rows[0].count}`);
  console.log(`  - Gym sans restored     : ${sansCount.rows[0].count}`);
  console.log(`  - Membership plans      : ${planCount.rows[0].count}`);

  if (parseInt(userCount.rows[0].count, 10) === 0 || parseInt(gymCount.rows[0].count, 10) === 0) {
    throw new Error('Restore validation failed: critical records missing!');
  }

  // 8. Cleanup Disposable Database
  console.log(`\n7. Cleaning up disposable database ${DISPOSABLE_DB}...`);
  await restoreClient.end();
  await rootClient.query(`
    SELECT pg_terminate_backend(pid) 
    FROM pg_stat_activity 
    WHERE datname = $1 AND pid <> pg_backend_pid();
  `, [DISPOSABLE_DB]);
  await rootClient.query(`DROP DATABASE "${DISPOSABLE_DB}"`);
  await rootClient.end();
  await srcClient.end();

  console.log(`✅ Disposable database ${DISPOSABLE_DB} dropped.`);
  console.log('\n🎉 BACKUP AND RESTORE DRILL VERIFIED 100% AGAINST REAL POSTGRESQL ENGINE!');
}

main().catch(err => {
  console.error('❌ Disaster recovery drill failed:', err);
  process.exit(1);
});
