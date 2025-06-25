import { createHash } from 'crypto';
import path from 'path';

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