import { Client } from 'pg';
import fs from 'fs';
import path from 'path';

async function setup() {
  const rootClient = new Client({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'password',
    database: 'postgres'
  });

  await rootClient.connect();
  await rootClient.query('DROP DATABASE IF EXISTS gym_platform_db');
  await rootClient.query("CREATE DATABASE gym_platform_db WITH ENCODING = 'UTF8' LC_COLLATE = 'C' LC_CTYPE = 'C' TEMPLATE = template0");
  console.log('✅ PostgreSQL: Created database gym_platform_db with UTF8 encoding');
  await rootClient.end();

  const appDb = new Client({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'password',
    database: 'gym_platform_db'
  });
  await appDb.connect();
  const v = await appDb.query('SELECT version()');
  console.log('✅ PostgreSQL Version:', v.rows[0].version);

  const initSql = fs.readFileSync(path.resolve('infra/init-db/01-init.sql'), 'utf8');
  await appDb.query(initSql);
  console.log('✅ PostgreSQL: 01-init.sql schema applied successfully');

  const seedSql = fs.readFileSync(path.resolve('infra/init-db/02-seed.sql'), 'utf8');
  await appDb.query(seedSql);
  console.log('✅ PostgreSQL: 02-seed.sql dataset loaded successfully');

  await appDb.end();
}

setup().catch((err) => {
  console.error('❌ Setup failed:', err);
  process.exit(1);
});
