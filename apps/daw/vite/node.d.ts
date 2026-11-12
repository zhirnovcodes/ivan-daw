// @types/node is not a dependency of this workspace, so declare just what plugins-catalog.ts uses.
declare module 'node:fs' {
  export interface Stats {
    isFile(): boolean;
    size: number;
  }
  export function existsSync(path: string): boolean;
  export function readFileSync(path: string, encoding: 'utf8'): string;
  export function readdirSync(path: string): string[];
  export function statSync(path: string): Stats;
  export function mkdirSync(path: string, options?: { recursive?: boolean }): void;
  export function mkdtempSync(prefix: string): string;
  export function rmSync(path: string, options?: { recursive?: boolean; force?: boolean }): void;
  export function writeFileSync(path: string, data: string): void;
  export function createReadStream(path: string): { pipe(res: unknown): unknown };
}
declare module 'node:path' {
  export const sep: string;
  export function join(...parts: string[]): string;
  export function resolve(...parts: string[]): string;
  export function extname(path: string): string;
}
declare module 'node:child_process' {
  export interface ChildProcess {
    kill(signal?: string): boolean;
    on(event: 'exit', listener: (code: number | null) => void): ChildProcess;
    on(event: 'error', listener: (err: Error) => void): ChildProcess;
  }
  export function spawn(
    command: string,
    args: string[],
    options: { cwd: string; stdio: 'inherit' },
  ): ChildProcess;
}
interface ImportMeta {
  readonly dirname: string;
}
