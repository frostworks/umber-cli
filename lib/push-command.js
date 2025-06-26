import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';

export async function pushWorkflow(config, options) {
  const { file, title, message, replyTo } = options;

  if (!file) {
    console.error(chalk.red('Error: A file path must be provided with the --file option.'));
    process.exit(1);
  }
  if (!title && !replyTo) {
    console.error(chalk.red('Error: A --title is required when creating a new topic.'));
    process.exit(1);
  }
  
  const filePath = path.resolve(process.cwd(), file);
  if (!fs.existsSync(filePath)) {
    console.error(chalk.red(`Error: File not found at ${filePath}`));
    process.exit(1);
  }

  let workflowDataFromFile;
  try {
    workflowDataFromFile = await fs.readJson(filePath);
  } catch (err) {
    console.error(chalk.red(`Error: Could not parse JSON from ${file}.`), err);
    process.exit(1);
  }

  // --- NEW: Prepare data as URLSearchParams ---
  const params = new URLSearchParams();
  params.append('title', title);
  params.append('message', message || '');
  params.append('workflowType', 'comfyui'); // Hardcoded for now
  
  // Stringify the JSON objects before appending
  params.append('workflowData', JSON.stringify(workflowDataFromFile));
  params.append('metadata', JSON.stringify({
    source: 'umber-cli',
    fileName: path.basename(filePath),
  }));

  if (replyTo) {
    params.append('replyTo', replyTo);
  }

  const targetUrl = `${config.hub.url}/api/v3/plugins/workflow`;

  console.log(chalk.yellow(`Pushing workflow to hub as form data...`));
  console.log(chalk.gray(`> ${targetUrl}`));

  try {
    // Axios will automatically set the correct Content-Type header
    // when we pass it a URLSearchParams object.
    const response = await axios.post(targetUrl, params, {
      headers: {
        'Authorization': `Bearer ${config.hub.api_key}`,
      }
    });

    const result = response.data.response;
    console.log(chalk.green.bold('\nSuccess! Workflow pushed to hub.'));
    console.log(`- New Post ID (pid): ${result.pid}`);
    console.log(`- Topic ID (tid): ${result.tid}`);
    console.log(chalk.cyan(`  View topic at: ${config.hub.url}/topic/${result.tid}`));

  } catch (error) {
    if (error.response) {
      console.error(chalk.red(`Error pushing workflow: ${error.response.status} ${error.response.statusText}`));
      console.error(chalk.gray(JSON.stringify(error.response.data, null, 2)));
    } else {
      console.error(chalk.red('An unexpected error occurred:'), error.message);
    }
  }
}