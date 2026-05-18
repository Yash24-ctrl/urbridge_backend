import express from "express";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { protect } from "../middleware/authMiddleware.js";
import {
  analyzeManualResume,
  saveProfile,
  getProfile,
  saveAnalysis,
  getLatestAnalysis,
} from "../controllers/resumeController.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "../.env") });

const router = express.Router();

// Resume analysis routes (protected)
router.post("/analyze", protect, analyzeManualResume);
router.post("/profile", protect, saveProfile);
router.get("/profile", protect, getProfile);
router.post("/analysis", protect, saveAnalysis);
router.get("/analysis/latest", protect, getLatestAnalysis);

async function callAI(prompt) {
  const key = process.env.OPENROUTER_API_KEY;

  if (!key) {
    throw new Error("OPENROUTER_API_KEY not found in .env");
  }

  console.log(
    "Using OpenRouter key:",
    key ? key.slice(0, 10) + "..." : "NOT FOUND"
  );

  const response = await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
          model: "openrouter/auto",

        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.1,
      }),
    }
  );

  const data = await response.json();

  console.log("OpenRouter Response:", JSON.stringify(data, null, 2));

  if (!response.ok) {
    throw new Error(
      `OpenRouter Error: ${data.error?.message || response.status}`
    );
  }

  let text = data.choices?.[0]?.message?.content || "";

  text = text
    .replace(/```json/g, "")
    .replace(/```/g, "")
    .trim();

  return text;
}

// Generate interview questions
router.post("/generate-interview-questions", async (req, res) => {
  try {
    const { field } = req.body;

    const prompt = `
Generate 8 multiple choice interview questions for "${field}".

Return ONLY valid JSON.

Format:
[
  {
    "question": "What is Python?",
    "options": ["A", "B", "C", "D"],
    "correct": 0
  }
]
`;

    const rawText = await callAI(prompt);
    const questions = JSON.parse(rawText);

    res.json({ questions });
  } catch (error) {
    console.error("Interview Question Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Parse Resume
router.post("/parse-resume", async (req, res) => {
  try {
    const { pdfText } = req.body;

    if (!pdfText || pdfText.trim().length < 50) {
      return res.status(400).json({
        error: "PDF text too short or empty",
      });
    }

    const prompt = `
You are an expert resume parser with 10+ years of experience in HR and recruitment.

Carefully analyze this resume and extract accurate information.

Rules:
- Extract ONLY what's explicitly mentioned in the resume
- If something is not found, use the default value
- Skills should be relevant technical/professional skills only
- Experience should be total years (number as string, e.g., "2", "5", "0")
- Education should be highest level: "PhD", "Master's", "Bachelor's", "Diploma", or "High School"
- Projects count should be number of projects mentioned (as string)
- Certifications should be actual certification names, not courses
- City should be current location if mentioned
- Previous job title should be most recent role

Resume Text:
${pdfText.slice(0, 15000)}

Return ONLY valid JSON with this exact structure:
{
  "yearsOfExperience": "0",
  "educationLevel": "Bachelor's",
  "desiredJobRole": "Software Engineer",
  "completedProjects": "3",
  "skills": ["Python", "JavaScript", "React"],
  "certifications": ["AWS Certified Developer"],
  "currentCity": "Mumbai",
  "previousJobTitle": "Junior Developer"
}
`;

    const rawText = await callAI(prompt);

    let parsed;

    try {
      parsed = JSON.parse(rawText);
    } catch (err) {
      console.log("Failed JSON parse, retrying...", rawText);
      
      // Retry once with stricter prompt
      const retryPrompt = `
Extract ONLY the JSON from this text. Return valid JSON only:

${rawText}
`;
      const retryText = await callAI(retryPrompt);
      parsed = JSON.parse(retryText);
    }

    // Validate and set defaults for missing fields
    parsed.yearsOfExperience = parsed.yearsOfExperience || "0";
    parsed.educationLevel = parsed.educationLevel || "Bachelor's";
    parsed.desiredJobRole = parsed.desiredJobRole || "";
    parsed.completedProjects = parsed.completedProjects || "0";
    parsed.skills = Array.isArray(parsed.skills) ? parsed.skills.filter(s => s && s.trim()) : [];
    parsed.certifications = Array.isArray(parsed.certifications) ? parsed.certifications.filter(c => c && c.trim()) : [];
    parsed.currentCity = parsed.currentCity || "";
    parsed.previousJobTitle = parsed.previousJobTitle || "";

    console.log("Resume parsed successfully:", parsed);
    res.json(parsed);
  } catch (error) {
    console.error("Resume Parse Error:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;