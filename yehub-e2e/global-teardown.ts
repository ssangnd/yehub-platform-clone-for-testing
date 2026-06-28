import { execSync } from 'child_process';

export default function globalTeardown() {
  try {
    execSync('docker compose down', { stdio: 'inherit' });
  } catch {
    // Ignore errors if containers are already stopped
  }
}
