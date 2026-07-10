require("dotenv").config({ path: "./config.env" });
const express = require("express");
const axios = require("axios");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const IBM_API_KEY = process.env.IBM_API_KEY;
const IBM_URL = process.env.IBM_URL;
const IBM_PROJECT_ID = process.env.IBM_PROJECT_ID;
const IBM_MODEL_ID = process.env.IBM_MODEL_ID;
const PORT = process.env.PORT || 3000;

let cachedToken = null;
let tokenExpiry = 0;

async function getIAMToken() {
  const now = Date.now();
  if (cachedToken && now < tokenExpiry) return cachedToken;

  const response = await axios.post(
    "https://iam.cloud.ibm.com/identity/token",
    new URLSearchParams({
      grant_type: "urn:ibm:params:oauth:grant-type:apikey",
      apikey: IBM_API_KEY,
    }),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );

  cachedToken = response.data.access_token;
  tokenExpiry = now + (response.data.expires_in - 60) * 1000;
  return cachedToken;
}

const SYSTEM_PROMPT = `You are ShopBot, an expert AI Shopping Assistant. Your role is to help users:
- Find the best products matching their needs, budget, and preferences
- Compare products across brands and provide honest pros/cons
- Suggest deals, discounts, and value-for-money options
- Provide buying guides and recommendations for any product category
- Answer questions about product features, specifications, and compatibility
- Help with gift ideas and occasion-based shopping
- Warn about common pitfalls and what to avoid when buying

Always be friendly, concise, and actionable. Format your responses clearly using bullet points or numbered lists where helpful. When recommending products, mention key features, approximate price range, and who it's best suited for.`;

app.post("/api/chat", async (req, res) => {
  const { messages } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: "Invalid messages format" });
  }

  try {
    const token = await getIAMToken();

    const payload = {
      model_id: IBM_MODEL_ID,
      project_id: IBM_PROJECT_ID,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        ...messages,
      ],
      parameters: {
        max_new_tokens: 1024,
        temperature: 0.7,
        top_p: 0.9,
      },
    };

    const response = await axios.post(IBM_URL, payload, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    });

    const reply = response.data.choices?.[0]?.message?.content || "No response received.";
    res.json({ reply });
  } catch (err) {
    console.error("IBM API Error:", err.response?.data || err.message);
    res.status(500).json({
      error: "Failed to get response from IBM Watson",
      details: err.response?.data?.errors?.[0]?.message || err.message,
    });
  }
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", model: IBM_MODEL_ID });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`\n🛒 AI Smart Shopping Assistant running on http://localhost:${PORT}`);
  console.log(`   Model: ${IBM_MODEL_ID}`);
  console.log(`   Project: ${IBM_PROJECT_ID}\n`);
});
