import { createHash } from 'crypto';
import path from 'path';
import fs from 'fs-extra';
import chalk from 'chalk';

/**
 * Calculates the SHA256 hash of a given content string.
 * @param {string|Buffer} content - The file content.
 * @returns {string} The SHA256 hash.
 */
export function calculateHash(content) {
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Creates a sanitized, "safe" tag from a filename.
 * Replaces dots and other special characters with a hyphen.
 * @param {string} filename - The original filename (e.g., 'file-name.md').
 * @returns {string} The sanitized tag (e.g., 'file-name-md').
 */
export function createFilenameTag(filename) {
    return filename.toLowerCase().replace(/[^a-z0-9_]/g, '-');
}

/**
 * Generates a Markdown Table of Contents from a list of topic entries.
 * @param {Array<object>} tocEntries - Array of {filePath, title, tid, slug}.
 * @param {object} config - The application config object.
 * @returns {string} The formatted Markdown string.
 */
export function generateTocMarkdown(tocEntries, config) {
  console.log(chalk.blue('Generating Table of Contents Markdown...'));
  
  let markdown = `${config.toc_header_content}\n\n---\n\n`;

  const sortedEntries = tocEntries.sort((a, b) => a.filePath.localeCompare(b.filePath));

  for (const entry of sortedEntries) {
    markdown += `* [${entry.title}](${config.nodebb_url}/topic/${entry.slug})\n`;
  }

  return markdown;
}