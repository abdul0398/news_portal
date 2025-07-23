import express from "express";
import {
  createClient,
  getExistingClient,
  getNews,
  getClients,
  handleClientArticleRelation,
  deleteClientById,
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
  });

export default router;
