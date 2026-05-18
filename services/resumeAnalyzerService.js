const EDUCATION_WEIGHTS = {
  diploma: 55,
  bachelors: 74,
  masters: 86,
  phd: 94,
  other: 60,
};

const ROLE_SKILL_MAP = {
  "data scientist": [
    "python",
    "sql",
    "machine learning",
    "statistics",
    "pandas",
    "numpy",
    "scikit-learn",
    "data visualization",
    "feature engineering",
    "model evaluation",
    "deep learning",
    "tableau",
  ],
  "data analyst": [
    "sql",
    "excel",
    "python",
    "power bi",
    "tableau",
    "data visualization",
    "statistics",
    "reporting",
    "dashboards",
    "data cleaning",
  ],
  "machine learning engineer": [
    "python",
    "sql",
    "machine learning",
    "scikit-learn",
    "tensorflow",
    "pytorch",
    "mlops",
    "feature engineering",
    "model deployment",
    "docker",
    "api development",
    "aws",
  ],
  "backend developer": [
    "node.js",
    "express",
    "api development",
    "sql",
    "mongodb",
    "postgresql",
    "system design",
    "authentication",
    "docker",
    "git",
    "redis",
    "testing",
  ],
  "frontend developer": [
    "html",
    "css",
    "javascript",
    "react",
    "responsive design",
    "typescript",
    "state management",
    "accessibility",
    "ui optimization",
    "testing",
    "vite",
    "redux",
  ],
  "full stack developer": [
    "html",
    "css",
    "javascript",
    "react",
    "node.js",
    "express",
    "sql",
    "mongodb",
    "api development",
    "git",
    "docker",
    "authentication",
  ],
  "software engineer": [
    "data structures",
    "algorithms",
    "git",
    "testing",
    "api development",
    "sql",
    "debugging",
    "system design",
    "object oriented programming",
    "problem solving",
  ],
  "devops engineer": [
    "docker",
    "kubernetes",
    "ci/cd",
    "aws",
    "linux",
    "terraform",
    "monitoring",
    "shell scripting",
    "github actions",
    "networking",
  ],
};

const PROJECT_STRENGTH_KEYWORDS = [
  "built",
  "developed",
  "designed",
  "implemented",
  "deployed",
  "optimized",
  "improved",
  "reduced",
  "increased",
  "automated",
  "accuracy",
  "latency",
  "performance",
  "%",
];

const GENERIC_ATS_SKILLS = [
  "communication",
  "problem solving",
  "team collaboration",
  "git",
  "documentation",
];

function normalizeText(value = "") {
  return String(value).trim().toLowerCase();
}

function normalizeEducation(value = "", customValue = "") {
  const direct = normalizeText(value);
  if (direct && direct !== "other") {
    if (direct.includes("bachelor")) return "bachelors";
    if (direct.includes("master")) return "masters";
    if (direct.includes("phd")) return "phd";
    if (direct.includes("diploma")) return "diploma";
  }

  const custom = normalizeText(customValue);
  if (custom.includes("bachelor")) return "bachelors";
  if (custom.includes("master")) return "masters";
  if (custom.includes("phd")) return "phd";
  if (custom.includes("diploma")) return "diploma";
  return "other";
}

function normalizeSkill(skill = "") {
  return normalizeText(skill).replace(/\s+/g, " ");
}

function tokenizeSkills(skills = []) {
  return [...new Set(skills.map(normalizeSkill).filter(Boolean))];
}

function resolveRole(desiredRole = "") {
  const normalizedRole = normalizeText(desiredRole);
  const matchedRole = Object.keys(ROLE_SKILL_MAP).find((role) =>
    normalizedRole.includes(role)
  );

  if (matchedRole) {
    return {
      roleKey: matchedRole,
      label: matchedRole.replace(/\b\w/g, (char) => char.toUpperCase()),
      requiredSkills: ROLE_SKILL_MAP[matchedRole],
    };
  }

  return {
    roleKey: "generic",
    label: desiredRole.trim() || "your target role",
    requiredSkills: GENERIC_ATS_SKILLS,
  };
}

function getMatchedSkills(userSkills, targetSkills) {
  return targetSkills.filter((targetSkill) => {
    const normalizedTarget = normalizeSkill(targetSkill);
    return userSkills.some(
      (userSkill) =>
        userSkill === normalizedTarget ||
        userSkill.includes(normalizedTarget) ||
        normalizedTarget.includes(userSkill)
    );
  });
}

function computeProjectQuality(projectText = "", matchedSkills = []) {
  const normalizedProject = normalizeText(projectText);
  const wordCount = normalizedProject ? normalizedProject.split(/\s+/).length : 0;
  const keywordHits = PROJECT_STRENGTH_KEYWORDS.filter((keyword) =>
    normalizedProject.includes(keyword)
  ).length;
  const roleEvidenceHits = matchedSkills.filter((skill) =>
    normalizedProject.includes(normalizeSkill(skill))
  ).length;
  const hasMetrics = /\b\d+(\.\d+)?%?\b/.test(projectText);

  const lengthScore = Math.min(40, wordCount * 1.5);
  const keywordScore = Math.min(30, keywordHits * 6);
  const evidenceScore = Math.min(20, roleEvidenceHits * 5);
  const metricsScore = hasMetrics ? 10 : 0;

  return {
    wordCount,
    keywordHits,
    roleEvidenceHits,
    hasMetrics,
    score: Math.min(100, Math.round(lengthScore + keywordScore + evidenceScore + metricsScore)),
  };
}

// AI-powered suggestion generation
async function generateAISuggestions(data) {
  const prompt = `You are a senior technical recruiter at Google, Amazon, and Microsoft with 15 years of hiring experience.

Analyze this candidate profile:
- Target Role: ${data.jobRole}
- Years of Experience: ${data.yearsOfExperience}
- Education: ${data.educationLevel}
- Current Skills: ${data.skills.join(', ')}
- Projects: ${data.projects || 'None provided'}
- Certifications: ${data.certifications.length > 0 ? data.certifications.join(', ') : 'None'}
- Current City: ${data.city || 'Not specified'}
- Previous Job Title: ${data.previousJobTitle || 'Not specified'}

Missing critical skills for ${data.jobRole}: ${data.missingSkills.join(', ')}

Generate exactly 8 resume improvement suggestions.

STRICT RULES:
1. Every suggestion must be UNIQUE — never repeat the same advice twice even in different words
2. Every suggestion must reference the candidate's ACTUAL data (mention their real skills, real project, real role)
3. Be SPECIFIC — say exactly what to add, not just "improve your skills"
4. Tailor advice to their experience level (${data.yearsOfExperience} years) — don't suggest senior-level things to a junior candidate
5. Prioritize suggestions by impact — highest impact first
6. Do NOT give generic advice like "add more details" or "improve your resume"

Return ONLY this JSON (no markdown, no extra text):
{
  "suggestions": [
    "Specific suggestion 1 mentioning their actual data",
    "Specific suggestion 2 mentioning their actual data",
    "Specific suggestion 3",
    "Specific suggestion 4",
    "Specific suggestion 5",
    "Specific suggestion 6",
    "Specific suggestion 7",
    "Specific suggestion 8"
  ]
}`;

  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY || 'sk-ant-default-key',
    });

    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0].text;
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    
    // Strict duplicate removal - check for semantic similarity
    const uniqueSuggestions = [];
    const usedTopics = new Set();
    
    for (const suggestion of parsed.suggestions) {
      // Extract main topic (first 5 words)
      const topicWords = suggestion.toLowerCase().split(' ').slice(0, 5).join(' ');
      
      // Check if this topic is already covered
      let isDuplicate = false;
      for (const usedTopic of usedTopics) {
        const similarity = topicWords.split(' ').filter(w => usedTopic.includes(w)).length;
        if (similarity >= 3) { // 60% overlap = duplicate
          isDuplicate = true;
          break;
        }
      }
      
      if (!isDuplicate) {
        uniqueSuggestions.push(suggestion);
        usedTopics.add(topicWords);
      }
      
      if (uniqueSuggestions.length >= 8) break;
    }

    return uniqueSuggestions;
  } catch (error) {
    console.error('AI suggestion generation failed, using fallback:', error.message);
    // Fallback to smart rule-based suggestions
    return buildSmartFallbackSuggestions(data);
  }
}

// Smart fallback suggestions when AI fails
function buildSmartFallbackSuggestions(data) {
  const suggestions = [];
  const usedTopics = new Set(); // Track topics to prevent duplicates
  
  // Helper to add suggestion only if topic not used
  const addSuggestion = (topic, suggestion) => {
    if (!usedTopics.has(topic)) {
      suggestions.push(suggestion);
      usedTopics.add(topic);
    }
  };
  
  // Priority 1: Missing Skills (unique topic)
  if (data.missingSkills.length > 0) {
    addSuggestion('missing_skills', 
      `Add these critical ${data.jobRole} skills to your resume: ${data.missingSkills.slice(0, 3).join(', ')}. These are mentioned in 70%+ of job postings for this role.`
    );
  }
  
  // Priority 2: Projects Detail (unique topic)
  if (!data.projects || data.projects.length < 30) {
    addSuggestion('projects_detail',
      `Your ${data.jobRole} project section needs more detail. Add specific technologies used, the problem you solved, and measurable outcomes (e.g., "Improved model accuracy by 15%").`
    );
  } else if (!data.projects.match(/\d+%?/)) {
    addSuggestion('projects_metrics',
      `Add metrics to your projects. For example: "Built a ${data.jobRole} tool that reduced processing time by 40%" or "Improved accuracy from 85% to 92%".`
    );
  }
  
  // Priority 3: Experience-specific (unique topic)
  if (data.yearsOfExperience <= 1) {
    addSuggestion('entry_level_projects',
      `As an entry-level ${data.jobRole} candidate with ${data.yearsOfExperience} year${data.yearsOfExperience === 1 ? '' : 's'} of experience, add 2-3 personal or academic projects that demonstrate hands-on ${data.missingSkills[0] || data.skills[0] || 'technical'} skills.`
    );
  } else if (data.yearsOfExperience <= 3) {
    addSuggestion('mid_level_impact',
      `With ${data.yearsOfExperience} years of ${data.jobRole} experience, quantify your impact: add metrics like "Led team of 3 developers" or "Reduced API response time by 200ms".`
    );
  } else if (data.yearsOfExperience <= 6) {
    addSuggestion('senior_level_leadership',
      `With ${data.yearsOfExperience} years in ${data.jobRole}, highlight leadership experience: mention team size, project budgets, or strategic initiatives you've led.`
    );
  }
  
  // Priority 4: Certifications (unique topic)
  if (data.certifications.length === 0) {
    addSuggestion('no_certifications',
      `You don't have any certifications listed. As a fresher, completing certifications in ${data.missingSkills[0] || data.jobRole} (like AWS Certified, Google Cloud, or Coursera courses) will significantly boost your resume credibility and score by 10-15 points.`
    );
  } else if (data.certifications.length === 1 && (data.certifications[0].toLowerCase() === 'n/a' || data.certifications[0].toLowerCase() === 'na')) {
    addSuggestion('na_certifications',
      `You mentioned "N/A" for certifications. Consider completing 1-2 role-specific certifications (e.g., ${data.missingSkills[0] || 'Python'} certification, AWS Cloud Practitioner, or free Coursera courses) to make your resume stand out and increase your score by 10+ points.`
    );
  } else if (data.certifications.length === 1) {
    addSuggestion('one_certification',
      `You have ${data.certifications[0]}. Add 1-2 more role-specific certifications to reach the maximum 15 points for this section.`
    );
  }
  
  // Priority 5: Education (unique topic)
  if (data.educationLevel === 'other' || data.educationLevel === 'diploma') {
    addSuggestion('education_boost',
      `Consider adding relevant coursework or online certifications from platforms like Coursera or edX to strengthen your academic profile for ${data.jobRole} roles.`
    );
  }
  
  // Priority 6: Skills Count (unique topic)
  if (data.skills.length < 5) {
    addSuggestion('skills_expansion',
      `Expand your skills section to at least 5-7 ${data.jobRole}-specific skills. Currently you have ${data.skills.length}. Add skills like ${data.missingSkills.slice(0, 2).join(', ')} if you know them.`
    );
  }
  
  // Priority 7: Role Alignment (unique topic)
  if (data.previousJobTitle && !normalizeText(data.previousJobTitle).includes(normalizeText(data.jobRole))) {
    addSuggestion('role_alignment',
      `Your previous title "${data.previousJobTitle}" doesn't clearly align with "${data.jobRole}". Consider emphasizing transferable skills and adding ${data.jobRole}-related keywords to bridge the gap.`
    );
  }
  
  // Priority 8: Resume Structure (unique topic)
  if (!usedTopics.has('resume_summary')) {
    addSuggestion('resume_summary',
      `Add a 2-3 line professional summary at the top of your resume tailored to ${data.jobRole} roles. Mention your ${data.yearsOfExperience} years of experience and top skills: ${data.skills.slice(0, 3).join(', ')}.`
    );
  }
  
  return suggestions.slice(0, 8);
}

function buildExperiencedSuggestions({
  score,
  skillsCount,
  certificationsCount,
  projectsText,
  experience,
  desiredRole,
  previousJobTitle,
  educationKey,
}) {
  const suggestions = [];

  // Skills suggestions
  if (skillsCount < 4) {
    suggestions.push("Add more relevant skills for your target role to boost your ATS score.");
  } else if (skillsCount >= 7) {
    suggestions.push("Great skill set! Make sure they match your desired job role keywords.");
  }

  // Certifications suggestions
  if (certificationsCount === 0) {
    suggestions.push("Adding industry-recognized certifications can significantly improve your score.");
  } else if (certificationsCount === 1) {
    suggestions.push("You have a certification — adding 1–2 more would strengthen your profile.");
  } else if (certificationsCount >= 3) {
    suggestions.push("Strong certifications! Ensure they are relevant to your desired role.");
  }

  // Projects suggestions
  if (!projectsText || projectsText.trim().length <= 20) {
    suggestions.push("Describe your projects in detail with measurable outcomes (e.g. improved performance by X%).");
  } else {
    suggestions.push("Good project descriptions. Add metrics and impact numbers where possible.");
  }

  // Role matching suggestions
  const normalizedRole = normalizeText(desiredRole);
  const normalizedPrevTitle = normalizeText(previousJobTitle);
  const roleMatches = normalizedRole && normalizedPrevTitle && (
    normalizedRole.includes(normalizedPrevTitle) ||
    normalizedPrevTitle.includes(normalizedRole) ||
    normalizedRole.split(/[|,]/).some(role => normalizedPrevTitle.includes(role.trim())) ||
    normalizedPrevTitle.split(/[|,]/).some(title => normalizedRole.includes(title.trim()))
  );

  if (roleMatches) {
    suggestions.push("Your previous job title aligns well with your desired role — highlight this clearly.");
  } else if (normalizedRole && normalizedPrevTitle) {
    suggestions.push("Consider tailoring your desired job role to better match your previous experience.");
  }

  // Experience suggestions
  if (experience >= 1 && experience <= 5) {
    suggestions.push("Early career — focus on certifications and projects to compensate for limited experience.");
  } else if (experience >= 11) {
    suggestions.push("Strong experience level — make sure your skills and role are updated to match senior-level expectations.");
  }

  // Education suggestions
  if (educationKey === "diploma" || educationKey === "other") {
    suggestions.push("Consider adding certifications or advanced coursework to strengthen your academic profile.");
  }

  // High score message
  if (score >= 85 && suggestions.length > 0) {
    suggestions.push("Your profile is strong for an experienced professional. Keep refining your achievements and keyword alignment.");
  }

  if (suggestions.length === 0) {
    suggestions.push("Your resume details are well aligned. Keep refining project impact, ATS wording, and the ordering of your strongest skills.");
  }

  return suggestions.slice(0, 5);
}

export function analyzeExperiencedProfile(profile) {
  const experience = Math.max(0, Number(profile.experience) || 0);
  const educationKey = normalizeEducation(profile.education, profile.customEducation);

  // Count skills (pipe-separated or array)
  const skillsArray = Array.isArray(profile.skills) ? profile.skills : [];
  const skillsCount = skillsArray.filter(s => String(s).trim()).length;

  // Count certifications (pipe-separated or array)
  const certifications = (Array.isArray(profile.certifications) ? profile.certifications : [])
    .map((item) => String(item).trim())
    .filter(Boolean);
  const certificationsCount = certifications.length;

  // STEP 2 — ATS SCORING LOGIC FOR EXPERIENCED USERS

  // Skills: 30% weight
  let skillsScore = 0;
  if (skillsCount === 0) skillsScore = 0;
  else if (skillsCount <= 3) skillsScore = 50;
  else if (skillsCount <= 6) skillsScore = 75;
  else skillsScore = 100;

  // Previous Job Title: 20% weight
  const previousJobTitle = String(profile.previousJobTitle || "").trim();
  const jobTitleScore = previousJobTitle ? 100 : 0;

  // Years of Experience: 15% weight
  let experienceScore = 0;
  if (experience >= 1 && experience <= 5) experienceScore = 50;
  else if (experience >= 6 && experience <= 10) experienceScore = 70;
  else if (experience >= 11 && experience <= 16) experienceScore = 85;
  else if (experience >= 17) experienceScore = 100;

  // Desired Job Roles: 15% weight
  const desiredRole = String(profile.desiredJobRoles || "").trim();
  let roleScore = desiredRole ? 100 : 0;

  // Bonus: if role partially matches Previous Job Title, add 5 bonus pts
  const normalizedRole = normalizeText(desiredRole);
  const normalizedPrevTitle = normalizeText(previousJobTitle);
  const roleMatches = normalizedRole && normalizedPrevTitle && (
    normalizedRole.includes(normalizedPrevTitle) ||
    normalizedPrevTitle.includes(normalizedRole) ||
    normalizedRole.split(/[|,]/).some(role => normalizedPrevTitle.includes(role.trim())) ||
    normalizedPrevTitle.split(/[|,]/).some(title => normalizedRole.includes(title.trim()))
  );
  if (roleMatches) {
    roleScore = Math.min(100, roleScore + 5);
  }

  // Certifications: 10% weight
  let certificationScore = 0;
  if (certificationsCount === 0) certificationScore = 0;
  else if (certificationsCount === 1) certificationScore = 60;
  else if (certificationsCount === 2) certificationScore = 80;
  else certificationScore = 100;

  // Completed Projects: 5% weight
  const projectsText = String(profile.completedProjects || "").trim();
  const projectScore = projectsText.length > 20 ? 100 : 0;

  // Education Level: 5% weight
  let educationScore = 0;
  if (educationKey === "phd" || educationKey === "masters") educationScore = 100;
  else if (educationKey === "bachelors") educationScore = 80;
  else if (educationKey === "diploma") educationScore = 60;
  else educationScore = 0;

  // Final Score = Sum of (field_score × weight)
  const finalScore = Math.round(
    skillsScore * 0.30 +
    jobTitleScore * 0.20 +
    experienceScore * 0.15 +
    roleScore * 0.15 +
    certificationScore * 0.10 +
    projectScore * 0.05 +
    educationScore * 0.05
  );

  const score = Math.max(0, Math.min(100, finalScore));

  // STEP 3 — SUGGESTIONS FOR EXPERIENCED USERS
  const suggestions = buildExperiencedSuggestions({
    score,
    skillsCount,
    certificationsCount,
    projectsText,
    experience,
    desiredRole,
    previousJobTitle,
    educationKey,
  });

  return {
    score,
    suggestions,
    diagnostics: {
      profileType: "experienced",
      skillsCount,
      certificationsCount,
      experience,
      educationKey,
    },
  };
}

export async function analyzeResumeProfile(profile) {
  const experience = Math.max(0, Number(profile.experience) || 0);
  const educationKey = normalizeEducation(profile.education, profile.customEducation);

  const userSkills = tokenizeSkills(profile.skills);
  const certifications = (Array.isArray(profile.certifications) ? profile.certifications : [])
    .map((item) => String(item).trim())
    .filter(Boolean);

  const roleContext = resolveRole(profile.desiredJobRoles);
  const matchedSkills = getMatchedSkills(userSkills, roleContext.requiredSkills);
  const missingSkills = roleContext.requiredSkills.filter(
    (skill) => !matchedSkills.includes(skill)
  );

  // CRITICAL SKILLS WEIGHTING
  const criticalSkills = ["python", "sql", "machine learning", "react", "node.js"];
  const skillCoverageScore =
    roleContext.requiredSkills.length > 0
      ? Math.round((matchedSkills.length / roleContext.requiredSkills.length) * 100)
      : Math.min(100, userSkills.length * 12);

  // 1. SKILLS MATCH SCORE (0-30 pts)
  const skillsMatchScore = Math.round((skillCoverageScore / 100) * 30);

  // 2. EXPERIENCE SCORE (0-20 pts) - FAIR BASED ON LEVEL
  let experienceScore = 0;
  if (experience <= 1) experienceScore = 8;
  else if (experience <= 3) experienceScore = 14;
  else if (experience <= 6) experienceScore = 17;
  else experienceScore = 20;

  // 3. PROJECT RELEVANCE SCORE (0-20 pts)
  const projectText = String(profile.completedProjects || "").trim();
  const normalizedProject = normalizeText(projectText);
  const wordCount = normalizedProject ? normalizedProject.split(/\s+/).length : 0;
  const roleEvidenceHits = matchedSkills.filter((skill) =>
    normalizedProject.includes(normalizeSkill(skill))
  ).length;
  const hasMetrics = /\b\d+(\.\d+)?%?\b/.test(projectText);
  const hasResults = /\b(reduced|increased|improved|optimized|automated)\b/.test(projectText);

  let projectScore = 0;
  if (roleEvidenceHits > 0) projectScore += 5;
  if (hasResults || hasMetrics) projectScore += 5;
  if (roleEvidenceHits >= 2) projectScore += 5;
  if (wordCount > 10) projectScore += 5;
  projectScore = Math.min(20, projectScore);

  // 4. EDUCATION SCORE (0-15 pts)
  let educationScore = 0;
  if (educationKey === "phd") educationScore = 15;
  else if (educationKey === "masters") educationScore = 14;
  else if (educationKey === "bachelors") educationScore = 12;
  else if (educationKey === "diploma") educationScore = 8;
  else educationScore = 5;

  // 5. CERTIFICATIONS SCORE (0-15 pts)
  let certificationScore = 0;
  if (certifications.length === 0) certificationScore = 0;
  else if (certifications.length === 1) certificationScore = 10;
  else certificationScore = 15;
  
  // Bonus for role-relevant certification
  const normalizedRole = normalizeText(profile.desiredJobRoles);
  const hasRoleRelevantCert = certifications.some(cert =>
    normalizedRole.includes(normalizeText(cert)) || normalizeText(cert).includes(normalizedRole.split(" ")[0])
  );
  if (hasRoleRelevantCert) certificationScore = Math.min(15, certificationScore + 3);

  // FINAL SCORE
  const finalScore = skillsMatchScore + experienceScore + projectScore + educationScore + certificationScore;
  const score = Math.max(0, Math.min(100, finalScore));

  // BUILD SUGGESTIONS WITH AI (await for unique suggestions)
  const suggestions = await generateAISuggestions({
    score,
    jobRole: roleContext.label,
    yearsOfExperience: experience,
    educationLevel: educationKey,
    skills: userSkills,
    projects: projectText,
    certifications,
    city: profile.city || "",
    previousJobTitle: profile.previousJobTitle || "",
    missingSkills: missingSkills.slice(0, 6),
  });

  return {
    score,
    suggestions,
    scoreBreakdown: {
      skills: skillsMatchScore,
      experience: experienceScore,
      projects: projectScore,
      education: educationScore,
      certifications: certificationScore,
    },
    diagnostics: {
      role: roleContext.label,
      matchedSkills,
      missingSkills: missingSkills.slice(0, 8),
      educationKey,
      experience,
    },
    strongPoints: [
      matchedSkills.length > 5 ? "Strong technical skill coverage" : "",
      experience >= 2 ? "Good practical experience" : "",
      certifications.length > 0 ? "Has relevant certifications" : "",
    ].filter(Boolean),
  };
}
