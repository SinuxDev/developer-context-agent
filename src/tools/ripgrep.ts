import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { rgPath } from '@vscode/ripgrep';

const execFileAsync = promisify(execFile);

export function getRipgrepPath(): string {
  return rgPath;
}

export interface RipgrepResult {
  stdout: string;
  stderr: string;
}

export async function runRipgrep(
  args: string[],
  options?: { cwd?: string; maxBuffer?: number },
): Promise<RipgrepResult> {
  try {
    const { stdout, stderr } = await execFileAsync(rgPath, args, {
      cwd: options?.cwd,
      maxBuffer: options?.maxBuffer ?? 5 * 1024 * 1024,
    });
    return { stdout, stderr };
  } catch (err: unknown) {
    const execErr = err as { code?: number; stdout?: string; stderr?: string };
    if (execErr.code === 1) {
      return { stdout: execErr.stdout ?? '', stderr: execErr.stderr ?? '' };
    }
    throw err;
  }
}
