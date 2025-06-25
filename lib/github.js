import axios from 'axios';
import * as tar from 'tar';
import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';

const TEMP_DIR = path.join(process.cwd(), 'temp-repo-download');

/**
 * Fetches the contents of a GitHub repository.
 * @param {string} repoUrl - The URL of the GitHub repository.
 * @param {string[]} ignoredPaths - An array of paths to ignore.
 * @returns {Promise<Array<{filePath: string, content: Buffer}>>} A list of file objects.
 */
export async function fetchRepoContents(repoUrl, ignoredPaths = []) {
  console.log(chalk.blue(`Fetching repository from: ${repoUrl}`));

  const urlParts = new URL(repoUrl).pathname.split('/').filter(Boolean);
  const [owner, repo] = urlParts;

  if (!owner || !repo) {
    throw new Error('Invalid GitHub repository URL.');
  }
  
  // We'll use the main branch by default. In a future version, this could be an option.
  const tarballUrl = `https://api.github.com/repos/${owner}/${repo}/tarball/master`;

  await fs.ensureDir(TEMP_DIR);

  try {
    // Download the tarball
    const response = await axios({
      method: 'get',
      url: tarballUrl,
      responseType: 'stream',
    });

    // Extract the tarball
    await new Promise((resolve, reject) => {
      response.data.pipe(
        tar.x({
          strip: 1, // Remove the top-level directory from the extracted files
          C: TEMP_DIR, // Change to the temporary directory
        })
      ).on('finish', resolve).on('error', reject);
    });
    
    console.log(chalk.green('Repository downloaded and extracted successfully.'));

    // Read files recursively
    const allFiles = await getFilesInDir(TEMP_DIR, ignoredPaths);
    
    // Read content for each file
    const fileContents = await Promise.all(
      allFiles.map(async (filePath) => {
        const content = await fs.readFile(filePath);
        // We want the relative path from the repo root, not the temp dir
        const relativePath = path.relative(TEMP_DIR, filePath); 
        return { filePath: relativePath, content };
      })
    );
    
    return fileContents;

  } finally {
    // Cleanup the temporary directory
    await fs.remove(TEMP_DIR);
    console.log(chalk.gray('Temporary directory cleaned up.'));
  }
}

/**
 * Recursively gets all file paths in a directory.
 * @param {string} dirPath - The directory to scan.
 * @param {string[]} ignoredPaths - Paths to ignore.
 * @param {string} originalPath - The original root path for comparison.
 * @returns {Promise<string[]>} An array of full file paths.
 */
async function getFilesInDir(dirPath, ignoredPaths, originalPath = dirPath) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    const relativePath = path.relative(originalPath, fullPath);
    
    if (ignoredPaths.includes(relativePath)) {
      continue;
    }

    if (entry.isDirectory()) {
      files.push(...await getFilesInDir(fullPath, ignoredPaths, originalPath));
    } else {
      files.push(fullPath);
    }
  }

  return files;
}