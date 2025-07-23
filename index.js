import express from "express";
import path from "path";
const port = process.env.PORT || 3450;
const app = express();
import viewsRouter from "./routes/views.js";
import apiRouter from "./routes/api.js";
const cron = require("node-cron");

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(process.cwd(), "public")));
app.set("view engine", "ejs");
app.set("views", path.join(process.cwd(), "views"));
app.use("/", viewsRouter);
app.use("/api", apiRouter);
app.listen(port, async () => {
  console.log(`Server is running on port ${port}`);
  cron.schedule("0 0 * * *", async () => {
    await saveNewsToDB();
  });
});
