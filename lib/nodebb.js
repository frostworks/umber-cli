import axios from 'axios';
import chalk from 'chalk';
import path from 'path';

let apiClient;
const categoryCache = new Map(); // In-memory cache to speed up category lookups

/**
 * Initializes the API client with settings from the config file.
 * Must be called before any other API function.
 * @param {object} config - The configuration object from config.json.
 */
export function init(config) {
  if (!config.nodebb_url || !config.nodebb_api_token) {
    throw new Error('NodeBB URL and API Token must be configured.');
  }
  apiClient = axios.create({
    baseURL: `${config.nodebb_url}/api/v3`,
    headers: {
      'Authorization': `Bearer ${config.nodebb_api_token}`
    }
  });
  console.log(chalk.green(`NodeBB API Client initialized for ${config.nodebb_url}`));
}

/**
 * Recursively finds or creates categories to match a given path.
 * Caches results to avoid redundant API calls.
 * @param {string} categoryPath - The path like 'data/moves' or '.' for root.
 * @returns {Promise<{cid: number}>} The final category ID.
 */
export async function findOrCreateCategoryByPath(categoryPath) {
  if (categoryPath === '.') {
    return { cid: null }; // Represents the root
  }
  
  if (categoryCache.has(categoryPath)) {
    return { cid: categoryCache.get(categoryPath) };
  }

  const parts = path.normalize(categoryPath).split(path.sep);
  let parentCid = null;

  for (const part of parts) {
    const currentPathKey = parentCid ? `${parentCid}:${part}` : part;
    if (categoryCache.has(currentPathKey)) {
        parentCid = categoryCache.get(currentPathKey);
        continue;
    }

    try {
      const response = await apiClient.get('/categories', { params: { parentCid } });
      const existingCategory = response.data.categories.find(c => c.name.toLowerCase() === part.toLowerCase());
      
      if (existingCategory) {
        parentCid = existingCategory.cid;
      } else {
        console.log(chalk.blue(`Creating category "${part}"...`));
        const createResponse = await apiClient.post('/categories', { name: part, parentCid });
        parentCid = createResponse.data.payload.cid;
      }
      categoryCache.set(currentPathKey, parentCid);

    } catch (error) {
      console.error(chalk.red(`Error processing category "${part}":`), error.response?.data || error.message);
      throw error;
    }
  }

  categoryCache.set(categoryPath, parentCid);
  return { cid: parentCid };
}

/**
 * Finds a topic by searching for a unique tag that matches its encoded source path.
 * @param {string} encodedPath - The unique, encoded source file path.
 * @returns {Promise<{tid: number, mainPid: number, customData: object}|null>} The topic data or null.
 */
export async function findTopicByMetadata(encodedPath) {
  try {
    const searchPayload = {
      term: encodedPath,
      in: 'tags',
      matchWords: 'all',
      searchIn: 'posts' // Searching in posts for a tag is the most reliable way
    };
    const response = await apiClient.post('/search', searchPayload);
    
    const topic = response.data.posts?.[0]?.topic;
    if (!topic) {
      return null;
    }

    // We found a topic, now get its full data to check the hash
    const topicResponse = await apiClient.get(`/topics/${topic.tid}`);
    return {
        tid: topicResponse.data.tid,
        mainPid: topicResponse.data.mainPid,
        customData: topicResponse.data.customData || {},
    };
  } catch (error) {
    console.error(chalk.red('Error searching for topic:'), error.response?.data || error.message);
    return null;
  }
}

/**
 * Creates a new topic in NodeBB.
 * @param {object} topicData - The topic data, including cid, title, content, tags, and customData.
 * @returns {Promise<{tid: number}>} The new topic ID.
 */
export async function createTopic(topicData) {
  try {
    console.log(chalk.green(`Creating topic: "${topicData.title}" in CID: ${topicData.cid}`));
    const response = await apiClient.post('/topics', topicData);
    return response.data.payload.topicData;
  } catch (error) {
    console.error(chalk.red(`Error creating topic "${topicData.title}":`), error.response?.data || error.message);
    throw error;
  }
}

/**
 * Updates an existing topic's content and metadata.
 * @param {number} tid - The topic ID to update.
 * @param {number} pid - The main post ID to update.
 * @param {object} topicData - The new topic data, including content and hash.
 * @returns {Promise<void>}
 */
export async function updateTopic(tid, pid, topicData) {
  try {
    console.log(chalk.cyan(`Updating topic TID: ${tid}...`));
    // Step 1: Update the post content
    await apiClient.put(`/posts/${pid}`, {
      content: topicData.content,
    });
    // Step 2: Update the topic's custom metadata with the new hash
    await apiClient.put(`/topics/${tid}`, {
      customData: topicData.customData,
    });
  } catch (error) {
    console.error(chalk.red(`Error updating topic TID ${tid}:`), error.response?.data || error.message);
    throw error;
  }
}