// @types/node is not a dependency of this workspace, so declare just what vite.config.ts uses.
declare module 'node:fs' {
  export function copyFileSync(from: string, to: string): void;
  export function mkdirSync(path: string, options?: { recursive?: boolean }): void;
  export function writeFileSync(path: string, data: string): void;
}
declare module 'node:path' {
  export function resolve(...parts: string[]): string;
}
interface ImportMeta {
  readonly dirname: string;
}
