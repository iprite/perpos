import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

const CONFIG_FILE = 'recommended-skills.json';
const CACHE_DIR = path.resolve('.skills');
const TEMP_REPO_DIR = path.join(CACHE_DIR, 'mercury-agent-skills-repo');

// Resolve the active agent skill paths
const HOME_DIR = os.homedir();
const GLOBAL_SKILLS_PATH = path.join(HOME_DIR, '.gemini/config/skills');
const SESSION_SKILLS_PATH = path.join(HOME_DIR, '.gemini/antigravity-ide/skills');

function log(msg) {
  console.log(`[Skills Manager] ${msg}`);
}

function runCommand(cmd, cwd = process.cwd()) {
  try {
    execSync(cmd, { cwd, stdio: 'inherit' });
  } catch (error) {
    console.error(`Error running command: ${cmd}`, error);
    throw error;
  }
}

async function main() {
  if (!fs.existsSync(CONFIG_FILE)) {
    console.error(`Error: Configuration file ${CONFIG_FILE} not found!`);
    process.exit(1);
  }

  const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  const repoUrl = config.repository || 'https://github.com/cosmicstack-labs/mercury-agent-skills';
  
  log(`Ensuring cache directory exists: ${CACHE_DIR}`);
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }

  // Clone or Pull the mercury-agent-skills repository
  if (!fs.existsSync(TEMP_REPO_DIR)) {
    log(`Cloning repository ${repoUrl}...`);
    runCommand(`git clone --depth 1 ${repoUrl} ${TEMP_REPO_DIR}`);
  } else {
    log(`Updating local repository cache...`);
    try {
      runCommand(`git pull`, TEMP_REPO_DIR);
    } catch (e) {
      log('Pull failed, attempting to re-clone...');
      fs.rmSync(TEMP_REPO_DIR, { recursive: true, force: true });
      runCommand(`git clone --depth 1 ${repoUrl} ${TEMP_REPO_DIR}`);
    }
  }

  // Determine active skills installation directories
  // We will deploy to BOTH active paths to make sure they are picked up in any IDE/Gemini agent setup
  const targetPaths = [GLOBAL_SKILLS_PATH, SESSION_SKILLS_PATH];

  for (const targetPath of targetPaths) {
    log(`Checking target skills path: ${targetPath}`);
    try {
      if (!fs.existsSync(targetPath)) {
        fs.mkdirSync(targetPath, { recursive: true });
      }

      for (const skill of config.skills) {
        const { category, slug } = skill;
        const sourceDir = path.join(TEMP_REPO_DIR, 'categories', category, slug);
        const targetDir = path.join(targetPath, category, slug);

        if (!fs.existsSync(sourceDir)) {
          console.warn(`Warning: Skill folder not found in repo: ${category}/${slug}`);
          continue;
        }

        log(`Installing ${category}/${slug} into ${targetPath}...`);
        if (fs.existsSync(targetDir)) {
          fs.rmSync(targetDir, { recursive: true, force: true });
        }
        fs.mkdirSync(targetDir, { recursive: true });

        // Copy directories recursively
        fs.cpSync(sourceDir, targetDir, { recursive: true });
        log(`Successfully installed ${category}/${slug}`);
      }
    } catch (err) {
      console.warn(`Warning: Could not write to ${targetPath}. Please verify permission grants.`, err.message);
    }
  }

  log('All recommended skills have been successfully processed!');
}

main().catch(err => {
  console.error('Skills installation failed:', err);
  process.exit(1);
});
