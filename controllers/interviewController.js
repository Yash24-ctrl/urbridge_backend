import MockInterviewSession from '../models/MockInterviewSession.js';
import InterviewReport from '../models/InterviewReport.js';
import {
  applyScoreDelta,
  generateNextQuestion,
  evaluateAnswer,
  shouldEndInterview,
} from '../services/interviewAgentService.js';

const STARTING_KNOWLEDGE_SCORE = 50;

// ---------------------------------------------------------------------------
// POST /api/interview/start
// Body: { resumeSnapshot, role, customRole?, experienceLevel, difficultyMode, durationMinutes, focus }
// AI Interview uses only the resume uploaded inside AI Interview. It must not reuse ATS checker profiles.
// ---------------------------------------------------------------------------
async function startInterview(req, res) {
  try {
    const userId = req.user._id;
    const { resumeSnapshot, role, customRole, experienceLevel, difficultyMode, durationMinutes, focus } = req.body;

    if (!role || !experienceLevel) {
      return res.status(400).json({ message: 'role and experienceLevel are required' });
    }

    if (!resumeSnapshot || typeof resumeSnapshot !== 'object') {
      return res.status(400).json({ message: 'No AI Interview resume found. Please upload a resume in AI Interview first.' });
    }

    const interviewResumeSnapshot = {
      name: String(resumeSnapshot.name || '').slice(0, 120),
      skills: Array.isArray(resumeSnapshot.skills) ? resumeSnapshot.skills.slice(0, 30).map(String) : [],
      experience: Number(resumeSnapshot.experience) || 0,
      education: String(resumeSnapshot.education || '').slice(0, 200),
      customEducation: String(resumeSnapshot.customEducation || '').slice(0, 200),
      certifications: Array.isArray(resumeSnapshot.certifications) ? resumeSnapshot.certifications.slice(0, 20).map(String) : [],
      completedProjects: String(resumeSnapshot.completedProjects || '').slice(0, 2000),
      desiredJobRoles: String(resumeSnapshot.desiredJobRoles || role || '').slice(0, 200),
      currentCity: String(resumeSnapshot.currentCity || '').slice(0, 120),
      previousJobTitle: String(resumeSnapshot.previousJobTitle || '').slice(0, 200),
      fullResumeText: String(resumeSnapshot.fullResumeText || '').slice(0, 8000),
      source: 'ai-interview-upload',
      fileName: String(resumeSnapshot.fileName || '').slice(0, 240),
    };
    const config = {
      role,
      customRole,
      experienceLevel,
      difficultyMode: difficultyMode || 'adaptive',
      durationMinutes: durationMinutes || 30,
      focus: focus || 'mixed',
    };

    const session = await MockInterviewSession.create({
      user: userId,
      resumeSnapshot: interviewResumeSnapshot,
      config,
      knowledgeScore: STARTING_KNOWLEDGE_SCORE,
      topicsCovered: [],
      weakTopics: [],
      transcript: [],
      status: 'in_progress',
      startedAt: new Date(),
      lastActivityAt: new Date(),
    });

    const firstQuestion = await generateNextQuestion({
      resumeSnapshot: session.resumeSnapshot,
      config: session.config,
      knowledgeScore: session.knowledgeScore,
      topicsCovered: session.topicsCovered,
      weakTopics: session.weakTopics,
      transcript: session.transcript,
    });

    // Push the question as a transcript entry with no answer yet;
    // /answer will find this entry (last one, answeredAt not set) and fill it in.
    session.transcript.push({
      questionId: `${session._id}-q${session.transcript.length + 1}`,
      question: firstQuestion.question,
      topic: firstQuestion.topic,
      focusArea: firstQuestion.focusArea,
      difficultyAtAsk: session.knowledgeScore,
    });
    await session.save();

    return res.status(201).json({
      sessionId: session._id,
      question: firstQuestion,
      knowledgeScore: session.knowledgeScore,
      config: session.config,
      startedAt: session.startedAt,
    });
  } catch (err) {
    console.error('startInterview error:', err);
    return res.status(500).json({ message: 'Failed to start interview' });
  }
}

// ---------------------------------------------------------------------------
// POST /api/interview/answer
// Body: { sessionId, answer }
// Evaluates the pending question, updates score, and either returns the next
// question or ends the interview and returns the final report.
// ---------------------------------------------------------------------------
async function submitAnswer(req, res) {
  try {
    const userId = req.user._id;
    const { sessionId, answer } = req.body;

    const session = await MockInterviewSession.findOne({ _id: sessionId, user: userId });
    if (!session) return res.status(404).json({ message: 'Session not found' });
    if (session.status !== 'in_progress') {
      return res.status(400).json({ message: `Session is already ${session.status}` });
    }

    const pending = session.transcript[session.transcript.length - 1];
    if (!pending || pending.answeredAt) {
      return res.status(400).json({ message: 'No pending question awaiting an answer' });
    }

    // 1. Evaluate the answer
    const evaluation = await evaluateAnswer({
      question: pending.question,
      topic: pending.topic,
      answer,
      config: session.config,
      knowledgeScore: session.knowledgeScore,
    });

    pending.answer = answer;
    pending.answeredAt = new Date();
    pending.evaluation = {
      correctness: evaluation.correctness,
      scoreDelta: evaluation.scoreDelta,
      feedback: evaluation.feedback,
      flags: evaluation.flags,
    };

    // 2. Update running state
    session.knowledgeScore = applyScoreDelta(session.knowledgeScore, evaluation.scoreDelta);
    if (pending.topic && !session.topicsCovered.includes(pending.topic)) {
      session.topicsCovered.push(pending.topic);
    }
    const struggled = evaluation.correctness < 50 || evaluation.flags.includes('incorrect_concept');
    if (struggled && pending.topic && !session.weakTopics.includes(pending.topic)) {
      session.weakTopics.push(pending.topic);
    }
    session.lastActivityAt = new Date();

    // 3. Decide whether to continue
    const decision = shouldEndInterview({
      startedAt: session.startedAt,
      config: session.config,
      transcript: session.transcript,
    });

    if (decision.end) {
      session.status = 'completed';
      session.endedAt = new Date();
      await session.save();

      const report = await buildBasicReport(session);

      return res.status(200).json({
        ended: true,
        reason: decision.reason,
        lastEvaluation: evaluation,
        report,
      });
    }

    // 4. Generate the next question
    const nextQuestion = await generateNextQuestion({
      resumeSnapshot: session.resumeSnapshot,
      config: session.config,
      knowledgeScore: session.knowledgeScore,
      topicsCovered: session.topicsCovered,
      weakTopics: session.weakTopics,
      transcript: session.transcript,
    });

    session.transcript.push({
      questionId: `${session._id}-q${session.transcript.length + 1}`,
      question: nextQuestion.question,
      topic: nextQuestion.topic,
      focusArea: nextQuestion.focusArea,
      difficultyAtAsk: session.knowledgeScore,
    });
    await session.save();

    return res.status(200).json({
      ended: false,
      lastEvaluation: evaluation,
      knowledgeScore: session.knowledgeScore,
      nextQuestion,
    });
  } catch (err) {
    console.error('submitAnswer error:', err);
    return res.status(500).json({ message: 'Failed to process answer' });
  }
}

// ---------------------------------------------------------------------------
// POST /api/interview/end
// Body: { sessionId }
// Lets the user manually end early (e.g. "End Interview" button).
// ---------------------------------------------------------------------------
async function endInterview(req, res) {
  try {
    const userId = req.user._id;
    const { sessionId } = req.body;

    const session = await MockInterviewSession.findOne({ _id: sessionId, user: userId });
    if (!session) return res.status(404).json({ message: 'Session not found' });

    if (session.status === 'completed') {
      const existingReport = await InterviewReport.findOne({ session: session._id });
      return res.status(200).json({ ended: true, report: existingReport });
    }

    session.status = 'completed';
    session.endedAt = new Date();
    await session.save();

    const report = await buildBasicReport(session);
    return res.status(200).json({ ended: true, reason: 'user_ended', report });
  } catch (err) {
    console.error('endInterview error:', err);
    return res.status(500).json({ message: 'Failed to end interview' });
  }
}

// ---------------------------------------------------------------------------
// GET /api/interview/history
// Returns past sessions/reports for the History Dashboard.
// ---------------------------------------------------------------------------
async function getHistory(req, res) {
  try {
    const userId = req.user._id;
    const reports = await InterviewReport.find({ user: userId }).sort({ createdAt: -1 });
    return res.status(200).json({ reports });
  } catch (err) {
    console.error('getHistory error:', err);
    return res.status(500).json({ message: 'Failed to fetch interview history' });
  }
}


// ---------------------------------------------------------------------------
// DELETE /api/interview/history/:reportId
// Deletes one interview history report for the logged-in user.
// ---------------------------------------------------------------------------
async function deleteHistoryReport(req, res) {
  try {
    const userId = req.user._id;
    const { reportId } = req.params;

    const report = await InterviewReport.findOne({ _id: reportId, user: userId });
    if (!report) return res.status(404).json({ message: 'Interview history not found' });

    await MockInterviewSession.updateOne(
      { _id: report.session, user: userId },
      { $set: { reportGenerated: false }, $unset: { report: '' } }
    );
    await InterviewReport.deleteOne({ _id: report._id, user: userId });

    return res.status(200).json({ deleted: true, reportId });
  } catch (err) {
    console.error('deleteHistoryReport error:', err);
    return res.status(500).json({ message: 'Failed to delete interview history' });
  }
}

// ---------------------------------------------------------------------------
// GET /api/interview/:sessionId
// Fetch a single session (e.g. to resume or view the live transcript so far).
// ---------------------------------------------------------------------------
async function getSession(req, res) {
  try {
    const userId = req.user._id;
    const session = await MockInterviewSession.findOne({ _id: req.params.sessionId, user: userId });
    if (!session) return res.status(404).json({ message: 'Session not found' });
    return res.status(200).json({ session });
  } catch (err) {
    console.error('getSession error:', err);
    return res.status(500).json({ message: 'Failed to fetch session' });
  }
}

// ---------------------------------------------------------------------------
// Minimal report builder (placeholder).
// NOTE: this is intentionally simple for now â€” step 4 will replace this with
// a proper AI-generated summary, recommended topics, and PDF export. Kept
// here so /answer and /end have something real to return meanwhile.
// ---------------------------------------------------------------------------

function clampScore(value) {
  const score = Math.round(Number(value) || 0);
  return Math.max(0, Math.min(100, score));
}

function averageScores(turns, predicate, fallback) {
  const selected = turns.filter(predicate);
  const source = selected.length ? selected : turns;
  if (!source.length) return fallback;
  const total = source.reduce((sum, turn) => sum + (turn.evaluation?.correctness || 0), 0);
  return total / source.length;
}

function answerLengthScore(turns, fallback) {
  if (!turns.length) return fallback;
  const averageLength = turns.reduce((sum, turn) => sum + String(turn.answer || '').trim().length, 0) / turns.length;
  if (averageLength >= 420) return fallback + 8;
  if (averageLength >= 220) return fallback + 4;
  if (averageLength >= 90) return fallback;
  if (averageLength >= 35) return fallback - 8;
  return fallback - 18;
}

function buildSubScores(answered, overallScore) {
  if (!answered.length) {
    return {
      technical: 0,
      communication: 0,
      confidence: 0,
      problemSolving: 0,
      projectExplanation: 0,
    };
  }

  const flags = answered.flatMap((turn) => turn.evaluation?.flags || []);
  const hasIncomplete = flags.includes('incomplete') || flags.includes('no_answer');
  const hasIncorrectConcept = flags.includes('incorrect_concept');
  const hasLowConfidence = flags.includes('low_confidence');
  const technicalAverage = averageScores(answered, (turn) => ['technical', 'system_design'].includes(turn.focusArea), overallScore);
  const communicationBase = answerLengthScore(answered, overallScore);
  const projectAverage = averageScores(answered, (turn) => turn.focusArea === 'projects' || /project/i.test(turn.topic || turn.question || ''), overallScore);
  const problemAverage = averageScores(answered, (turn) => /problem|debug|design|approach|solve|trade.?off/i.test(`${turn.topic || ''} ${turn.question || ''}`), overallScore);

  return {
    technical: clampScore(technicalAverage + (hasIncorrectConcept ? -10 : 3)),
    communication: clampScore(communicationBase + (hasIncomplete ? -8 : 2)),
    confidence: clampScore(overallScore + (hasLowConfidence ? -12 : answered.length >= 3 ? 5 : -3)),
    problemSolving: clampScore(problemAverage + (hasIncorrectConcept ? -6 : 4)),
    projectExplanation: clampScore(projectAverage + (projectAverage === overallScore ? -4 : 5)),
  };
}

async function buildBasicReport(session) {
  const existingReport = await InterviewReport.findOne({ session: session._id });
  if (existingReport) return existingReport;

  const answered = session.transcript.filter((t) => t.answeredAt && String(t.answer || '').trim());
  const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

  const overallScore = Math.round(avg(answered.map((t) => t.evaluation?.correctness || 0)));
  const answeredWell = answered.filter((t) => (t.evaluation?.correctness || 0) >= 70).length;
  const roleLabel = session.config.customRole || session.config.role;
  const interviewTurns = answered.map((turn, index) => ({
    question: turn.question || `Question ${index + 1}`,
    answer: turn.answer || '',
    topic: turn.topic || '',
    focusArea: turn.focusArea || '',
    score: Math.round(turn.evaluation?.correctness || 0),
    feedback: turn.evaluation?.feedback || '',
  }));

  const subScores = buildSubScores(answered, overallScore);

  const report = await InterviewReport.create({
    user: session.user,
    session: session._id,
    role: roleLabel,
    experienceLevel: session.config.experienceLevel,
    focus: session.config.focus,
    durationMinutes: session.config.durationMinutes,
    overallScore,
    subScores,
    strengths: session.topicsCovered.filter((t) => !session.weakTopics.includes(t)),
    weakAreas: session.weakTopics,
    recommendedTopics: session.weakTopics,
    summary: answered.length
      ? `You answered ${answeredWell}/${answered.length} questions well. Review the detailed answer feedback below to improve your next attempt.`
      : 'Time is up. No submitted answers were available for scoring in this attempt.',
    questionsCount: answered.length,
    questionsAnsweredWell: answeredWell,
    interviewTurns,
  });

  session.reportGenerated = true;
  session.report = report._id;
  await session.save();

  return report;
}

export {
  startInterview,
  submitAnswer,
  endInterview,
  getHistory,
  deleteHistoryReport,
  getSession,
};