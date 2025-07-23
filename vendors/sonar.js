import dotenv from "dotenv";
// import axios from "axios";
dotenv.config();
const API_KEY = process.env.SONAR_API_KEY;
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: API_KEY,
  baseURL: "https://api.perplexity.ai",
});

export async function fetchNews(prompt) {
  const response = await client.chat.completions.create({
    model: "sonar",
    messages: [
      { role: "system", content: "Be precise and concise." },
      {
        role: "user",
        content: prompt,
      },
    ],
    search_mode: "web", // tweak these parameters to control the search results
  });
  return response.choices[0].message.content;
}
