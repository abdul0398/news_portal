import express from "express";
import {
  createClient,
  getExistingClient,
  getNews,
  getClients,
  handleClientArticleRelation,
  deleteClientById,
  getPromptTemplates,
  getActivePromptTemplate,
  createPromptTemplate,
  updatePromptTemplate,
  setActivePromptTemplate,
  deletePromptTemplate,
  getSources,
  createSource,
  updateSource,
  toggleSourceStatus,
  deleteSource,
  getTopics,
  createTopic,
  updateTopic,
  toggleTopicStatus,
  deleteTopic,
} from "../database/index.js";
const router = express.Router();

router
  .get("/articles", async (req, res) => {
    try {
      const news = await getNews();
      res.status(200).json(news);
    } catch (error) {
      res.status(500).json({ error: "Internal Server Error" });
    }
  })
  .post("/client", async (req, res) => {
    try {
      const name = req.body.name;
      if (!name || name.length < 2)
        return res.status(400).json({ error: "Invalid name" });
      const existingClient = await getExistingClient(name);
      if (existingClient.length > 0)
        return res
          .status(400)
          .json({ error: "Client already exists with this name" });
      await createClient(name);
      return res.status(200).json({ message: "Client created successfully" });
    } catch (error) {
      res.status(500).json({ error: "Internal Server Error" });
    }
  })
  .get("/clients", async (req, res) => {
    try {
      const clients = await getClients();
      res.status(200).json(clients);
    } catch (error) {
      res.status(500).json({ error: "Internal Server Error" });
    }
  })
  .post("/client/:clientId/article/:articleId", async (req, res) => {
    try {
      const clientId = req.params.clientId;
      const articleId = req.params.articleId;
      console.log(clientId, articleId);
      const result = await handleClientArticleRelation(clientId, articleId);
      res.status(200).json({ result });
    } catch (error) {
      console.log(error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  })
  .delete("/client/:clientId", async (req, res) => {
    try {
      const clientId = req.params.clientId;
      const success = await deleteClientById(clientId);
      if (!success) {
        return res
          .status(404)
          .json({ error: "Client not found or deletion failed" });
      }
      return res.status(200).json({ message: "Client deleted successfully" });
    } catch (error) {
      console.error("DELETE /client/:clientId error:", error);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  })
  .get("/prompts", async (req, res) => {
    try {
      const prompts = await getPromptTemplates();
      res.status(200).json(prompts);
    } catch (error) {
      console.error("Error fetching prompts:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  })
  .get("/prompts/active", async (req, res) => {
    try {
      const activePrompt = await getActivePromptTemplate();
      res.status(200).json(activePrompt);
    } catch (error) {
      console.error("Error fetching active prompt:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  })
  .post("/prompts", async (req, res) => {
    try {
      const { name, template, description } = req.body;
      if (!name || !template) {
        return res.status(400).json({ error: "Name and template are required" });
      }
      
      const promptId = await createPromptTemplate(name, template, description);
      res.status(201).json({ 
        message: "Prompt template created successfully", 
        id: promptId 
      });
    } catch (error) {
      console.error("Error creating prompt template:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  })
  .put("/prompts/:id", async (req, res) => {
    try {
      const promptId = req.params.id;
      const updateData = req.body;
      
      const success = await updatePromptTemplate(promptId, updateData);
      if (!success) {
        return res.status(404).json({ error: "Prompt template not found" });
      }
      
      res.status(200).json({ message: "Prompt template updated successfully" });
    } catch (error) {
      console.error("Error updating prompt template:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  })
  .post("/prompts/:id/activate", async (req, res) => {
    try {
      const promptId = req.params.id;
      
      const success = await setActivePromptTemplate(promptId);
      if (!success) {
        return res.status(404).json({ error: "Prompt template not found" });
      }
      
      res.status(200).json({ message: "Prompt template activated successfully" });
    } catch (error) {
      console.error("Error activating prompt template:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  })
  .delete("/prompts/:id", async (req, res) => {
    try {
      const promptId = req.params.id;
      
      const success = await deletePromptTemplate(promptId);
      if (!success) {
        return res.status(404).json({ error: "Prompt template not found" });
      }
      
      res.status(200).json({ message: "Prompt template deleted successfully" });
    } catch (error) {
      console.error("Error deleting prompt template:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  })
  .post("/prompts/test", async (req, res) => {
    try {
      const { template } = req.body;
      if (!template) {
        return res.status(400).json({ error: "Template is required" });
      }

      // Test the prompt with sample data
      const testSource = "https://stackedhomes.com/";
      const testTopic = "HDB";
      
      const customizedPrompt = template
        .replace(/{source}/g, testSource)
        .replace(/{topic}/g, testTopic);

      // Import the functions we need
      const { extractNewsFromResponse, enhancePromptForJSON } = await import('../database/index.js');
      const { fetchNews } = await import('../vendors/sonar.js');
      
      const enhancedPrompt = enhancePromptForJSON(customizedPrompt);
      
      try {
        const response = await fetchNews(enhancedPrompt);
        const extractedNews = await extractNewsFromResponse(response, testSource, testTopic);
        
        res.status(200).json({ 
          success: true,
          message: "Prompt test completed",
          articlesFound: extractedNews.length,
          sampleArticles: extractedNews.slice(0, 2), // Return first 2 as sample
          originalResponse: response.substring(0, 500) + "..." // Truncated for debugging
        });
      } catch (fetchError) {
        res.status(200).json({
          success: false,
          message: "Prompt test failed during news fetching",
          error: fetchError.message
        });
      }
    } catch (error) {
      console.error("Error testing prompt:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  })
  // Sources management endpoints
  .get("/sources", async (req, res) => {
    try {
      const sources = await getSources();
      res.status(200).json(sources);
    } catch (error) {
      console.error("Error fetching sources:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  })
  .post("/sources", async (req, res) => {
    try {
      const { name, url, description } = req.body;
      if (!name || !url) {
        return res.status(400).json({ error: "Name and URL are required" });
      }
      
      const sourceId = await createSource(name, url, description);
      res.status(201).json({ 
        message: "Source created successfully", 
        id: sourceId 
      });
    } catch (error) {
      console.error("Error creating source:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  })
  .put("/sources/:id", async (req, res) => {
    try {
      const sourceId = req.params.id;
      const updateData = req.body;
      
      const success = await updateSource(sourceId, updateData);
      if (!success) {
        return res.status(404).json({ error: "Source not found" });
      }
      
      res.status(200).json({ message: "Source updated successfully" });
    } catch (error) {
      console.error("Error updating source:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  })
  .post("/sources/:id/toggle", async (req, res) => {
    try {
      const sourceId = req.params.id;
      
      const success = await toggleSourceStatus(sourceId);
      if (!success) {
        return res.status(404).json({ error: "Source not found" });
      }
      
      res.status(200).json({ message: "Source status toggled successfully" });
    } catch (error) {
      console.error("Error toggling source status:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  })
  .delete("/sources/:id", async (req, res) => {
    try {
      const sourceId = req.params.id;
      
      const success = await deleteSource(sourceId);
      if (!success) {
        return res.status(404).json({ error: "Source not found" });
      }
      
      res.status(200).json({ message: "Source deleted successfully" });
    } catch (error) {
      console.error("Error deleting source:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  })
  // Topics management endpoints
  .get("/topics", async (req, res) => {
    try {
      const topics = await getTopics();
      res.status(200).json(topics);
    } catch (error) {
      console.error("Error fetching topics:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  })
  .post("/topics", async (req, res) => {
    try {
      const { name, description } = req.body;
      if (!name) {
        return res.status(400).json({ error: "Name is required" });
      }
      
      const topicId = await createTopic(name, description);
      res.status(201).json({ 
        message: "Topic created successfully", 
        id: topicId 
      });
    } catch (error) {
      console.error("Error creating topic:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  })
  .put("/topics/:id", async (req, res) => {
    try {
      const topicId = req.params.id;
      const updateData = req.body;
      
      const success = await updateTopic(topicId, updateData);
      if (!success) {
        return res.status(404).json({ error: "Topic not found" });
      }
      
      res.status(200).json({ message: "Topic updated successfully" });
    } catch (error) {
      console.error("Error updating topic:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  })
  .post("/topics/:id/toggle", async (req, res) => {
    try {
      const topicId = req.params.id;
      
      const success = await toggleTopicStatus(topicId);
      if (!success) {
        return res.status(404).json({ error: "Topic not found" });
      }
      
      res.status(200).json({ message: "Topic status toggled successfully" });
    } catch (error) {
      console.error("Error toggling topic status:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  })
  .delete("/topics/:id", async (req, res) => {
    try {
      const topicId = req.params.id;
      
      const success = await deleteTopic(topicId);
      if (!success) {
        return res.status(404).json({ error: "Topic not found" });
      }
      
      res.status(200).json({ message: "Topic deleted successfully" });
    } catch (error) {
      console.error("Error deleting topic:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

export default router;
