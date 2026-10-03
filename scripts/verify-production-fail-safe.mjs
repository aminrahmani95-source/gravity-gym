// scripts/verify-production-fail-safe.mjs
// Verifies production fail-safe startup behavior when secrets or configuration are missing or insecure

import { spawn } from 'child_process';
import path from 'path';

function runWithEnv(envOverrides) {
  return new Promise((resolve) => {
    const env = {
      ...process.env,
      NODE_ENV: 'production',
      ...envOverrides,
    };

    const proc = spawn('node', ['apps/api/dist/src/main.js'], {
      cwd: path.resolve('.'),
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });

    // Allow process at most 4 seconds to crash or startup
    const timer = setTimeout(() => {
      proc.kill('SIGTERM');
      resolve({ exitCode: 0, stdout, stderr, timedOut: true });
    }, 4000);

    proc.on('close', (code) => {
      clearTimeout(timer);
      resolve({ exitCode: code, stdout, stderr, timedOut: false });
    });
  });
}

async function main() {
  console.log('================================================================');
  console.log('PRODUCTION CONFIGURATION & FAIL-SAFE STARTUP VERIFICATION');
  console.log('================================================================\n');

  let passedCount = 0;
  let totalTests = 0;

  function assertTest(name, condition, details = '') {
    totalTests++;
    if (condition) {
      console.log(`✅ PASS | ${name}`);
      passedCount++;
    } else {
      console.error(`❌ FAIL | ${name} - ${details}`);
    }
  }

  // First compile the API build to have dist ready
  console.log('Compiling NestJS API for production build test...');
  await new Promise((resolve, reject) => {
    const b = spawn('npm', ['--workspace=@gym-app/api', 'run', 'build'], { stdio: 'inherit', shell: true });
    b.on('close', (c) => c === 0 ? resolve(true) : reject(new Error('Build failed')));
  });

  // Test 1: Missing JWT_SECRET in production fails closed
  console.log('\n--- Test 1: Missing JWT_SECRET ---');
  const t1 = await runWithEnv({
    JWT_SECRET: '',
    QR_SIGNING_SECRET: 'a_very_secure_qr_secret_that_is_at_least_32_characters_long',
    DATABASE_URL: 'postgresql://postgres:postgres_secure_pass@localhost:5432/gym_platform_db',
    REDIS_URL: 'redis://localhost:6379',
    WEB_ORIGIN: 'https://gym.gravity.ir',
  });
  assertTest(
    'Fails safely when JWT_SECRET is missing',
    t1.exitCode !== 0 && (t1.stderr.includes('JWT_SECRET is not set') || t1.stdout.includes('JWT_SECRET is not set')),
    t1.stderr || t1.stdout
  );

  // Test 2: Insecure Dev Secret in production fails closed
  console.log('\n--- Test 2: Insecure Dev Secret in Production ---');
  const t2 = await runWithEnv({
    JWT_SECRET: 'super_secret_jwt_key_iranian_fitness_platform_2026_dev',
    QR_SIGNING_SECRET: 'a_very_secure_qr_secret_that_is_at_least_32_characters_long',
    DATABASE_URL: 'postgresql://postgres:postgres_secure_pass@localhost:5432/gym_platform_db',
    REDIS_URL: 'redis://localhost:6379',
    WEB_ORIGIN: 'https://gym.gravity.ir',
  });
  assertTest(
    'Fails safely when JWT_SECRET uses insecure dev fallback string',
    t2.exitCode !== 0 && (t2.stderr.includes('known insecure development fallback') || t2.stdout.includes('known insecure development fallback')),
    t2.stderr || t2.stdout
  );

  // Test 3: Short JWT_SECRET (< 32 chars) fails closed
  console.log('\n--- Test 3: Short JWT_SECRET ---');
  const t3 = await runWithEnv({
    JWT_SECRET: 'short_key_under_32_chars',
    QR_SIGNING_SECRET: 'a_very_secure_qr_secret_that_is_at_least_32_characters_long',
    DATABASE_URL: 'postgresql://postgres:postgres_secure_pass@localhost:5432/gym_platform_db',
    REDIS_URL: 'redis://localhost:6379',
    WEB_ORIGIN: 'https://gym.gravity.ir',
  });
  assertTest(
    'Fails safely when JWT_SECRET is shorter than 32 chars',
    t3.exitCode !== 0 && (t3.stderr.includes('at least 32 characters') || t3.stdout.includes('at least 32 characters')),
    t3.stderr || t3.stdout
  );

  // Test 4: Missing QR_SIGNING_SECRET fails closed
  console.log('\n--- Test 4: Missing QR_SIGNING_SECRET ---');
  const t4 = await runWithEnv({
    JWT_SECRET: 'a_very_secure_jwt_secret_that_is_at_least_32_characters_long',
    QR_SIGNING_SECRET: '',
    DATABASE_URL: 'postgresql://postgres:postgres_secure_pass@localhost:5432/gym_platform_db',
    REDIS_URL: 'redis://localhost:6379',
    WEB_ORIGIN: 'https://gym.gravity.ir',
  });
  assertTest(
    'Fails safely when QR_SIGNING_SECRET is missing',
    t4.exitCode !== 0 && (t4.stderr.includes('QR_SIGNING_SECRET is not set') || t4.stdout.includes('QR_SIGNING_SECRET is not set')),
    t4.stderr || t4.stdout
  );

  // Test 5: Missing DATABASE_URL fails closed
  console.log('\n--- Test 5: Missing DATABASE_URL ---');
  const t5 = await runWithEnv({
    JWT_SECRET: 'a_very_secure_jwt_secret_that_is_at_least_32_characters_long',
    QR_SIGNING_SECRET: 'a_very_secure_qr_secret_that_is_at_least_32_characters_long',
    DATABASE_URL: '',
    REDIS_URL: 'redis://localhost:6379',
    WEB_ORIGIN: 'https://gym.gravity.ir',
  });
  assertTest(
    'Fails safely when DATABASE_URL is missing',
    t5.exitCode !== 0 && (t5.stderr.includes('DATABASE_URL is not set') || t5.stdout.includes('DATABASE_URL is not set')),
    t5.stderr || t5.stdout
  );

  // Test 6: Missing REDIS_URL fails closed
  console.log('\n--- Test 6: Missing REDIS_URL ---');
  const t6 = await runWithEnv({
    JWT_SECRET: 'a_very_secure_jwt_secret_that_is_at_least_32_characters_long',
    QR_SIGNING_SECRET: 'a_very_secure_qr_secret_that_is_at_least_32_characters_long',
    DATABASE_URL: 'postgresql://postgres:postgres_secure_pass@localhost:5432/gym_platform_db',
    REDIS_URL: '',
    WEB_ORIGIN: 'https://gym.gravity.ir',
  });
  assertTest(
    'Fails safely when REDIS_URL is missing',
    t6.exitCode !== 0 && (t6.stderr.includes('REDIS_URL is not set') || t6.stdout.includes('REDIS_URL is not set')),
    t6.stderr || t6.stdout
  );

  // Test 7: Wildcard WEB_ORIGIN in production fails closed
  console.log('\n--- Test 7: Wildcard WEB_ORIGIN in Production ---');
  const t7 = await runWithEnv({
    JWT_SECRET: 'a_very_secure_jwt_secret_that_is_at_least_32_characters_long',
    QR_SIGNING_SECRET: 'a_very_secure_qr_secret_that_is_at_least_32_characters_long',
    DATABASE_URL: 'postgresql://postgres:postgres_secure_pass@localhost:5432/gym_platform_db',
    REDIS_URL: 'redis://localhost:6379',
    WEB_ORIGIN: '*',
  });
  assertTest(
    'Fails safely when WEB_ORIGIN uses wildcard in production',
    t7.exitCode !== 0 && (t7.stderr.includes('WEB_ORIGIN cannot be wildcard') || t7.stdout.includes('WEB_ORIGIN cannot be wildcard')),
    t7.stderr || t7.stdout
  );

  // Test 8: Valid production configuration boots successfully
  console.log('\n--- Test 8: Valid Production Configuration Startup ---');
  const t8 = await runWithEnv({
    PORT: '4005',
    JWT_SECRET: 'production_secure_jwt_secret_exceeding_32_chars_ok',
    QR_SIGNING_SECRET: 'production_secure_qr_signing_secret_exceeding_32_chars_ok',
    DATABASE_URL: 'postgresql://postgres:postgres_secure_pass@localhost:5432/gym_platform_db',
    REDIS_URL: 'redis://localhost:6379',
    WEB_ORIGIN: 'https://gym.gravity.ir',
  });
  assertTest(
    'Boots successfully with valid production configuration',
    t8.stdout.includes('Iranian Fitness Membership Platform API Server Active') || t8.timedOut,
    t8.stderr || t8.stdout
  );

  console.log(`\n================================================================`);
  console.log(`PRODUCTION FAIL-SAFE VERIFICATION: ${passedCount}/${totalTests} PASSED`);
  console.log(`================================================================`);

  if (passedCount !== totalTests) {
    throw new Error('Some production fail-safe tests failed!');
  }
}

main().catch(err => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
