// Which project the page opens: projects/demo.json, or projects/<name>.json with ?project=<name>
// (lowercase letters, digits and dashes only). The v1 sine scene is ?project=sine.

export const DEMO = 'demo';

export function projectPath(search: string): string {
  const name = new URLSearchParams(search).get('project') ?? DEMO;
  return `projects/${/^[a-z0-9-]+$/.test(name) ? name : DEMO}.json`;
}
