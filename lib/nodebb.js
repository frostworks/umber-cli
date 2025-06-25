import axios from 'axios';
import chalk from 'chalk';
import path from 'path';
import https from 'https'; // Kept in case you need it for self-signed certs

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

  // This agent is only used if you uncomment the httpsAgent line below
  // for local development with self-signed SSL certificates.
  const agent = new https.Agent({
    rejectUnauthorized: false
  });

  apiClient = axios.create({
    baseURL: `${config.nodebb_url}/api/v3`,
    headers: {
      'Authorization': `Bearer ${config.nodebb_api_token}`
    },
    // Uncomment the next line ONLY if using a local self-signed SSL cert
    // httpsAgent: agent, 
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
  if (categoryPath === '.' || !categoryPath) {
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
      const existingCategory = response.data.response.categories.find(c => c.name.toLowerCase() === part.toLowerCase());
      
      if (existingCategory) {
        parentCid = existingCategory.cid;
      } else {
        console.log(chalk.blue(`Creating category "${part}"...`));
        const createResponse = await apiClient.post('/categories', { name: part, parentCid });
        parentCid = createResponse.data.response.cid;
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
 * Creates a reply to an existing topic.
 * @param {object} replyData - Data including tid, content, and uid.
 * @returns {Promise<object>} The new post data.
 */
export async function createReply(replyData) {
  const { tid, content, _uid } = replyData; // Added _uid
  try {
    console.log(chalk.blue(`   -> Posting reply to TID: ${tid}...`));
    // Added _uid to the payload to ensure correct user attribution
    const response = await apiClient.post(`/topics/${tid}`, { content, _uid });
    return response.data.payload;
  } catch (error) {
    console.error(chalk.red(`Error creating reply for TID ${tid}:`), error.response?.data || error.message);
    throw error;
  }
}

export async function findTopicByMetadata(encodedPath) {
  try {
    // Use the direct, core API for tag lookups. This is faster and avoids search index delays.
    // NOTE: We are intentionally using the core API instead of the Write API for this read operation.
    // The apiClient is already configured to work with the base URL.
    const response = await apiClient.get(`/tag/${encodedPath}`);

    // The response structure is different. Topics are in a 'topics' array.
    const topicData = response.data.topics?.[0];
    if (!topicData) {
      // The tag doesn't exist or has no topics, so the topic doesn't exist.
      return null;
    }
    
    // The data we get back is rich enough, but we still need the customData (hash)
    // from a direct topic fetch.
    const topicDetails = await apiClient.get(`/topics/${topicData.tid}`);

    return {
        tid: topicData.tid,
        slug: topicData.slug,
        title: topicData.title,
        mainPid: topicData.mainPid,
        customData: topicDetails.data.customData || {},
    };
  } catch (error) {
    // A 404 from this endpoint reliably means the tag does not exist.
    if (error.response && error.response.status === 404) {
      return null;
    }
    // For other errors, we log them.
    console.error(chalk.red('Error looking up topic by tag:'), error.response?.data || error.message);
    throw error; // Throw to stop the process on unexpected errors.
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
 * @param {object} topicData - The new topic data, including content and customData.
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