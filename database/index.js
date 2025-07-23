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
  const topics = ["HDB", "Condo", "Landed", "Finance"];
  for (const topic of topics) {
    const response = await fetchNews(
      `Only Fetch From: https://stackedhomes.com/ Give 10 latest news from the last 7 days on the topic of ${topic} in singapore. Return the result as a JSON array with each object containing "title", "description", "date", "source" and "canonical_url"`
    );
    const jsonArrayMatch = response.match(/\[\s*{[\s\S]*?}\s*\]/);

    if (!jsonArrayMatch) {
      console.error("No JSON array found in response.");
      return;
    }

    let newsList;
    try {
      newsList = JSON.parse(jsonArrayMatch[0]);

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
      console.error("Failed to parse extracted JSON array:", e);
      return;
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
