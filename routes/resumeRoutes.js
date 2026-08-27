import express from "express";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { protect } from "../middleware/authMiddleware.js";
// Subscription lock temporarily disabled for testing.
// import { requireFeatureAccess } from "../middleware/featureAccessMiddleware.js";
import {
  analyzeManualResume,
  saveProfile,
  getProfile,
  saveAnalysis,
  getAnalysisHistory,
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
const NOT_RESUME_PDF_ERROR =
  "The PDF you uploaded does not look like a resume. Please upload a resume PDF.";

function createHttpError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function isLikelyResumeText(text = "") {
  const rawText = String(text || "").trim();
  const normalized = rawText.toLowerCase().replace(/\s+/g, " ");

  if (rawText.length < MIN_PDF_TEXT_LENGTH) {
    return false;
  }

  const sectionSignals = [
    /\b(curriculum vitae|resume|résumé)\b/i,
    /\b(professional summary|profile summary|career objective|summary)\b/i,
    /\b(work experience|professional experience|employment history|internship|internships)\b/i,
    /\b(education|academic background|qualification|qualifications)\b/i,
    /\b(technical skills|key skills|core skills|skills)\b/i,
    /\b(projects|project experience|academic projects|personal projects)\b/i,
    /\b(certifications|certificates|licenses)\b/i,
  ].reduce((score, pattern) => score + (pattern.test(rawText) ? 1 : 0), 0);

  const contactSignals = [
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
    /(?:\+?\d[\s-]?){9,14}/,
    /\b(linkedin\.com|github\.com)\b/i,
  ].reduce((score, pattern) => score + (pattern.test(rawText) ? 1 : 0), 0);

  const roleSignals = /\b(engineer|developer|analyst|scientist|manager|consultant|specialist|designer|tester|intern|trainee|associate|executive|coordinator|administrator|architect)\b/i.test(rawText) ? 1 : 0;

  const skillSignals = [
    "python",
    "java",
    "javascript",
    "react",
    "node",
    "sql",
    "excel",
    "power bi",
    "tableau",
    "machine learning",
    "html",
    "css",
    "mongodb",
    "aws",
    "docker",
  ].reduce((score, skill) => score + (normalized.includes(skill) ? 1 : 0), 0);

  const totalSignals = sectionSignals * 2 + contactSignals + roleSignals + Math.min(skillSignals, 4);
  return sectionSignals >= 2 || (sectionSignals >= 1 && contactSignals >= 1) || totalSignals >= 5;
}

function rejectIfNotResumeText(text = "") {
  if (!isLikelyResumeText(text)) {
    throw createHttpError(NOT_RESUME_PDF_ERROR, 400);
  }
}

// Resume analysis routes (protected)
// Subscription lock temporarily disabled for testing.
// router.post("/analyze", protect, requireFeatureAccess("ats_checker"), analyzeManualResume);
router.post("/analyze", protect, analyzeManualResume);
router.post("/profile", protect, saveProfile);
router.get("/profile", protect, getProfile);
router.post("/analysis", protect, saveAnalysis);
router.get("/analysis/history", protect, getAnalysisHistory);
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

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);
  let response;

  try {
    response = await fetch(
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
        signal: controller.signal,
      }
    );
  } finally {
    clearTimeout(timeoutId);
  }

  const responseText = await response.text();
  const data = responseText ? JSON.parse(responseText) : {};

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

async function readRequestBodyBuffer(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalBytes = 0;
    let isFinished = false;

    const fail = (error) => {
      if (isFinished) {
        return;
      }

      isFinished = true;
      reject(error);
    };

    req.on("data", (chunk) => {
      if (isFinished) {
        return;
      }

      totalBytes += chunk.length;
      if (totalBytes > maxBytes) {
        fail(createHttpError("PDF size must be 10MB or less", 413));
        req.destroy();
        return;
      }

      chunks.push(Buffer.from(chunk));
    });

    req.on("end", () => {
      if (isFinished) {
        return;
      }

      isFinished = true;
      resolve(Buffer.concat(chunks));
    });

    req.on("error", (error) => {
      fail(error);
    });
  });
}

function extractMultipartBoundary(contentType = "") {
  const boundaryMatch = String(contentType || "").match(
    /boundary=(?:"([^"]+)"|([^;]+))/i
  );

  return boundaryMatch?.[1] || boundaryMatch?.[2] || "";
}

function parseMultipartParts(bodyBuffer, boundary) {
  const parts = new Map();
  const boundaryBuffer = Buffer.from(`--${boundary}`);
  let searchStart = 0;

  while (searchStart < bodyBuffer.length) {
    const boundaryStart = bodyBuffer.indexOf(boundaryBuffer, searchStart);

    if (boundaryStart === -1) {
      break;
    }

    let partStart = boundaryStart + boundaryBuffer.length;

    if (bodyBuffer.slice(partStart, partStart + 2).toString() === "--") {
      break;
    }

    if (bodyBuffer[partStart] === 13 && bodyBuffer[partStart + 1] === 10) {
      partStart += 2;
    } else if (bodyBuffer[partStart] === 10) {
      partStart += 1;
    }

    const nextBoundary = bodyBuffer.indexOf(boundaryBuffer, partStart);

    if (nextBoundary === -1) {
      break;
    }

    let partBuffer = bodyBuffer.slice(partStart, nextBoundary);

    if (partBuffer.length >= 2 && partBuffer[partBuffer.length - 2] === 13 && partBuffer[partBuffer.length - 1] === 10) {
      partBuffer = partBuffer.slice(0, -2);
    } else if (partBuffer.length >= 1 && partBuffer[partBuffer.length - 1] === 10) {
      partBuffer = partBuffer.slice(0, -1);
    }

    let headerEndIndex = partBuffer.indexOf(Buffer.from("\r\n\r\n"));
    let headerSeparatorLength = 4;

    if (headerEndIndex === -1) {
      headerEndIndex = partBuffer.indexOf(Buffer.from("\n\n"));
      headerSeparatorLength = 2;
    }

    if (headerEndIndex === -1) {
      searchStart = nextBoundary;
      continue;
    }

    const headerText = partBuffer.slice(0, headerEndIndex).toString("utf8");
    const contentBuffer = partBuffer.slice(headerEndIndex + headerSeparatorLength);
    const dispositionMatch = headerText.match(/content-disposition:[^\r\n]*name="([^"]+)"/i);

    if (!dispositionMatch) {
      searchStart = nextBoundary;
      continue;
    }

    const filenameMatch = headerText.match(/filename="([^"]*)"/i) || headerText.match(/filename\*=UTF-8''([^;\r\n]+)/i);
    const partName = dispositionMatch[1];

    parts.set(partName, {
      name: partName,
      filename: filenameMatch?.[1] ? decodeURIComponent(filenameMatch[1]) : "",
      contentType:
        headerText.match(/content-type:\s*([^\r\n]+)/i)?.[1]?.trim() || "",
      buffer: contentBuffer,
    });

    searchStart = nextBoundary;
  }

  return parts;
}

async function readUploadedPdfFromRequest(req) {
  const contentType = String(req.headers["content-type"] || "");

  if (!/multipart\/form-data/i.test(contentType)) {
    throw createHttpError("Expected multipart/form-data PDF upload", 400);
  }

  const boundary = extractMultipartBoundary(contentType);
  if (!boundary) {
    throw createHttpError("Invalid multipart upload boundary", 400);
  }

  const requestBody = await readRequestBodyBuffer(
    req,
    MAX_PDF_UPLOAD_BYTES + 1024 * 1024
  );
  const multipartParts = parseMultipartParts(requestBody, boundary);
  const uploadedPdf = multipartParts.get("pdf") || [...multipartParts.values()].find((part) => part.filename || /pdf/i.test(part.contentType));

  if (!uploadedPdf || !Buffer.isBuffer(uploadedPdf.buffer) || uploadedPdf.buffer.length === 0) {
    throw createHttpError("No PDF file provided", 400);
  }

  if (uploadedPdf.buffer.length > MAX_PDF_UPLOAD_BYTES) {
    throw createHttpError("PDF size must be 10MB or less", 413);
  }

  const fileName =
    path.basename(String(uploadedPdf.filename || "resume.pdf")) || "resume.pdf";

  return {
    fileName,
    pdfBuffer: uploadedPdf.buffer,
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

    rejectIfNotResumeText(textForParsing);

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
      try {
        rejectIfNotResumeText(fallbackText);
      } catch (validationError) {
        return res.status(validationError.statusCode || 400).json({
          error: validationError.message || NOT_RESUME_PDF_ERROR,
        });
      }

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

    rejectIfNotResumeText(text);

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

    rejectIfNotResumeText(extractedText);

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
      error.message?.includes("does not look like a resume") ||
      error.message?.includes("No PDF provided") ||
      error.message?.includes("10MB")
        ? 400
        : 500;

    res.status(statusCode).json({ error: error.message });
  }
});

export default router;
