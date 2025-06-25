#!/usr/bin/env node

import { program } from 'commander';
import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';

import * as github from './lib/github.js';
import * as nodebb from './lib/nodebb.js';
import * as utils from './lib/utils.js';

program
  .name('umber-cli')
  .description('A CLI tool for managing canonical data between GitHub and NodeBB');

program
  .command('import')
  .description('Import files from a GitHub repository into NodeBB')
  .option('--repo <url>', 'The URL of the GitHub repository to import')
  .action(async (options) => {
    console.log(chalk.bold.magenta('--- Starting Umber CLI Importer ---'));

    // --- 1. Configuration & Initialization ---
    const configPath = path.join(process.cwd(), 'config.json');
    if (!fs.existsSync(configPath)) {
      console.error(chalk.red('Error: config.json not found. Please copy config.json.example and fill it out.'));
      process.exit(1);
    }
    const config = await fs.readJson(configPath);
    nodebb.init(config); // Initialize the NodeBB API client
    
    const repoUrl = options.repo || config.target_repo_url;
    
    if (!repoUrl) {
      console.error(chalk.red('Error: Repository URL must be provided via --repo option or in config.json.'));
      process.exit(1);
    }

    try {
      // --- 2. Fetch Files from GitHub ---
      const files = await github.fetchRepoContents(repoUrl, config.ignored_paths);
      console.log(chalk.magenta(`\nFound ${files.length} files to process.`));
      
      // --- 3. Process Each File ---
      for (const file of files) {
        // Using path.normalize to handle Windows backslashes
        const normalizedFilePath = path.normalize(file.filePath);
        console.log(`\nProcessing: ${chalk.bold(normalizedFilePath)}`);
        
        const contentStr = file.content.toString('utf-8');
        const hash = utils.calculateHash(contentStr);
        const encodedPath = utils.encodePath(normalizedFilePath);
        const fileExtension = path.extname(normalizedFilePath);
        const fileName = path.basename(normalizedFilePath);

        // --- 4. Check for Existing Topic ---
        const existingTopic = await nodebb.findTopicByMetadata(encodedPath);

        if (existingTopic) {
          if (existingTopic.customData.contentHash !== hash) {
            // Update existing topic if hash is different
            await nodebb.updateTopic(existingTopic.tid, existingTopic.mainPid, { 
                content: contentStr,
                customData: {
                    ...existingTopic.customData, // Preserve old metadata
                    contentHash: hash // Update the hash
                }
            });
          } else {
            console.log(chalk.gray('Content is unchanged. Skipping.'));
          }
        } else {
          // --- 5. Create New Topic ---
          const categoryPath = path.dirname(normalizedFilePath);
          const { cid } = await nodebb.findOrCreateCategoryByPath(categoryPath);
          
          await nodebb.createTopic({
            cid,
            title: fileName,
            content: `\`\`\`${fileExtension.replace('.','') || 'text'}\n${contentStr}\n\`\`\``, // Wrap content in a code block
            tags: [encodedPath, fileExtension.replace('.','') ].filter(Boolean), // Add tags for discovery
            customData: {
              source: 'github',
              repoUrl: repoUrl,
              filePath: normalizedFilePath,
              contentHash: hash,
            }
          });
        }
      }
      
      console.log(chalk.bold.magenta('\n--- Import Process Complete ---'));

    } catch (error) {
      // The individual functions already log detailed errors.
      // We just need to signify that the process failed.
      console.error(chalk.red.bold('\n--- Import Process Failed ---'));
      process.exit(1);
    }
  });

program.parse(process.argv);