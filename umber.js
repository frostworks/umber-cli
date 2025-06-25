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
    nodebb.init(config);
    
    const repoUrl = options.repo || config.target_repo_url;
    
    if (!repoUrl) {
      console.error(chalk.red('Error: Repository URL must be provided via --repo option or in config.json.'));
      process.exit(1);
    }

    try {
      const files = await github.fetchRepoContents(repoUrl, config.ignored_paths);
      console.log(chalk.magenta(`\nFound ${files.length} files to process.`));
      
      for (const file of files) {
        const normalizedFilePath = path.normalize(file.filePath);
        console.log(`\nProcessing: ${chalk.bold(normalizedFilePath)}`);
        
        const contentStr = file.content.toString('utf-8');
        const hash = utils.calculateHash(contentStr);
        const encodedPath = utils.encodePath(normalizedFilePath);
        const fileExtension = path.extname(normalizedFilePath);
        const fileName = path.basename(normalizedFilePath);

        const existingTopic = await nodebb.findTopicByMetadata(encodedPath);

        if (existingTopic) {
            // For now, we only update topics that were NOT chunked.
            // A robust update for chunked topics is a more complex feature.
            if (existingTopic.customData.isChunked) {
                 console.log(chalk.yellow('Topic was chunked. Update logic is not yet implemented. Skipping.'));
                 continue;
            }
          
            if (existingTopic.customData.contentHash !== hash) {
                // If the new content is too large, we can't update it in one go. Skip for now.
                if (contentStr.length > 32768) { // Using NodeBB's default limit
                    console.log(chalk.yellow(`Content has changed and now exceeds post limit. Update logic for chunking not implemented. Skipping.`));
                    continue;
                }
                await nodebb.updateTopic(existingTopic.tid, existingTopic.mainPid, { 
                    content: `\`\`\`${fileExtension.replace('.','') || 'text'}\n${contentStr}\n\`\`\``,
                    customData: { ...existingTopic.customData, contentHash: hash }
                });
            } else {
                console.log(chalk.gray('Content is unchanged. Skipping.'));
            }
        } else {
          // --- NEW CHUNKING & POSTING LOGIC ---
          const { cid } = await nodebb.findOrCreateCategoryByPath(path.dirname(normalizedFilePath));
          const chunks = utils.chunkText(contentStr);

          // Format the first chunk as the main topic post
          const mainPostContent = `\`\`\`${fileExtension.replace('.','') || 'text'}\n${chunks[0]}\n\`\`\``;

          const topicResponse = await nodebb.createTopic({
            cid,
            title: fileName,
            content: mainPostContent,
            tags: [encodedPath, fileExtension.replace('.','')].filter(Boolean),
            customData: {
              source: 'github',
              repoUrl: repoUrl,
              filePath: normalizedFilePath,
              contentHash: hash,
              isChunked: chunks.length > 1, // Add metadata to know it was split
              chunkCount: chunks.length,
            }
          });

          // If there are more chunks, post them as replies
          if (chunks.length > 1) {
            console.log(chalk.blue(`Content split into ${chunks.length} posts.`));
            for (let i = 1; i < chunks.length; i++) {
              const replyContent = `*(Continued from post ${i})*\n\n\`\`\`${fileExtension.replace('.','') || 'text'}\n${chunks[i]}\n\`\`\``;
              await nodebb.createReply({ tid: topicResponse.tid, content: replyContent });
              await new Promise(resolve => setTimeout(resolve, 1000)); // Rate limit replies
            }
          }
        }
      }
      
      console.log(chalk.bold.magenta('\n--- Import Process Complete ---'));

    } catch (error) {
      console.error(chalk.red.bold('\n--- Import Process Failed ---'));
      process.exit(1);
    }
  });

program.parse(process.argv);