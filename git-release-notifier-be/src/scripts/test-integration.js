import { execSync } from 'child_process';

function runCommand(command) {
  try {
    execSync(command, { stdio: 'inherit' });
    return true;
  } catch (e) {
    return false;
  }
}

async function main() {
  runCommand('docker-compose up -d db-test');

  let testsPassed = false;
  try {
    const pushSuccess = runCommand('npx dotenv-cli -e .env.test -- npx prisma db push');

    if (!pushSuccess) {
      throw new Error('Prisma push failed');
    }

    testsPassed = runCommand(
      'npx dotenv-cli -e .env.test -- vitest run --config vitest.integration.config.ts',
    );
  } catch (error) {
    console.error('\nПомилка під час підготовки або виконання тестів:', error.message);
  } finally {
    runCommand('docker-compose stop db-test');

    process.exit(testsPassed ? 0 : 1);
  }
}

main();
