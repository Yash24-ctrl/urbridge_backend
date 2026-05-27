import express from "express";
import dotenv from "dotenv";
import path from "path";
import { Readable } from "node:stream";
import { fileURLToPath } from "url";
import { protect } from "../middleware/authMiddleware.js";
import {
  analyzeManualResume,
  saveProfile,
  getProfile,
  saveAnalysis,
  getLatestAnalysis,
} from "../controllers/resumeController.js";
import {
  extractResumeDataHeuristically,
  normalizeParsedResumeData,
  buildResumeParserPrompt,
  parseJsonObjectFromText,
  extractTextFromOpenRouterAnnotations,
} from "../utils/resumeParser.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "../.env") });

const router = express.Router();
const MIN_PDF_TEXT_LENGTH = 50;
const MAX_PDF_UPLOAD_BYTES = 10 * 1024 * 1024;
const ML_SERVICE_PDF_URL =
  process.env.ML_SERVICE_PDF_URL || "http://127.0.0.1:5001/parse-pdf";

function createHttpError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

// Resume analysis routes (protected)
router.post("/analyze", protect, analyzeManualResume);
router.post("/profile", protect, saveProfile);
router.get("/profile", protect, getProfile);
router.post("/analysis", protect, saveAnalysis);
router.get("/analysis/latest", protect, getLatestAnalysis);

async function callAIWithMessages(messages, extraPayload = {}) {
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
        messages,
        temperature: 0.1,
        ...extraPayload,
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

  return data;
}

function getAssistantText(data) {
  const content = data?.choices?.[0]?.message?.content;

  if (typeof content === "string") {
    return content.replace(/```json/gi, "").replace(/```/g, "").trim();
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }
        if (item?.type === "text") {
          return item.text || "";
        }
        return "";
      })
      .join("\n")
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();
  }

  return "";
}

async function callAI(prompt) {
  const data = await callAIWithMessages([
    {
      role: "user",
      content: prompt,
    },
  ]);

  return getAssistantText(data);
}

function decodePdfBase64ToBuffer(pdfBase64) {
  const rawValue = String(pdfBase64 || "").trim();

  if (!rawValue) {
    throw createHttpError("No PDF provided", 400);
  }

  const normalizedBase64 = rawValue.startsWith("data:application/pdf;base64,")
    ? rawValue.split(",", 2)[1]
    : rawValue;

  if (!normalizedBase64) {
    throw createHttpError("Invalid PDF data provided", 400);
  }

  return Buffer.from(normalizedBase64, "base64");
}

async function extractPdfTextWithMlServiceBuffer(
  pdfBuffer,
  fileName = "resume.pdf"
) {
  if (!Buffer.isBuffer(pdfBuffer) || pdfBuffer.length === 0) {
    throw createHttpError("No PDF provided", 400);
  }

  if (pdfBuffer.length > MAX_PDF_UPLOAD_BYTES) {
    throw createHttpError("PDF size must be 10MB or less", 413);
  }

  const formData = new FormData();
  const safeFileName = path.basename(String(fileName || "resume.pdf")) || "resume.pdf";

  formData.append(
    "pdf",
    new Blob([pdfBuffer], { type: "application/pdf" }),
    safeFileName
  );

  const response = await fetch(ML_SERVICE_PDF_URL, {
    method: "POST",
    body: formData,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw createHttpError(
      data?.error ||
      data?.message ||
      "Could not extract text from PDF. Please make sure your PDF is not scanned or image-based.",
      response.status || 500
    );
  }

  return {
    text: String(data?.text || "").trim(),
    extractor: String(data?.extractor || "").trim(),
    isImageBased: Boolean(data?.isImageBased),
  };
}

async function extractPdfTextWithMlService(pdfBase64, fileName = "resume.pdf") {
  const pdfBuffer = decodePdfBase64ToBuffer(pdfBase64);
  return extractPdfTextWithMlServiceBuffer(pdfBuffer, fileName);
}

async function readUploadedPdfFromRequest(req) {
  const multipartRequest = new Request("http://localhost/api/resume/upload-pdf", {
    method: req.method,
    headers: req.headers,
    body: Readable.toWeb(req),
    duplex: "half",
  });

  const formData = await multipartRequest.formData();
  const uploadedPdf = formData.get("pdf");

  if (!uploadedPdf || typeof uploadedPdf.arrayBuffer !== "function") {
    throw createHttpError("No PDF file provided", 400);
  }

  const fileName = path.basename(String(uploadedPdf.name || "resume.pdf")) || "resume.pdf";
  const pdfBuffer = Buffer.from(await uploadedPdf.arrayBuffer());

  return {
    fileName,
    pdfBuffer,
  };
}

function buildPdfContent(prompt, pdfBase64, fileName = "resume.pdf") {
  return [
    {
      type: "text",
      text: prompt,
    },
    {
      type: "file",
      file: {
        filename: fileName,
        file_data: `data:application/pdf;base64,${pdfBase64}`,
      },
    },
  ];
}

async function extractPdfTextWithFileParser(pdfBase64, fileName = "resume.pdf") {
  const responseData = await callAIWithMessages(
    [
      {
        role: "user",
        content: buildPdfContent(
          "Extract all readable resume text from this PDF. Preserve the original order, headings, bullet points, contact lines, job titles, dates, project names, skills, certifications, and line breaks. Return plain text only.",
          pdfBase64,
          fileName
        ),
      },
    ],
    {
      plugins: [
        {
          id: "file-parser",
          pdf: {
            engine: "mistral-ocr",
          },
        },
      ],
    }
  );

  return {
    annotationText: extractTextFromOpenRouterAnnotations(responseData),
    assistantText: getAssistantText(responseData),
  };
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

// Parse resume using AI-guided extraction with heuristic grounding.
router.post("/parse-resume", async (req, res) => {
  try {
    const { pdfText = "", pdfBase64 = "", fileName = "resume.pdf" } = req.body;

    if ((!pdfText || pdfText.trim().length < MIN_PDF_TEXT_LENGTH) && !pdfBase64) {
      return res.status(400).json({
        error: "Resume PDF data is missing",
      });
    }

    console.log("Starting resume parsing...");

    let textForParsing = String(pdfText || "").trim();
    let extractionErrorMessage = "";

    if (pdfBase64) {
      try {
        const { text, extractor } = await extractPdfTextWithMlService(
          pdfBase64,
          fileName
        );

        if (text.length > textForParsing.length) {
          textForParsing = text;
        }
        console.log(`PDF text extracted via ${extractor || "ml_service"} with ${text.length} characters`);
      } catch (ocrError) {
        extractionErrorMessage =
          ocrError.message ||
          "Could not extract text from PDF. Please make sure your PDF is not scanned or image-based.";
        console.error("PDF text extraction failed during parse step:", extractionErrorMessage);
      }
    }

    if (textForParsing.length < MIN_PDF_TEXT_LENGTH) {
      return res.status(400).json({
        error:
          extractionErrorMessage ||
          "Could not extract text from PDF. Please make sure your PDF is not scanned or image-based.",
      });
    }

    const finalHeuristics = extractResumeDataHeuristically(textForParsing);
    let aiParsedData = {};

    try {
      const prompt = buildResumeParserPrompt({
        pdfText: textForParsing,
        heuristicData: finalHeuristics,
      });
      const rawAiResponse = await callAI(prompt);
      const parsedAiObject = parseJsonObjectFromText(rawAiResponse);

      if (parsedAiObject && typeof parsedAiObject === "object") {
        aiParsedData = parsedAiObject;
      } else {
        console.warn("AI resume parser returned non-JSON output. Falling back to heuristics.");
      }
    } catch (aiError) {
      console.warn(
        "AI resume parsing failed. Falling back to heuristic parsing:",
        aiError.message
      );
    }

    const parsed = normalizeParsedResumeData(
      aiParsedData,
      finalHeuristics,
      textForParsing
    );

    console.log("Resume parsed result:", JSON.stringify(parsed, null, 2));
    res.json(parsed);
  } catch (error) {
    console.error("Resume Parse Error:", error);
    const { pdfText = "" } = req.body;
    const fallbackText = String(pdfText || "").trim();

    if (fallbackText.length >= MIN_PDF_TEXT_LENGTH) {
      const heuristicOnly = extractResumeDataHeuristically(fallbackText);
      return res.json(normalizeParsedResumeData({}, heuristicOnly, fallbackText));
    }

    res.status(500).json({
      error:
        error.message ||
        "Could not extract text from PDF. Please make sure your PDF is not scanned or image-based.",
    });
  }
});

router.post("/upload-pdf", async (req, res) => {
  try {
    const { fileName, pdfBuffer } = await readUploadedPdfFromRequest(req);
    const { text, extractor, isImageBased } = await extractPdfTextWithMlServiceBuffer(
      pdfBuffer,
      fileName
    );

    if (!text || text.length < MIN_PDF_TEXT_LENGTH) {
      return res.status(400).json({
        error:
          "Could not extract text from PDF. Please make sure your PDF is not scanned or image-based.",
      });
    }

    res.json({
      text,
      extractor,
      characters: text.length,
      fileName,
      isImageBased,
    });
  } catch (error) {
    console.error("PDF upload parsing error:", error);
    res.status(error.statusCode || 500).json({
      error:
        error.message ||
        "Could not extract text from PDF. Please make sure your PDF is not scanned or image-based.",
    });
  }
});

// Extract text from PDF using OpenRouter file parsing / OCR when needed.
router.post("/extract-pdf-text", protect, async (req, res) => {
  try {
    const { pdfBase64, fileName = "resume.pdf" } = req.body;

    if (!pdfBase64) {
      return res.status(400).json({ error: "No PDF provided" });
    }

    console.log("Extracting text from PDF using file parsing...");

    const { text, extractor, isImageBased } = await extractPdfTextWithMlService(
      pdfBase64,
      fileName
    );
    const extractedText = String(text || "").trim();

    if (!extractedText || extractedText.length < MIN_PDF_TEXT_LENGTH) {
      return res.status(400).json({
        error: "Could not extract text from PDF. Please make sure your PDF is not scanned or image-based.",
      });
    }

    console.log(`PDF text extracted via ${extractor || "ml_service"} with ${extractedText.length} characters`);
    res.json({
      text: extractedText,
      extractor,
      isImageBased,
    });
  } catch (error) {
    console.error("PDF text extraction error:", error);
    const statusCode =
      error.message?.includes("image-based") ||
      error.message?.includes("text-based PDF") ||
      error.message?.includes("Could not extract text from PDF") ||
      error.message?.includes("No PDF provided") ||
      error.message?.includes("10MB")
        ? 400
        : 500;

    res.status(statusCode).json({ error: error.message });
  }
});

export default router;
