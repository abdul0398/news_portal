import mysql from "mysql2/promise";
import dotenv from "dotenv";
import { fetchNews } from "../vendors/sonar.js";

dotenv.config();

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
});

export async function saveNewsToDB() {
  // Update last execution time at the start of the function
  await updateLastExecutionTime();

  // Get dynamic topics and sources, fallback to defaults if none exist
  const topics = await getActiveTopics();
  const sources = await getActiveSources();

  // Get the active prompt template
  const activePrompt = await getActivePromptTemplate();
  const promptTemplate = activePrompt
    ? activePrompt.template
    : `Search for the latest news from {source} about {topic} in Singapore from the last 3 days and Skip the articles which are paid. Return EXACTLY 10 news articles as a JSON array. Each article must be a JSON object with these exact fields: "title", "description", "date", "source", "canonical_url". Return ONLY the JSON array, no additional text or explanation. Example format: [{"title":"Article Title","description":"Article description","date":"2024-01-15","source":"Source Name","canonical_url":"https://example.com/article"}]`;

  for (const topic of topics) {
    for (const source of sources) {
      // Replace placeholders in the prompt template
      const customizedPrompt = promptTemplate
        .replace(/{source}/g, source)
        .replace(/{topic}/g, topic);

      // Add JSON enforcement to the prompt if not already present
      const enhancedPrompt = enhancePromptForJSON(customizedPrompt);

      const response = await fetchNews(enhancedPrompt);

      // Try to extract and parse JSON with multiple fallback strategies
      const newsList = await extractNewsFromResponse(response, source, topic);

      if (!newsList || newsList.length === 0) {
        console.error(
          `No valid news articles extracted from response for ${source} - ${topic}.`
        );
        continue;
      }

      try {
        for (const news of newsList) {
          const { title, description, date, source, canonical_url } = news;

          // Check if unique_url already exists
          const [existingRows] = await pool.query(
            "SELECT id FROM news_articles WHERE unique_url = ? LIMIT 1",
            [canonical_url]
          );

          if (existingRows.length > 0) {
            console.log(`Skipping duplicate: ${canonical_url}`);
            continue; // Skip this news item
          }

          const sql =
            "INSERT INTO news_articles (title, description, date_created, topic, source, unique_url) VALUES (?, ?, ?, ?, ?, ?)";
          const values = [
            title,
            description,
            new Date(date || Date.now()),
            topic,
            source,
            canonical_url,
          ];
          await pool.query(sql, values);
        }
      } catch (e) {
        console.error(
          `Failed to parse extracted JSON array for ${source} - ${topic}:`,
          e
        );
        continue;
      }
    }
  }
}

export async function getNews() {
  try {
    const [rows] = await pool.query("SELECT * FROM news_articles");
    return rows;
  } catch (error) {
    return [];
  }
}

export async function getExistingClient(name) {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM clients WHERE name = ? LIMIT 1",
      [name]
    );
    return rows;
  } catch (error) {
    return [];
  }
}

export async function createClient(name) {
  try {
    const sql = "INSERT INTO clients (name) VALUES (?)";
    const values = [name];
    await pool.query(sql, values);
  } catch (error) {
    return [];
  }
}

export async function getClients() {
  try {
    const [rows] = await pool.query("SELECT * FROM clients");
    return rows;
  } catch (error) {
    return [];
  }
}

export async function getClientById(clientId) {
  try {
    const [rows] = await pool.query("SELECT * FROM clients WHERE id = ?", [
      clientId,
    ]);
    return rows;
  } catch (error) {
    return [];
  }
}

export async function getArticleById(articleId) {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM news_articles WHERE id = ?",
      [articleId]
    );
    return rows;
  } catch (error) {
    return [];
  }
}

export async function handleClientArticleRelation(clientId, articleId) {
  try {
    const clients = await getClientById(clientId);
    const articles = await getArticleById(articleId);

    if (!clients.length || !articles.length) throw new Error("Invalid IDs");

    const client = clients[0];
    const article = articles[0];
    const articlesShared = client.articles_shared || [];
    const clientList = article.clients || [];

    const articlePos = articlesShared.indexOf(articleId);
    const clientPos = clientList.indexOf(clientId);

    if (articlePos !== -1) {
      articlesShared.splice(articlePos, 1);
    } else {
      articlesShared.push(articleId);
    }

    if (clientPos !== -1) {
      clientList.splice(clientPos, 1);
    } else {
      clientList.push(clientId);
    }

    await updateClientById(clientId, {
      articles_shared: articlesShared,
    });
    await updateArticleById(articleId, {
      clients: clientList,
    });

    return true;
  } catch (error) {
    console.error("Error in handleClientArticleRelation:", error);
    return false;
  }
}

export async function updateClientById(clientId, data) {
  const keys = Object.keys(data);
  if (!keys.length) return false;

  const fields = keys.map((key) => `${key} = ?`).join(", ");

  const values = keys.map((key) =>
    Array.isArray(data[key]) ? JSON.stringify(data[key]) : data[key]
  );
  values.push(clientId);

  const sql = `UPDATE clients SET ${fields} WHERE id = ?`;
  await pool.query(sql, values);
  return true;
}

export async function updateArticleById(articleId, data) {
  const keys = Object.keys(data);
  if (!keys.length) return false;

  const fields = keys.map((key) => `${key} = ?`).join(", ");

  const values = keys.map((key) =>
    Array.isArray(data[key]) ? JSON.stringify(data[key]) : data[key]
  );
  values.push(articleId);

  const sql = `UPDATE news_articles SET ${fields} WHERE id = ?`;
  await pool.query(sql, values);
  return true;
}

export async function deleteClientById(clientId) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 1) select every article's clients field
    const [rows] = await conn.query("SELECT id, clients FROM news_articles");

    for (const { id, clients } of rows) {
      // 2) normalize to a JS array
      let clientList = [];

      if (clients == null) {
        clientList = [];
      } else if (Array.isArray(clients)) {
        clientList = clients;
      } else if (typeof clients === "string") {
        try {
          clientList = JSON.parse(clients);
        } catch {
          clientList = [];
        }
      } else {
        // maybe a Buffer or some other object
        try {
          const txt = clients.toString("utf8");
          clientList = JSON.parse(txt);
        } catch {
          clientList = [];
        }
      }

      // ensure it's really an array
      if (!Array.isArray(clientList)) clientList = [];

      // 3) if it doesn't contain this clientId, skip
      //    (coerce types just in case)
      const numId = Number(clientId);
      if (!clientList.includes(numId)) continue;

      // 4) filter it out and update
      const updated = clientList.filter((c) => c !== numId);
      await conn.query("UPDATE news_articles SET clients = ? WHERE id = ?", [
        JSON.stringify(updated),
        id,
      ]);
    }

    // 5) now delete the client row itself
    await conn.query("DELETE FROM clients WHERE id = ?", [clientId]);

    await conn.commit();
    return true;
  } catch (err) {
    await conn.rollback();
    console.error("Error in deleteClientById:", err);
    return false;
  } finally {
    conn.release();
  }
}

// Prompt management functions
export async function getPromptTemplates() {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM prompt_templates ORDER BY created_at DESC"
    );
    return rows;
  } catch (error) {
    console.error("Error fetching prompt templates:", error);
    return [];
  }
}

export async function getActivePromptTemplate() {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM prompt_templates WHERE is_active = 1 LIMIT 1"
    );
    return rows.length > 0 ? rows[0] : null;
  } catch (error) {
    console.error("Error fetching active prompt template:", error);
    return null;
  }
}

export async function createPromptTemplate(name, template, description = null) {
  try {
    const sql =
      "INSERT INTO prompt_templates (name, template, description, is_active, created_at) VALUES (?, ?, ?, 0, NOW())";
    const [result] = await pool.query(sql, [name, template, description]);
    return result.insertId;
  } catch (error) {
    console.error("Error creating prompt template:", error);
    throw error;
  }
}

export async function updatePromptTemplate(id, data) {
  try {
    const keys = Object.keys(data);
    if (!keys.length) return false;

    const fields = keys.map((key) => `${key} = ?`).join(", ");
    const values = keys.map((key) => data[key]);
    values.push(id);

    const sql = `UPDATE prompt_templates SET ${fields} WHERE id = ?`;
    await pool.query(sql, values);
    return true;
  } catch (error) {
    console.error("Error updating prompt template:", error);
    throw error;
  }
}

export async function setActivePromptTemplate(id) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Deactivate all templates
    await conn.query("UPDATE prompt_templates SET is_active = 0");

    // Activate the selected template
    await conn.query("UPDATE prompt_templates SET is_active = 1 WHERE id = ?", [
      id,
    ]);

    await conn.commit();
    return true;
  } catch (error) {
    await conn.rollback();
    console.error("Error setting active prompt template:", error);
    throw error;
  } finally {
    conn.release();
  }
}

export async function deletePromptTemplate(id) {
  try {
    const [result] = await pool.query(
      "DELETE FROM prompt_templates WHERE id = ?",
      [id]
    );
    return result.affectedRows > 0;
  } catch (error) {
    console.error("Error deleting prompt template:", error);
    throw error;
  }
}

// Sources management functions
export async function getSources() {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM sources ORDER BY created_at DESC"
    );
    return rows;
  } catch (error) {
    console.error("Error fetching sources:", error);
    return [];
  }
}

export async function getActiveSources() {
  try {
    const [rows] = await pool.query(
      "SELECT url FROM sources WHERE is_active = 1"
    );
    if (rows.length > 0) {
      return rows.map((row) => row.url);
    }
    // Return default sources if none are configured
    return ["https://stackedhomes.com/", "https://www.edgeprop.sg/"];
  } catch (error) {
    console.error("Error fetching active sources:", error);
    return ["https://stackedhomes.com/", "https://www.edgeprop.sg/"];
  }
}

export async function createSource(name, url, description = null) {
  try {
    const sql =
      "INSERT INTO sources (name, url, description, is_active, created_at) VALUES (?, ?, ?, 1, NOW())";
    const [result] = await pool.query(sql, [name, url, description]);
    return result.insertId;
  } catch (error) {
    console.error("Error creating source:", error);
    throw error;
  }
}

export async function updateSource(id, data) {
  try {
    const keys = Object.keys(data);
    if (!keys.length) return false;

    const fields = keys.map((key) => `${key} = ?`).join(", ");
    const values = keys.map((key) => data[key]);
    values.push(id);

    const sql = `UPDATE sources SET ${fields} WHERE id = ?`;
    await pool.query(sql, values);
    return true;
  } catch (error) {
    console.error("Error updating source:", error);
    throw error;
  }
}

export async function toggleSourceStatus(id) {
  try {
    await pool.query("UPDATE sources SET is_active = !is_active WHERE id = ?", [
      id,
    ]);
    return true;
  } catch (error) {
    console.error("Error toggling source status:", error);
    throw error;
  }
}

export async function deleteSource(id) {
  try {
    const [result] = await pool.query("DELETE FROM sources WHERE id = ?", [id]);
    return result.affectedRows > 0;
  } catch (error) {
    console.error("Error deleting source:", error);
    throw error;
  }
}

// Topics management functions
export async function getTopics() {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM topics ORDER BY created_at DESC"
    );
    return rows;
  } catch (error) {
    console.error("Error fetching topics:", error);
    return [];
  }
}

export async function getActiveTopics() {
  try {
    const [rows] = await pool.query(
      "SELECT name FROM topics WHERE is_active = 1"
    );
    if (rows.length > 0) {
      return rows.map((row) => row.name);
    }
    // Return default topics if none are configured
    return ["HDB", "Condo", "Landed", "Finance"];
  } catch (error) {
    console.error("Error fetching active topics:", error);
    return ["HDB", "Condo", "Landed", "Finance"];
  }
}

export async function createTopic(name, description = null) {
  try {
    const sql =
      "INSERT INTO topics (name, description, is_active, created_at) VALUES (?, ?, 1, NOW())";
    const [result] = await pool.query(sql, [name, description]);
    return result.insertId;
  } catch (error) {
    console.error("Error creating topic:", error);
    throw error;
  }
}

export async function updateTopic(id, data) {
  try {
    const keys = Object.keys(data);
    if (!keys.length) return false;

    const fields = keys.map((key) => `${key} = ?`).join(", ");
    const values = keys.map((key) => data[key]);
    values.push(id);

    const sql = `UPDATE topics SET ${fields} WHERE id = ?`;
    await pool.query(sql, values);
    return true;
  } catch (error) {
    console.error("Error updating topic:", error);
    throw error;
  }
}

export async function toggleTopicStatus(id) {
  try {
    await pool.query("UPDATE topics SET is_active = !is_active WHERE id = ?", [
      id,
    ]);
    return true;
  } catch (error) {
    console.error("Error toggling topic status:", error);
    throw error;
  }
}

export async function deleteTopic(id) {
  try {
    const [result] = await pool.query("DELETE FROM topics WHERE id = ?", [id]);
    return result.affectedRows > 0;
  } catch (error) {
    console.error("Error deleting topic:", error);
    throw error;
  }
}

// Robust JSON extraction function with multiple fallback strategies
export async function extractNewsFromResponse(response, source, topic) {
  console.log(`Processing response for ${source} - ${topic}`);

  // Strategy 1: Try to find JSON array in response
  const jsonArrayMatch = response.match(/\[\s*{[\s\S]*?}\s*\]/);
  if (jsonArrayMatch) {
    try {
      const parsed = JSON.parse(jsonArrayMatch[0]);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const validated = validateAndCleanNewsArray(parsed, source);
        if (validated.length > 0) {
          console.log(
            `Strategy 1 success: Found ${validated.length} articles via JSON array match`
          );
          return validated;
        }
      }
    } catch (error) {
      console.log(
        "Strategy 1 failed: JSON array match found but parsing failed",
        error.message
      );
    }
  }

  // Strategy 2: Try to find multiple JSON objects
  const jsonObjectMatches = response.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g);
  if (jsonObjectMatches && jsonObjectMatches.length > 0) {
    const objects = [];
    for (const match of jsonObjectMatches) {
      try {
        const parsed = JSON.parse(match);
        if (parsed.title || parsed.headline) {
          objects.push(parsed);
        }
      } catch (error) {
        // Skip invalid JSON objects
      }
    }
    if (objects.length > 0) {
      const validated = validateAndCleanNewsArray(objects, source);
      if (validated.length > 0) {
        console.log(
          `Strategy 2 success: Found ${validated.length} articles via multiple JSON objects`
        );
        return validated;
      }
    }
  }

  // Strategy 3: Try to parse entire response as JSON
  try {
    const parsed = JSON.parse(response);
    if (Array.isArray(parsed)) {
      const validated = validateAndCleanNewsArray(parsed, source);
      if (validated.length > 0) {
        console.log(
          `Strategy 3 success: Found ${validated.length} articles via full JSON parse`
        );
        return validated;
      }
    } else if (parsed.articles && Array.isArray(parsed.articles)) {
      const validated = validateAndCleanNewsArray(parsed.articles, source);
      if (validated.length > 0) {
        console.log(
          `Strategy 3 success: Found ${validated.length} articles via nested articles array`
        );
        return validated;
      }
    }
  } catch (error) {
    console.log("Strategy 3 failed: Full JSON parse failed", error.message);
  }

  // Strategy 4: Use AI to convert non-JSON response to JSON
  console.log("All JSON strategies failed, attempting AI conversion...");
  try {
    const convertedResponse = await convertResponseToJSON(
      response,
      source,
      topic
    );
    if (convertedResponse && convertedResponse.length > 0) {
      console.log(
        `Strategy 4 success: AI converted response to ${convertedResponse.length} articles`
      );
      return convertedResponse;
    }
  } catch (error) {
    console.log("Strategy 4 failed: AI conversion failed", error.message);
  }

  // Strategy 5: Extract structured data using regex patterns
  console.log("Attempting regex-based extraction...");
  const extractedArticles = extractArticlesWithRegex(response, source, topic);
  if (extractedArticles.length > 0) {
    console.log(
      `Strategy 5 success: Regex extracted ${extractedArticles.length} articles`
    );
    return extractedArticles;
  }

  console.error(`All extraction strategies failed for ${source} - ${topic}`);
  return [];
}

// Validate and clean news array to ensure consistent format
function validateAndCleanNewsArray(articles, source) {
  if (!Array.isArray(articles)) return [];

  return articles
    .filter((article) => article && (article.title || article.headline))
    .map((article) => ({
      title: article.title || article.headline || "Untitled",
      description:
        article.description ||
        article.summary ||
        article.content ||
        "No description available",
      date:
        article.date ||
        article.published_date ||
        article.publishedAt ||
        article.created_at ||
        new Date().toISOString(),
      source: article.source || source || "Unknown Source",
      canonical_url:
        article.canonical_url ||
        article.url ||
        article.link ||
        article.href ||
        "#",
    }))
    .slice(0, 10); // Limit to 10 articles max
}

// Convert non-JSON response to JSON using AI
async function convertResponseToJSON(response, source, topic) {
  try {
    const { fetchNews } = await import("../vendors/sonar.js");

    const conversionPrompt = `Convert the following text about ${topic} news from ${source} into a JSON array format. 
    Extract any news articles mentioned and format them as JSON objects with these fields: title, description, date, source, canonical_url.
    Return ONLY the JSON array, no additional text.
    
    Text to convert:
    ${response.substring(0, 2000)}`;

    const convertedResponse = await fetchNews(conversionPrompt);

    // Try to extract JSON from the converted response
    const jsonMatch = convertedResponse.match(/\[\s*{[\s\S]*?}\s*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return validateAndCleanNewsArray(parsed, source);
    }
  } catch (error) {
    console.error("AI conversion failed:", error);
  }
  return [];
}

// Extract articles using regex patterns as last resort
function extractArticlesWithRegex(response, source, topic) {
  const articles = [];

  // Common patterns for news articles in text
  const patterns = [
    // Pattern 1: Title: ... Description: ... Date: ... URL: ...
    /Title:\s*([^\n]+)\s*Description:\s*([^\n]+)\s*Date:\s*([^\n]+)\s*URL:\s*([^\n\s]+)/gi,
    // Pattern 2: 1. Title - Description (Date) [URL]
    /\d+\.\s*([^-\n]+)\s*-\s*([^\n(]+)\s*\(([^)]+)\)\s*\[([^\]]+)\]/gi,
    // Pattern 3: ## Title Description Date: ... Source: ...
    /##\s*([^\n]+)\s*([^\n]+)\s*Date:\s*([^\n]+)\s*Source:\s*([^\n]+)/gi,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(response)) !== null && articles.length < 10) {
      articles.push({
        title: match[1] ? match[1].trim() : "Untitled",
        description: match[2] ? match[2].trim() : "No description available",
        date: match[3] ? match[3].trim() : new Date().toISOString(),
        source: source || "Unknown Source",
        canonical_url: match[4] ? match[4].trim() : "#",
      });
    }

    if (articles.length > 0) break; // Stop if we found articles with this pattern
  }

  // If no structured patterns found, try to extract any URLs and create basic articles
  if (articles.length === 0) {
    const urlPattern = /https?:\/\/[^\s\n\])}]+/gi;
    const urls = response.match(urlPattern) || [];

    // Try to find text around URLs that might be titles
    for (let i = 0; i < Math.min(urls.length, 5); i++) {
      const url = urls[i];
      const urlIndex = response.indexOf(url);

      // Look for title-like text before the URL (within 200 characters)
      const beforeUrl = response.substring(
        Math.max(0, urlIndex - 200),
        urlIndex
      );
      const titleMatch = beforeUrl.match(/([^.\n]{10,100})[\s\n]*$/);

      articles.push({
        title: titleMatch
          ? titleMatch[1].trim()
          : `${topic} News Article ${i + 1}`,
        description: `News article about ${topic} from ${source}`,
        date: new Date().toISOString(),
        source: source || "Unknown Source",
        canonical_url: url,
      });
    }
  }

  return articles;
}

// Enhance prompt to ensure JSON output
export function enhancePromptForJSON(prompt) {
  // Check if prompt already has JSON instructions
  const hasJSONInstructions = /json|JSON|\[|\{/.test(prompt);

  if (!hasJSONInstructions) {
    // Add JSON formatting instructions if not present
    return `${prompt}

IMPORTANT: Return the response as a JSON array. Each news article should be a JSON object with these fields: "title", "description", "date", "source", "canonical_url". Example: [{"title":"Title","description":"Description","date":"2024-01-15","source":"Source","canonical_url":"https://example.com"}]`;
  }

  // If JSON instructions are present but might be weak, strengthen them
  if (!prompt.includes("ONLY") && !prompt.includes("exactly")) {
    return `${prompt}

CRITICAL: Return ONLY the JSON array, no additional text or explanation.`;
  }

  return prompt;
}

// Functions to manage last execution time
export async function updateLastExecutionTime() {
  try {
    const now = new Date();
    await pool.query(
      "INSERT INTO system_settings (setting_key, setting_value) VALUES ('last_news_fetch', ?) ON DUPLICATE KEY UPDATE setting_value = ?",
      [now.toISOString(), now.toISOString()]
    );
  } catch (error) {
    console.error("Error updating last execution time:", error);
  }
}

export async function getLastExecutionTime() {
  try {
    const [rows] = await pool.query(
      "SELECT setting_value FROM system_settings WHERE setting_key = 'last_news_fetch' LIMIT 1"
    );
    return rows.length > 0 ? rows[0].setting_value : null;
  } catch (error) {
    console.error("Error fetching last execution time:", error);
    return null;
  }
}
