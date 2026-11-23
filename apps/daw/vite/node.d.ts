// @types/node is not a dependency of this workspace, so declare just what the vite/ plugins use.
declare module 'node:fs' {
  export interface Stats {
    isFile(): boolean;
    size: number;
  }
  export function existsSync(path: string): boolean;
  export interface Dirent {
    name: string;
    isFile(): boolean;
    isDirectory(): boolean;
  }
  export function readFileSync(path: string, encoding: 'utf8'): string;
  export function readFileSync(path: string): Uint8Array;
  export function readdirSync(path: string): string[];
  export function readdirSync(path: string, options: { withFileTypes: true }): Dirent[];
  export function statSync(path: string): Stats;
  export function mkdirSync(path: string, options?: { recursive?: boolean }): void;
  export function mkdtempSync(prefix: string): string;
  export function rmSync(path: string, options?: { recursive?: boolean; force?: boolean }): void;
  export function writeFileSync(path: string, data: string | Uint8Array): void;
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
declare module 'node:crypto' {
  export function createHash(alg: 'sha256'): {
    update(data: Uint8Array): { digest(enc: 'hex'): string };
  };
}
declare module 'node:os' {
  export function tmpdir(): string;
}
interface ImportMeta {
  readonly dirname: string;
}
