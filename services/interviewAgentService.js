/**
 * interviewAgentService.js
 *
 * Core "brain" of the AI Mock Interview feature.
 * Pure logic module: no Express req/res here, no direct DB writes.
 * The controller (step 3) will call these functions and persist
 * the results into MockInterviewSession.
 *
 * Mirrors resumeAnalyzerService.js's pattern of calling OpenRouter
 * for LLM reasoning, with a rule-based fallback if the call fails.
 */

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_API_KEY = process.env.GROQ_API_KEY;
// Free, fast Groq-hosted models: 'llama-3.3-70b-versatile' (best quality) or
// 'llama-3.1-8b-instant' (fastest/cheapest on free tier).
const GROQ_MODEL = process.env.GROQ_INTERVIEW_MODEL || 'llama-3.3-70b-versatile';

// ---------------------------------------------------------------------------
// Difficulty engine
// ---------------------------------------------------------------------------

/**
 * Maps a 0-100 knowledgeScore to a human-readable difficulty band.
 * Mirrors the bands agreed on earlier:
 *   80+     Very Hard
 *   60-80   Hard
 *   40-60   Medium
 *   20-40   Easy
 *   0-20    Fundamental
 */
function computeDifficultyBand(knowledgeScore) {
  if (knowledgeScore >= 80) return 'very_hard';
  if (knowledgeScore >= 60) return 'hard';
  if (knowledgeScore >= 40) return 'medium';
  if (knowledgeScore >= 20) return 'easy';
  return 'fundamental';
}

/**
 * Clamps knowledgeScore updates to the 0-100 range.
 */
function applyScoreDelta(currentScore, delta) {
  const next = currentScore + delta;
  return Math.max(0, Math.min(100, next));
}

/**
 * If difficultyMode is fixed (easy/medium/hard), the score is still tracked
 * internally for reporting, but question difficulty stays pinned.
 */
function resolveEffectiveDifficulty(config, knowledgeScore) {
  if (config.difficultyMode === 'adaptive') {
    return computeDifficultyBand(knowledgeScore);
  }
  return config.difficultyMode; // 'easy' | 'medium' | 'hard'
}

// ---------------------------------------------------------------------------
// LLM call helper (with graceful fallback)
// ---------------------------------------------------------------------------

async function callOpenRouterJSON(systemPrompt, userPrompt) {
  if (!GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY not configured');
  }

  const response = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.4,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    throw new Error(`Groq request failed: ${response.status}`);
  }

  const data = await response.json();
  const raw = data?.choices?.[0]?.message?.content;
  if (!raw) throw new Error('Groq returned no content');

  return JSON.parse(raw);
}

// ---------------------------------------------------------------------------
// Question generation
// ---------------------------------------------------------------------------

/**
 * Builds a compact text summary of the resume for prompting.
 * Keeps token usage low by only including fields that matter for question generation.
 */

function normalizeQuestionText(question) {
  return String(question || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\b(can|could|would|please|you|your|the|a|an|and|or|to|of|in|for|with|about|explain|tell|me|describe|what|how|why)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function questionSimilarity(a, b) {
  const left = normalizeQuestionText(a).split(' ').filter(Boolean);
  const right = normalizeQuestionText(b).split(' ').filter(Boolean);
  if (!left.length || !right.length) return 0;
  const rightSet = new Set(right);
  const overlap = left.filter((word) => rightSet.has(word)).length;
  return overlap / Math.max(left.length, right.length);
}

function isRepeatedQuestion(candidate, transcript = []) {
  const normalizedCandidate = normalizeQuestionText(candidate);
  if (!normalizedCandidate) return true;
  return transcript.some((entry) => {
    const previous = normalizeQuestionText(entry.question);
    return previous === normalizedCandidate || questionSimilarity(previous, normalizedCandidate) >= 0.78;
  });
}

function usedQuestionText(transcript = []) {
  return transcript
    .map((entry, index) => `${index + 1}. ${entry.question}`)
    .filter(Boolean)
    .join('\n') || 'none';
}

const ALLOWED_TRANSCRIPT_FOCUS_AREAS = new Set([
  'technical',
  'hr',
  'projects',
  'system_design',
  'behavioral',
  'communication',
]);

function normalizeFocusArea(value, preferredValue = 'technical') {
  const normalize = (input) => String(input || '')
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, '_');

  const normalized = normalize(value);
  if (ALLOWED_TRANSCRIPT_FOCUS_AREAS.has(normalized)) return normalized;

  const preferred = normalize(preferredValue);
  if (ALLOWED_TRANSCRIPT_FOCUS_AREAS.has(preferred)) return preferred;

  return 'technical';
}

function summarizeResumeForPrompt(resumeSnapshot) {
  const {
    skills = [],
    completedProjects = '',
    experience = 0,
    education = '',
    customEducation = '',
    certifications = [],
    desiredJobRoles = '',
    previousJobTitle = '',
    fullResumeText = '',
    fileName = '',
  } = resumeSnapshot || {};

  return [
    `Skills: ${skills.join(', ') || 'N/A'}`,
    `Years of experience: ${experience}`,
    `Previous job title: ${previousJobTitle || 'N/A'}`,
    `Education: ${education || customEducation || 'N/A'}`,
    `Certifications: ${certifications.join(', ') || 'N/A'}`,
    `Completed projects: ${completedProjects || 'N/A'}`,
    `Desired job roles: ${desiredJobRoles || 'N/A'}`,
    `Uploaded resume file: ${fileName || 'N/A'}`,
    `Resume text excerpt: ${String(fullResumeText || '').slice(0, 2500) || 'N/A'}`,
  ].join('\n');
}

/**
 * Generates the next interview question, given full session context.
 * Used both for the very first question (transcript = []) and every
 * subsequent question.
 *
 * @param {Object} ctx
 * @param {Object} ctx.resumeSnapshot
 * @param {Object} ctx.config            session.config
 * @param {Number} ctx.knowledgeScore
 * @param {String[]} ctx.topicsCovered
 * @param {String[]} ctx.weakTopics
 * @param {Array}  ctx.transcript        prior Q&A entries
 * @returns {Promise<{question: string, topic: string, focusArea: string}>}
 */
async function generateNextQuestion(ctx) {
  const { resumeSnapshot, config, knowledgeScore, topicsCovered = [], weakTopics = [], transcript = [] } = ctx;
  const difficulty = resolveEffectiveDifficulty(config, knowledgeScore);
  const isFirstQuestion = transcript.length === 0;

  const systemPrompt = `You are an expert technical/behavioral interviewer conducting a mock interview.
Respond ONLY with a JSON object: { "question": string, "topic": string, "focusArea": string }.
focusArea must be one of: technical, hr, projects, system_design, behavioral, communication.
Never repeat the same question or a closely similar rewording of an earlier question.
Never repeat a topic already covered unless probing deeper into a weak area, and even then ask a clearly different question.
Keep the question concise and natural, as a real interviewer would ask it.`;

  const userPrompt = `
Candidate resume summary:
${summarizeResumeForPrompt(resumeSnapshot)}

Interview config:
- Target role: ${config.role}${config.customRole ? ` (${config.customRole})` : ''}
- Experience level: ${config.experienceLevel}
- Focus: ${config.focus}
- Current difficulty: ${difficulty}

Topics already covered: ${topicsCovered.join(', ') || 'none'}
Weak topics so far: ${weakTopics.join(', ') || 'none'}
Questions already asked - do not repeat or rephrase these:
${usedQuestionText(transcript)}

${
  isFirstQuestion
    ? `This is the first question. Ask a natural opener appropriate for the role AND matching the "${config.focus}" focus area (e.g. if focus is "technical", open with a light technical warm-up grounded in their resume rather than a generic "tell me about yourself").`
    : `Last question: "${transcript[transcript.length - 1].question}"
Last answer: "${transcript[transcript.length - 1].answer}"
Last evaluation feedback: "${transcript[transcript.length - 1].evaluation?.feedback || 'N/A'}"

Generate the NEXT question at difficulty level "${difficulty}". If the candidate struggled last time, ask something more fundamental on the same topic before moving on. If they did well, move to a new topic or go deeper.`
}
`;

  try {
    const shouldEnforceFocus = config.focus && !['mixed', 'custom'].includes(config.focus);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const retryPrompt = attempt === 0
        ? userPrompt
        : `${userPrompt}

The previous generated question was too similar to an earlier one. Generate a completely different question now.`;
      const result = await callOpenRouterJSON(systemPrompt, retryPrompt);
      const candidate = {
        question: result.question,
        topic: result.topic || 'general',
        focusArea: normalizeFocusArea(shouldEnforceFocus ? config.focus : result.focusArea, config.focus),
      };
      if (!isRepeatedQuestion(candidate.question, transcript)) {
        return candidate;
      }
    }

    return fallbackQuestion({ config, difficulty, isFirstQuestion, transcript });
  } catch (err) {
    // Rule-based fallback so the interview never hard-fails
    return fallbackQuestion({ config, difficulty, isFirstQuestion, transcript });
  }
}

function fallbackQuestion({ config, difficulty, isFirstQuestion, transcript = [] }) {
  const focusArea = normalizeFocusArea(config.focus, 'technical');
  if (isFirstQuestion) {
    return { question: 'Tell me about yourself and your background.', topic: 'introduction', focusArea: 'communication' };
  }

  const banks = {
    fundamental: [
      'Can you explain one basic concept from your target role in simple terms?',
      'What is the difference between data, information, and a useful insight?',
      'How do you usually approach learning a new technical concept?',
      `Which basic ${config.role} skill do you feel most confident about, and why?`,
    ],
    easy: [
      `Which ${config.role} project from your resume are you most confident explaining?`,
      'Can you explain one challenge you faced in a project and how you solved it?',
      'How do you check whether your work is correct before submitting it?',
      'What tools or technologies have you used recently, and where did you use them?',
    ],
    medium: [
      `Can you walk me through one recent ${config.role} project from problem to result?`,
      'How would you break down a new requirement before starting implementation?',
      'Can you describe a time when you improved the quality or performance of your work?',
      'How do you explain technical decisions to a non-technical person?',
    ],
    hard: [
      'How would you design a system to handle a sudden 10x spike in traffic?',
      'How would you debug a production issue when the root cause is unclear?',
      'What trade-offs would you consider when choosing between speed, cost, and reliability?',
      'How would you improve an existing project if you had one extra week?',
    ],
    very_hard: [
      'How would you debug a production issue with no logs and no reproduction steps?',
      'How would you design a scalable solution while keeping cost and maintainability under control?',
      'How would you identify hidden failure points in a system before launch?',
      'How would you mentor a junior teammate who is repeatedly making the same technical mistake?',
    ],
  };

  const bank = banks[difficulty] || banks.medium;
  const question = bank.find((item) => !isRepeatedQuestion(item, transcript))
    || `Give me a new example from your ${config.role} preparation that we have not discussed yet.`;
  return { question, topic: 'general', focusArea };
}

// ---------------------------------------------------------------------------
// Answer evaluation
// ---------------------------------------------------------------------------

function isNoScoreAnswer(answer) {
  const normalized = String(answer || '').trim().toLowerCase();
  return !normalized;
}

function isZeroScorePlaceholder(answer) {
  const normalized = String(answer || '').trim().toLowerCase();
  if (!normalized) return false;

  const compact = normalized.replace(/[^a-z0-9]/g, '');
  return [
    'na',
    'no',
    'none',
    'nil',
    'null',
    'noanswer',
    'notapplicable',
    'notavailable',
  ].includes(compact);
}

function isGibberishAnswer(answer) {
  const normalized = String(answer || '').trim().toLowerCase();
  if (!normalized) return false;

  const compactWords = normalized
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  if (!compactWords.length) return true;
  if (compactWords.length > 3) return false;

  return compactWords.every((word) => {
    const vowels = (word.match(/[aeiou]/g) || []).length;
    const consonants = (word.match(/[bcdfghjklmnpqrstvwxyz]/g) || []).length;
    const repeatedChars = /(.)\1{3,}/.test(word);
    const longNoVowels = word.length >= 5 && vowels === 0;
    const consonantHeavy = word.length >= 7 && consonants >= vowels * 4;
    const keyboardNoise = word.length >= 8 && !/\b(project|skill|team|api|data|resume|role|user|client|work|code|design|built|create|solve|interview)\b/i.test(word);

    return repeatedChars || longNoVowels || consonantHeavy || keyboardNoise;
  });
}

function zeroScoreEvaluation(feedback, flags = []) {
  return {
    correctness: 0,
    scoreDelta: -5,
    feedback,
    flags,
    noScore: false,
  };
}

/**
 * Evaluates a candidate's answer and returns the scoring delta to apply
 * to knowledgeScore, plus feedback used internally and for the final report.
 *
 * @returns {Promise<{correctness:number, scoreDelta:number, feedback:string, flags:string[], noScore?:boolean}>}
 */
async function evaluateAnswer({ question, topic, answer, config, knowledgeScore }) {
  if (isNoScoreAnswer(answer)) {
    return {
      correctness: 0,
      scoreDelta: -5,
      feedback: 'No scorable answer provided.',
      flags: ['no_answer', 'no_score_placeholder'],
      noScore: true,
    };
  }

  if (isZeroScorePlaceholder(answer)) {
    return zeroScoreEvaluation('Placeholder answers like N/A cannot be scored as interview responses.', ['placeholder_answer', 'incomplete']);
  }

  if (isGibberishAnswer(answer)) {
    return zeroScoreEvaluation('The answer does not contain meaningful interview content, so it scored 0%.', ['gibberish_answer', 'incomplete']);
  }

  const systemPrompt = `You are grading a mock interview answer.
Respond ONLY with a JSON object:
{ "correctness": number (0-100), "scoreDelta": number (-10 to +10), "feedback": string (1-2 sentences), "flags": string[] }
flags may include values like "low_confidence", "incorrect_concept", "incomplete", "strong_answer".
Be fair but rigorous, consistent with the stated experience level.`;

  const userPrompt = `
Role: ${config.role}, Experience: ${config.experienceLevel}
Topic: ${topic}
Question: "${question}"
Candidate's answer: "${answer}"
Current knowledge score: ${knowledgeScore}/100

Grade the answer and return the JSON.`;

  try {
    const result = await callOpenRouterJSON(systemPrompt, userPrompt);
    return {
      correctness: clampNumber(result.correctness, 0, 100, 50),
      scoreDelta: clampNumber(result.scoreDelta, -10, 10, 0),
      feedback: result.feedback || '',
      flags: Array.isArray(result.flags) ? result.flags : [],
      noScore: false,
    };
  } catch (err) {
    return fallbackEvaluation({ question, topic, answer });
  }
}

function fallbackEvaluation({ question, topic, answer }) {
  const result = scoreAnswerLocally({ question, topic, answer });
  return {
    correctness: result.correctness,
    scoreDelta: result.scoreDelta,
    feedback: result.feedback,
    flags: result.flags,
    noScore: false,
  };
}

function scoreAnswerLocally({ question = '', topic = '', answer = '' }) {
  const cleanAnswer = String(answer || '').trim();
  const wordCount = cleanAnswer.split(/\s+/).filter(Boolean).length;
  const answerTokens = keywordSet(cleanAnswer);
  const promptTokens = keywordSet(`${question} ${topic}`);
  const overlap = [...promptTokens].filter((word) => answerTokens.has(word)).length;
  const relevanceRatio = promptTokens.size ? overlap / promptTokens.size : 0;

  let score = 18;
  const flags = [];

  if (wordCount < 4) {
    score = 12;
    flags.push('incomplete');
  } else if (wordCount < 12) {
    score += 14;
    flags.push('brief_answer');
  } else if (wordCount < 35) {
    score += 28;
  } else if (wordCount < 80) {
    score += 42;
  } else {
    score += 50;
  }

  if (relevanceRatio >= 0.35) score += 14;
  else if (relevanceRatio >= 0.18) score += 8;
  else if (promptTokens.size > 0) {
    score -= 6;
    flags.push('low_relevance');
  }

  if (/\b(because|therefore|so that|for example|for instance|result|impact|improve|reduced|increased|solved|built|created|implemented|designed|optimized|measured)\b/i.test(cleanAnswer)) {
    score += 8;
  }

  if (/\b(i don't know|dont know|not sure|maybe|i guess|no idea|can't answer|cannot answer)\b/i.test(cleanAnswer)) {
    score -= 18;
    flags.push('low_confidence');
  }

  if (/[0-9%]/.test(cleanAnswer) || /\b(project|team|user|client|database|api|model|resume|role|skill|experience)\b/i.test(cleanAnswer)) {
    score += 5;
  }

  const correctness = clampNumber(score, 0, 100, 35);
  const scoreDelta = Math.round((correctness - 50) / 8);

  if (correctness >= 78) flags.push('strong_answer');
  if (correctness < 45 && !flags.includes('incomplete')) flags.push('needs_detail');

  return {
    correctness,
    scoreDelta: clampNumber(scoreDelta, -10, 10, 0),
    feedback: fallbackFeedback(correctness),
    flags,
  };
}

function fallbackFeedback(score) {
  if (score >= 78) return 'Strong answer with useful detail and clear relevance to the question.';
  if (score >= 62) return 'Good answer, but adding more specific examples or measurable impact would make it stronger.';
  if (score >= 42) return 'Answer is partially clear but needs more structure, detail, and direct relevance.';
  return 'Answer is too brief or unclear, so it needs more explanation before it can score well.';
}

function keywordSet(value) {
  const stopWords = new Set([
    'the', 'and', 'for', 'that', 'this', 'with', 'you', 'your', 'about', 'what',
    'how', 'why', 'can', 'could', 'would', 'should', 'tell', 'describe', 'explain',
    'from', 'into', 'have', 'has', 'had', 'are', 'was', 'were', 'will', 'role',
  ]);

  return new Set(
    String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 2 && !stopWords.has(word))
  );
}

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (Number.isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

// ---------------------------------------------------------------------------
// End-of-interview decision
// ---------------------------------------------------------------------------

/**
 * Decides whether the interview should end, based on elapsed time and
 * question count. Kept simple and deterministic (not LLM-based) so the
 * interview always terminates predictably.
 */
function shouldEndInterview({ startedAt, config, transcript }) {
  const elapsedMinutes = (Date.now() - new Date(startedAt).getTime()) / 60000;
  if (elapsedMinutes >= config.durationMinutes) {
    return { end: true, reason: 'time_limit_reached' };
  }

  // Safety cap so a very fast test-taker doesn't get an endless interview
  const MAX_QUESTIONS = 20;
  if (transcript.length >= MAX_QUESTIONS) {
    return { end: true, reason: 'max_questions_reached' };
  }

  return { end: false };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export {
  computeDifficultyBand,
  applyScoreDelta,
  resolveEffectiveDifficulty,
  generateNextQuestion,
  evaluateAnswer,
  isNoScoreAnswer,
  shouldEndInterview,
};
