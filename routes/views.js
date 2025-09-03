import express from "express";
import { requireAuth } from "../middleware/auth.js";
const router = express.Router();

router.get("/dashboard", requireAuth, (req, res) => {
  res.render("dashboard");
});

router.get("/login", (req, res) => {
  res.render("login");
});

router.get("/", (req, res) => {
  res.redirect("/login");
});

export default router;
