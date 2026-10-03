const { Pool } = require('pg');

async function migrate() {
  const pgUrl = process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/gym_platform_db';
  const pool = new Pool({ connectionString: pgUrl });

  try {
    console.log('Connecting to PostgreSQL to apply Gender & Session migration...');
    await pool.query(`
      ALTER TABLE gyms 
      ADD COLUMN IF NOT EXISTS access_mode VARCHAR(20) NOT NULL DEFAULT 'MIXED' 
      CHECK (access_mode IN ('MALE_ONLY', 'FEMALE_ONLY', 'MIXED'));
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_gyms_access_mode ON gyms(access_mode);
    `);

    // Update existing gyms in PostgreSQL to have realistic access modes
    // 1. Basic (Caro) -> FEMALE_ONLY
    await pool.query(`
      UPDATE gyms SET access_mode = 'FEMALE_ONLY' 
      WHERE id = '10000000-0000-0000-0000-000000000001' OR name_fa LIKE '%کارو%';
    `);

    // 2. Plus (Setareh Vanak) -> MALE_ONLY
    await pool.query(`
      UPDATE gyms SET access_mode = 'MALE_ONLY' 
      WHERE id = '10000000-0000-0000-0000-000000000002' OR name_fa LIKE '%ستاره ونک%';
    `);

    // 3. Premium (Oxygen Royal) -> MIXED
    await pool.query(`
      UPDATE gyms SET access_mode = 'MIXED' 
      WHERE id = '10000000-0000-0000-0000-000000000003' OR name_fa LIKE '%اکسیژن رویال%';
    `);

    // 4. Elite (Espinas Palace) -> MIXED
    await pool.query(`
      UPDATE gyms SET access_mode = 'MIXED' 
      WHERE id = '10000000-0000-0000-0000-000000000004' OR name_fa LIKE '%اسپیناس%';
    `);

    const res = await pool.query('SELECT id, name_fa, tier, access_mode FROM gyms');
    console.log('Migrated gyms:', res.rows);
    console.log('✅ PostgreSQL Migration complete!');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
