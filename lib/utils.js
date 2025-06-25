import { createHash } from 'crypto';
import path from 'path';
import chalk from 'chalk';

/**
 * Encodes a file path to be URL- and tag-safe for NodeBB.
 * Replaces '/' with '__' and '.' with '_dot_'.
 * @param {string} filePath - The original file path (e.g., 'data/moves/move.asm').
 * @returns {string} The encoded path (e.g., 'data__moves__move_dot_asm').
 */
export function encodePath(filePath) {
  const normalizedPath = path.normalize(filePath).replace(/\\/g, '/');
  const dir = path.dirname(normalizedPath);
  const ext = path.extname(normalizedPath);
  const base = path.basename(normalizedPath, ext);

  // Reconstruct, replacing separators
  let encoded = normalizedPath
    .replace(/\//g, '__') // Replace slashes
    .replace(/\./g, '_dot_'); // Replace dots
    
  return encoded;
}

/**
 * Decodes a path back to its original format.
 * @param {string} encodedPath - The encoded path.
 * @returns {string} The original file path.
 */
export function decodePath(encodedPath) {
  return encodedPath
    .replace(/__/g, '/')
    .replace(/_dot_/g, '.');
}

/**
 * Calculates the SHA256 hash of a given content string.
 * @param {string|Buffer} content - The file content.
 * @returns {string} The SHA256 hash.
 */
export function calculateHash(content) {
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Splits a large string of text into chunks below a maxLength.
 * It tries to split intelligently at newlines, then sentences, then spaces
 * to avoid breaking words.
 * @param {string} text The full text to split.
 * @param {number} maxLength The maximum length of each chunk.
 * @returns {string[]} An array of text chunks.
 */
export function chunkText(text, maxLength = 32768) {
  if (text.length <= maxLength) {
    return [text];
  }

  const chunks = [];
  let remainingText = text;

  while (remainingText.length > 0) {
    if (remainingText.length <= maxLength) {
      chunks.push(remainingText);
      break;
    }

    let sliceIndex = maxLength;
    
    // Try to find a natural breaking point from the end of the potential chunk
    const lastNewline = remainingText.lastIndexOf('\n', sliceIndex);
    const lastSentence = remainingText.lastIndexOf('. ', sliceIndex);
    const lastSpace = remainingText.lastIndexOf(' ', sliceIndex);

    if (lastNewline > -1 && lastNewline > maxLength / 2) {
      sliceIndex = lastNewline;
    } else if (lastSentence > -1 && lastSentence > maxLength / 2) {
      sliceIndex = lastSentence + 1; // Include the period and space
    } else if (lastSpace > -1 && lastSpace > maxLength / 2) {
      sliceIndex = lastSpace;
    }

    chunks.push(remainingText.substring(0, sliceIndex).trim());
    remainingText = remainingText.substring(sliceIndex).trim();
  }

  return chunks;
}

/**
 * Generates a Markdown Table of Contents from a list of topic entries.
 * @param {Array<object>} tocEntries - Array of {filePath, title, tid, slug}.
 * @param {object} config - The application config object.
 * @returns {string} The formatted Markdown string.
 */
export function generateTocMarkdown(tocEntries, config) {
  console.log(chalk.blue('Generating Table of Contents Markdown...'));
  
  // Start with the user-defined header
  let markdown = `${config.toc_header_content}\n\n---\n\n`;

  // Sort entries alphabetically by their original file path
  const sortedEntries = tocEntries.sort((a, b) => a.filePath.localeCompare(b.filePath));

  for (const entry of sortedEntries) {
    // e.g., * [adomgb-ascii.txt](/topic/9765/adomgb-ascii-txt)
    markdown += `* [${entry.title}](${config.nodebb_url}/topic/${entry.tid}/${entry.slug})\n`;
  }

  return markdown;
}