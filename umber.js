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

    const tocEntries = [];

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

        let topicDataForToc = { filePath: normalizedFilePath, title: fileName };
        let existingTopic = await nodebb.findTopicByMetadata(encodedPath);

        if (existingTopic) {
          topicDataForToc.tid = existingTopic.tid;
          topicDataForToc.slug = existingTopic.slug;
          
          if (existingTopic.customData.isChunked) {
            console.log(chalk.yellow('Topic was chunked. Update logic is not yet implemented. Skipping.'));
          } else if (existingTopic.customData.contentHash !== hash) {
            if (contentStr.length > 32768) {
              console.log(chalk.yellow(`Content has changed and now exceeds post limit. Update logic for chunking not implemented. Skipping.`));
            } else {
              await nodebb.updateTopic(existingTopic.tid, existingTopic.mainPid, { 
                content: `\`\`\`${fileExtension.replace('.','') || 'text'}\n${contentStr}\n\`\`\``,
                customData: { ...existingTopic.customData, contentHash: hash }
              });
            }
          } else {
            console.log(chalk.gray('Content is unchanged. Skipping.'));
          }
        } else {
          const { cid } = await nodebb.findOrCreateCategoryByPath(path.dirname(normalizedFilePath));
          const chunks = utils.chunkText(contentStr);
          const mainPostContent = `\`\`\`${fileExtension.replace('.','') || 'text'}\n${chunks[0]}\n\`\`\``;

          const newTopicData = await nodebb.createTopic({
            cid, title: fileName, content: mainPostContent, _uid: config.importer_uid,
            tags: [encodedPath, fileExtension.replace('.','')].filter(Boolean),
            customData: {
              source: 'github', repoUrl, filePath: normalizedFilePath, contentHash: hash,
              isChunked: chunks.length > 1, chunkCount: chunks.length,
            }
          });

          topicDataForToc.tid = newTopicData.tid;
          topicDataForToc.slug = newTopicData.slug;

          if (chunks.length > 1) {
            console.log(chalk.blue(`Content split into ${chunks.length} posts.`));
            for (let i = 1; i < chunks.length; i++) {
              const replyContent = `*(Continued from post ${i})*\n\n\`\`\`${fileExtension.replace('.','') || 'text'}\n${chunks[i]}\n\`\`\``;
              await nodebb.createReply({ tid: newTopicData.tid, content: replyContent, _uid: config.importer_uid });
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
          }
        }
        // Only add to ToC if the topic was successfully found or created
        if (topicDataForToc.tid) {
            tocEntries.push(topicDataForToc);
        }
      }

      if (config.generate_toc && tocEntries.length > 0) {
        // We'll need to find the ToC topic to see if we should update or create
        const tocTopic = await nodebb.findTopicByMetadata(utils.encodePath(config.toc_title));
        const tocMarkdown = utils.generateTocMarkdown(tocEntries, config);

        if (tocTopic) {
            console.log(chalk.cyan(`Updating existing Table of Contents topic...`));
            await nodebb.updateTopic(tocTopic.tid, tocTopic.mainPid, { content: tocMarkdown });
        } else {
            await nodebb.createTopic({
                cid: config.toc_cid,
                title: config.toc_title,
                content: tocMarkdown,
                _uid: config.importer_uid,
                tags: [utils.encodePath(config.toc_title)] // Tag the ToC so we can find it later
            });
            console.log(chalk.green.bold(`\nSuccessfully created Table of Contents topic!`));
        }
      }
      
      console.log(chalk.bold.magenta('\n\n--- Import Process Complete ---'));

    } catch (error) {
      console.error(chalk.red.bold('\n--- Import Process Failed ---'));
      if (error.stack) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  });

program.parse(process.argv);