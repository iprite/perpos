/**
 * System Prompt Loader — versioned prompts from src/lib/ai/prompts/
 *
 * ห้าม hardcode system prompt ใน .ts files
 * ให้เก็บใน prompts/<agent>.v<N>.txt เสมอ
 *
 * Usage:
 *   const systemPrompt = await loadPrompt('task-parser');        // latest
 *   const systemPrompt = await loadPrompt('task-parser', 'v1');  // specific version
 *
 * See docs/claude.md §5 for prompt versioning guide.
 */

import fs   from 'fs/promises';
import path from 'path';

const PROMPT_DIR = path.join(process.cwd(), 'src/lib/ai/prompts');

/** Load the latest (or specific) version of a system prompt */
export async function loadPrompt(agent: string, version?: string): Promise<string> {
  if (version) {
    const v = version.startsWith('v') ? version : `v${version}`;
    return readPromptFile(agent, v);
  }

  // Find highest version number
  let files: string[];
  try {
    files = await fs.readdir(PROMPT_DIR);
  } catch {
    throw new Error(`Prompt directory not found: ${PROMPT_DIR}`);
  }

  const versions = files
    .filter((f) => f.startsWith(`${agent}.v`) && f.endsWith('.txt'))
    .map((f) => {
      const match = f.match(/\.v(\d+)\.txt$/);
      return match ? parseInt(match[1], 10) : 0;
    })
    .filter((n) => n > 0)
    .sort((a, b) => b - a);

  if (versions.length === 0) {
    throw new Error(`No prompt file found for agent: ${agent}. Create src/lib/ai/prompts/${agent}.v1.txt`);
  }

  return readPromptFile(agent, `v${versions[0]}`);
}

async function readPromptFile(agent: string, version: string): Promise<string> {
  const filePath = path.join(PROMPT_DIR, `${agent}.${version}.txt`);
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return content.trim();
  } catch {
    throw new Error(`Prompt file not found: ${filePath}`);
  }
}
