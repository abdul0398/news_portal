import express from "express";
import { requireAuth, redirectIfLoggedIn } from "../middleware/auth.js";
const router = express.Router();

router.get("/dashboard", requireAuth, (req, res) => {
  res.render("dashboard");
});

router.get("/login", redirectIfLoggedIn, (req, res) => {
  res.render("login");
});

router.get("/", redirectIfLoggedIn, (req, res) => {
  res.redirect("/login");
});

export default router;
