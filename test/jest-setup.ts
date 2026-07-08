import { execSync } from 'child_process';
import * as dotenv from 'dotenv';
import * as path from 'path';

export default () => {
  // Load configuration priorities directly targeting test properties
  dotenv.config({ path: path.resolve(__dirname, '../.env.test') });

  console.log('\n🚀 Initializing E2E Test Ephemeral Database Schema...');

  try {
    // Run migrations deterministically against your designated test database instance
    execSync('npx prisma migrate deploy', { stdio: 'inherit' });
    console.log('✅ Test schema setup successfully migrated.\n');
  } catch (error) {
    console.error('❌ Database migration deployment failed during test setup:', error);
    process.exit(1);
  }
};
