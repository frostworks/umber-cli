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

    // --- 1. Configuration ---
    const configPath = path.join(process.cwd(), 'config.json');
    if (!fs.existsSync(configPath)) {
      console.error(chalk.red('Error: config.json not found. Please copy config.json.example and fill it out.'));
      process.exit(1);
    }
    const config = await fs.readJson(configPath);
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
        const { filePath, content } = file;
        console.log(`\nProcessing: ${chalk.bold(filePath)}`);
        
        const contentStr = content.toString('utf-8');
        const hash = utils.calculateHash(contentStr);
        const encodedPath = utils.encodePath(filePath);
        const fileExtension = path.extname(filePath);
        const fileName = path.basename(filePath);

        // --- 4. Check for Existing Topic (Stubbed) ---
        const existingTopic = await nodebb.findTopicByMetadata(encodedPath);

        if (existingTopic) {
          if (existingTopic.hash !== hash) {
            // Update existing topic if hash is different
            await nodebb.updateTopic(existingTopic.tid, { content: contentStr, hash });
          } else {
            console.log(chalk.gray('Content is unchanged. Skipping.'));
          }
        } else {
          // --- 5. Create New Topic (Stubbed) ---
          const categoryPath = path.dirname(filePath);
          const { cid } = await nodebb.findOrCreateCategoryByPath(categoryPath);
          
          await nodebb.createTopic({
            cid,
            title: fileName,
            content: contentStr,
            tags: [encodedPath, fileExtension.replace('.','') ],
            customData: {
              source: 'github',
              repoUrl: repoUrl,
              filePath: filePath,
              contentHash: hash,
            }
          });
        }
      }
      
      console.log(chalk.bold.magenta('\n--- Import Process Complete ---'));

    } catch (error) {
      console.error(chalk.red('\nAn unexpected error occurred:'));
      console.error(error);
      process.exit(1);
    }
  });

program.parse(process.argv);