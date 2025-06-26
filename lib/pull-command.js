import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';

export async function pullWorkflow(config, pid) {
  if (!config.hub || !config.hub.url || !config.hub.api_key) {
    console.error(chalk.red('Hub configuration is missing. Please set hub.url and hub.api_key in your config file.'));
    process.exit(1);
  }

  // --- THE ONLY CHANGE IS ON THIS LINE ---
  const targetUrl = `${config.hub.url}/api/v3/plugins/workflow/${pid}`;

  console.log(chalk.yellow(`Pulling workflow from PID ${pid}...`));
  console.log(chalk.gray(`> ${targetUrl}`));

  try {
    const response = await axios.get(targetUrl, {
      headers: {
        'Authorization': `Bearer ${config.hub.api_key}`
      }
    });
    
    const workflowPayload = response.data.response;

    if (!workflowPayload || !workflowPayload.workflowData) {
      console.error(chalk.red('Error: Invalid workflow data received from hub.'));
      console.log(response.data);
      return;
    }

    const outputFileName = `workflow-${pid}.json`;
    const outputContent = JSON.stringify(workflowPayload.workflowData, null, 2);
    const outputPath = path.resolve(process.cwd(), outputFileName);

    await fs.writeFile(outputPath, outputContent);

    console.log(chalk.green.bold(`\nSuccess! Workflow saved to ${outputFileName}`));
    console.log(`- Type: ${workflowPayload.workflowType}`);
    console.log(`- Metadata: ${JSON.stringify(workflowPayload.metadata)}`);

  } catch (error) {
    if (error.response) {
      console.error(chalk.red(`Error fetching workflow: ${error.response.status} ${error.response.statusText}`));
      console.error(chalk.gray(JSON.stringify(error.response.data, null, 2)));
    } else {
      console.error(chalk.red('An unexpected error occurred:'), error.message);
    }
  }
}