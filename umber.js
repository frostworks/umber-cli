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
        const fileName = path.basename(normalizedFilePath);
        const directoryPath = path.dirname(normalizedFilePath);

        // --- NEW LOGIC ---
        // 1. Get the parent category ID first.
        const { cid: parentCid } = await nodebb.findOrCreateCategoryByPath(directoryPath);

        // 2. Create a simple, unique tag for the filename.
        const filenameTag = utils.createFilenameTag(fileName);

        // 3. Find the topic using the combination of the filename tag AND the parent CID.
        let existingTopic = await nodebb.findTopicByMetadata(filenameTag, parentCid);
        
        let topicDataForToc = { filePath: normalizedFilePath, title: fileName };

        if (existingTopic) {
          topicDataForToc.tid = existingTopic.tid;
          topicDataForToc.slug = existingTopic.slug;
          
          if (existingTopic.customData.contentHash !== hash) {
            console.log(chalk.cyan(`Content has changed. Updating topic TID: ${existingTopic.tid}...`));
            // We can now safely update chunked posts too if we implement that logic here
            await nodebb.updateTopic(existingTopic.tid, existingTopic.mainPid, { 
              content: `\`\`\`${path.extname(fileName).replace('.','') || 'text'}\n${contentStr}\n\`\`\``,
              customData: { ...existingTopic.customData, contentHash: hash }
            });
          } else {
            console.log(chalk.gray('Content is unchanged. Skipping.'));
          }
        } else {
          // 4. If not found, create it with simple, useful tags.
          const pathTags = directoryPath.split(path.sep).filter(p => p !== '.');
          const allTags = [...pathTags, filenameTag];

          // For this version, we are not re-implementing chunking to keep the change focused.
          // We can add it back easily if needed.
          const newTopicData = await nodebb.createTopic({
            cid: parentCid,
            title: fileName,
            content: `\`\`\`${path.extname(fileName).replace('.','') || 'text'}\n${contentStr}\n\`\`\``,
            _uid: config.importer_uid,
            tags: allTags,
            customData: {
              source: 'github', repoUrl, filePath: normalizedFilePath, contentHash: hash,
            }
          });

          topicDataForToc.tid = newTopicData.tid;
          topicDataForToc.slug = newTopicData.slug;
        }

        if (topicDataForToc.tid) {
            tocEntries.push(topicDataForToc);
        }
      }

      if (config.generate_toc && tocEntries.length > 0) {
        const tocMarkdown = utils.generateTocMarkdown(tocEntries, config);
        const tocFilenameTag = utils.createFilenameTag(config.toc_title);
        const tocTopic = await nodebb.findTopicByMetadata(tocFilenameTag, config.toc_cid);

        if (tocTopic) {
            console.log(chalk.cyan(`Updating existing Table of Contents topic...`));
            await nodebb.updateTopic(tocTopic.tid, tocTopic.mainPid, { content: tocMarkdown });
        } else {
            await nodebb.createTopic({
                cid: config.toc_cid,
                title: config.toc_title,
                content: tocMarkdown,
                _uid: config.importer_uid,
                tags: [tocFilenameTag]
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