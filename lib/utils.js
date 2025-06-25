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
    
    const lastNewline = remainingText.lastIndexOf('\n', sliceIndex);
    const lastSentence = remainingText.lastIndexOf('. ', sliceIndex);
    const lastSpace = remainingText.lastIndexOf(' ', sliceIndex);

    if (lastNewline > -1 && lastNewline > maxLength / 2) {
      sliceIndex = lastNewline;
    } else if (lastSentence > -1 && lastSentence > maxLength / 2) {
      sliceIndex = lastSentence + 1;
    } else if (lastSpace > -1 && lastSpace > maxLength / 2) {
      sliceIndex = lastSpace;
    }

    chunks.push(remainingText.substring(0, sliceIndex).trim());
    remainingText = remainingText.substring(sliceIndex).trim();
  }

  return chunks;
}