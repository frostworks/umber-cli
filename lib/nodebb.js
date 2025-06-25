import axios from 'axios';
import chalk from 'chalk';
import { sep } from 'path';
// We will define the apiClient here and initialize it later.
let apiClient;

/**
 * Initializes the API client with settings from the config file.
 * This must be called before any other API function.
 * @param {object} config - The configuration object from config.json.
 */
export function init(config) {
  if (!config.nodebb_url || !config.nodebb_api_token) {
    throw new Error('NodeBB URL and API Token must be configured.');
  }

  // Set the baseURL to the root of the forum.
  // Each function will now provide the full path.
  apiClient = axios.create({
    baseURL: config.nodebb_url,
    headers: {
      Authorization: `Bearer ${config.nodebb_api_token}`,
    },
  });
  console.log(chalk.green(`NodeBB API Client initialized for ${config.nodebb_url}`));
}

/**
 * Finds a topic by fetching a category's data using the Core API and then
 * checking its topic list for a unique filename tag.
 * @param {string} filenameTag - The sanitized tag created from the filename.
 * @param {number} parentCid - The CID of the category the topic should be in.
 * @returns {Promise<object|null>} The topic data or null.
 */
export async function findTopicByMetadata(filenameTag, parentCid) {
  if (!parentCid) {
    return null;
  }

  try {
    // 1. Using the Core API endpoint which is expected to contain the rich topic list.
    const response = await apiClient.get(`/api/category/${parentCid}`);

    // 2. The Core API response structure might be different, but should contain a `topics` array.
    if (!response.data || !response.data.topics || response.data.topics.length === 0) {
      return null; // No topics found in this category.
    }

    // 3. Iterate through the topics in this category to find our match.
    const topicData = response.data.topics.find((topic) => topic.tags && topic.tags.some((tag) => tag.value.toLowerCase() === filenameTag.toLowerCase()));

    if (!topicData) {
      return null; // No topic with our specific filename tag was found in this category.
    }

    // 4. We found the topic summary. Get its full details to ensure we have customData.
    const topicDetails = await apiClient.get(`/api/v3/topics/${topicData.tid}`);
    return {
      tid: topicData.tid,
      slug: topicData.slug,
      title: topicData.title,
      mainPid: topicData.mainPid,
      customData: topicDetails.data.customData || {},
    };
  } catch (error) {
    if (error.response && error.response.status === 404) {
      // This means the category itself wasn't found.
      return null;
    }
    console.error(chalk.red(`Error fetching topics for category CID ${parentCid}:`), error.response?.data || error.message);
    throw error;
  }
}

/**
 * Creates a new topic in NodeBB.
 * @param {object} topicData - The topic data.
 * @returns {Promise<object>} The new topic data object { tid, slug, ... }.
 */
export async function createTopic(topicData) {
  try {
    console.log(chalk.green(`Creating topic: "${topicData.title}"...`));
    // Using full path from the base URL
    const response = await apiClient.post('/api/v3/topics', topicData);
    return response.data.response;
  } catch (error) {
    console.error(chalk.red(`Error creating topic "${topicData.title}":`), error.response?.data || error.message);
    throw error;
  }
}

/**
 * Updates an existing topic's content and metadata.
 * @param {number} tid - The topic ID to update.
 * @param {number} pid - The main post ID to update.
 * @param {object} topicData - The new topic data.
 * @returns {Promise<void>}
 */
export async function updateTopic(tid, pid, topicData) {
  try {
    console.log(chalk.cyan(`Updating topic TID: ${tid}...`));
    // Using full paths from the base URL
    await apiClient.put(`/api/v3/posts/${pid}`, {
      content: topicData.content,
    });
    // Updating topic customData is not directly supported this way,
    // but the main content update is the key part.
  } catch (error) {
    console.error(chalk.red(`Error updating topic TID ${tid}:`), error.response?.data || error.message);
    throw error;
  }
}

export async function findOrCreateCategoryByPath(categoryPath, baseCid = null) {
  if (categoryPath === '.' || !categoryPath) {
    return { cid: baseCid }; // Return the base if path is empty
  }

  const parts = categoryPath.split(sep);
  // Start the traversal from the provided base CID.
  let parentCid = baseCid;

  for (const part of parts) {
    try {
      const response = await apiClient.get('/api/v3/categories');

      const existingCategory = response.data.response.categories.find((c) => c.name.toLowerCase() === part.toLowerCase()
                && (c.parentCid || null) === parentCid);

      if (existingCategory) {
        parentCid = existingCategory.cid;
      } else {
        console.log(chalk.blue(`Creating category "${part}"...`));
        const createResponse = await apiClient.post('/api/v3/categories', { name: part, parentCid });
        parentCid = createResponse.data.response.cid;
      }
    } catch (error) {
      console.error(chalk.red(`Error processing category "${part}":`), error.response?.data || error.message);
      throw error;
    }
  }
  return { cid: parentCid };
}

/**
 * Creates a reply to an existing topic.
 * @param {object} replyData - Data including tid, content, and uid.
 * @returns {Promise<object>} The new post data.
 */
export async function createReply(replyData) {
  const { tid, content, _uid } = replyData;
  try {
    console.log(chalk.blue(`   -> Posting reply to TID: ${tid}...`));
    // Using full path from the base URL
    const response = await apiClient.post(`/api/v3/topics/${tid}`, { content, _uid });
    return response.data.response;
  } catch (error) {
    console.error(chalk.red(`Error creating reply for TID ${tid}:`), error.response?.data || error.message);
    throw error;
  }
}
