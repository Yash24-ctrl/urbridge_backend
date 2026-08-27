const SECTION_ALIASES = {
  summary: [
    "summary",
    "professional summary",
    "profile summary",
    "career summary",
    "objective",
    "career objective",
    "profile",
    "about me",
  ],
  experience: [
    "experience",
    "work experience",
    "professional experience",
    "employment history",
    "internship",
    "internships",
    "work history",
  ],
  education: [
    "education",
    "academic background",
    "academics",
    "qualification",
    "qualifications",
  ],
  skills: [
    "skills",
    "technical skills",
    "core skills",
    "key skills",
    "competencies",
    "technologies",
    "tools",
    "tech stack",
  ],
  projects: [
    "projects",
    "project experience",
    "academic projects",
    "personal projects",
    "key projects",
    "project work",
  ],
  certifications: [
    "certifications",
    "certification",
    "certificates",
    "licenses",
    "licenses & certifications",
    "courses and certifications",
  ],
  contact: [
    "contact",
    "contact information",
    "personal details",
    "location",
  ],
};

const SECTION_NAMES = Object.keys(SECTION_ALIASES);
const HEADING_LOOKUP = new Map(
  Object.entries(SECTION_ALIASES).flatMap(([section, aliases]) =>
    aliases.map((alias) => [alias, section])
  )
);

const JOB_TITLE_KEYWORDS = [
  "engineer",
  "developer",
  "analyst",
  "scientist",
  "manager",
  "consultant",
  "specialist",
  "administrator",
  "architect",
  "designer",
  "tester",
  "intern",
  "trainee",
  "associate",
  "executive",
  "lead",
  "head",
  "coordinator",
  "officer",
  "researcher",
];

const ROLE_SKILL_MAP = {
  "data scientist": [
    "Python",
    "SQL",
    "Machine Learning",
    "Statistics",
    "Pandas",
    "NumPy",
    "Scikit-learn",
    "Deep Learning",
    "Tableau",
  ],
  "data analyst": [
    "SQL",
    "Excel",
    "Python",
    "Power BI",
    "Tableau",
    "Data Analysis",
    "Data Visualization",
  ],
  "machine learning engineer": [
    "Python",
    "Machine Learning",
    "Scikit-learn",
    "TensorFlow",
    "PyTorch",
    "MLOps",
    "Docker",
    "AWS",
  ],
  "frontend developer": [
    "HTML",
    "CSS",
    "JavaScript",
    "React",
    "TypeScript",
    "Redux",
    "Next.js",
    "Responsive Design",
  ],
  "backend developer": [
    "Node.js",
    "Express",
    "REST API",
    "MongoDB",
    "PostgreSQL",
    "Redis",
    "Docker",
    "System Design",
  ],
  "full stack developer": [
    "React",
    "Node.js",
    "Express",
    "MongoDB",
    "PostgreSQL",
    "JavaScript",
    "TypeScript",
    "REST API",
  ],
  "software engineer": [
    "Data Structures",
    "Algorithms",
    "Git",
    "Testing",
    "Object Oriented Programming",
    "Problem Solving",
    "API Development",
  ],
  "devops engineer": [
    "Docker",
    "Kubernetes",
    "CI/CD",
    "AWS",
    "Linux",
    "Terraform",
    "Monitoring",
    "Jenkins",
  ],
  "qa engineer": [
    "Testing",
    "Selenium",
    "Cypress",
    "Postman",
    "API Testing",
    "Automation",
  ],
};

const EDUCATION_PATTERNS = [
  { level: "PhD", customEducation: "", patterns: [/doctor of philosophy/i, /\bph\.?d\b/i, /\bdoctorate\b/i] },
  {
    level: "Master's",
    customEducation: "",
    patterns: [
      /\bmaster'?s\b/i,
      /\bmaster of\b/i,
      /\bm\.?tech\b/i,
      /\bm\.?e\b/i,
      /\bm\.?s\b/i,
      /\bmba\b/i,
      /\bmca\b/i,
      /\bpgdm\b/i,
      /\bpost[\s-]?graduate\b/i,
    ],
  },
  {
    level: "Bachelor's",
    customEducation: "",
    patterns: [
      /\bbachelor'?s\b/i,
      /\bbachelor of\b/i,
      /\bbachelor of technology\b/i,
      /\bbachelor of engineering\b/i,
      /\bb\.?tech\b/i,
      /\bb\.?e\b/i,
      /\bb\.?sc\b/i,
      /\bbca\b/i,
      /\bbba\b/i,
      /\bb\.?com\b/i,
      /\bundergaduate\b/i,
      /\bundergraduate\b/i,
    ],
  },
  {
    level: "Diploma",
    customEducation: "",
    patterns: [/\bdiploma\b/i, /\bpolytechnic\b/i, /\bassociate degree\b/i],
  },
  {
    level: "High School",
    customEducation: "",
    patterns: [/\bhigh school\b/i, /\bhigher secondary\b/i, /\bsecondary school\b/i, /\b12th\b/i, /\bintermediate\b/i],
  },
];

const SKILL_CATALOG = [
  { display: "Python", patterns: [/\bpython\b/i] },
  { display: "SQL", patterns: [/\bsql\b/i, /\bmysql\b/i, /\bpostgresql\b/i, /\bpostgres\b/i] },
  { display: "Machine Learning", patterns: [/\bmachine learning\b/i, /\bml\b/i] },
  { display: "Statistics", patterns: [/\bstatistics\b/i, /\bstatistical analysis\b/i] },
  { display: "Pandas", patterns: [/\bpandas\b/i] },
  { display: "NumPy", patterns: [/\bnumpy\b/i] },
  { display: "Scikit-learn", patterns: [/\bscikit[- ]learn\b/i, /\bsklearn\b/i] },
  { display: "Deep Learning", patterns: [/\bdeep learning\b/i] },
  { display: "TensorFlow", patterns: [/\btensorflow\b/i] },
  { display: "PyTorch", patterns: [/\bpytorch\b/i] },
  { display: "Data Analysis", patterns: [/\bdata analysis\b/i] },
  { display: "Data Visualization", patterns: [/\bdata visualization\b/i] },
  { display: "Power BI", patterns: [/\bpower bi\b/i] },
  { display: "Tableau", patterns: [/\btableau\b/i] },
  { display: "Excel", patterns: [/\bexcel\b/i, /\bms excel\b/i, /\bmicrosoft excel\b/i] },
  { display: "Java", patterns: [/\bjava\b/i] },
  { display: "JavaScript", patterns: [/\bjavascript\b/i, /\bjs\b/i] },
  { display: "TypeScript", patterns: [/\btypescript\b/i, /\bts\b/i] },
  { display: "React", patterns: [/\breact(?:\.js|js)?\b/i] },
  { display: "Next.js", patterns: [/\bnext(?:\.js|js)?\b/i] },
  { display: "Redux", patterns: [/\bredux\b/i] },
  { display: "Vue.js", patterns: [/\bvue(?:\.js|js)?\b/i] },
  { display: "Angular", patterns: [/\bangular\b/i] },
  { display: "HTML", patterns: [/\bhtml\b/i, /\bhtml5\b/i] },
  { display: "CSS", patterns: [/\bcss\b/i, /\bcss3\b/i] },
  { display: "Tailwind CSS", patterns: [/\btailwind\b/i, /\btailwind css\b/i] },
  { display: "Bootstrap", patterns: [/\bbootstrap\b/i] },
  { display: "Sass", patterns: [/\bsass\b/i, /\bscss\b/i] },
  { display: "Node.js", patterns: [/\bnode(?:\.js|js)?\b/i] },
  { display: "Express", patterns: [/\bexpress(?:\.js|js)?\b/i, /\bexpress\b/i] },
  { display: "REST API", patterns: [/\brest api\b/i, /\bapi development\b/i] },
  { display: "GraphQL", patterns: [/\bgraphql\b/i] },
  { display: "MongoDB", patterns: [/\bmongodb\b/i] },
  { display: "PostgreSQL", patterns: [/\bpostgresql\b/i, /\bpostgres\b/i] },
  { display: "MySQL", patterns: [/\bmysql\b/i] },
  { display: "Redis", patterns: [/\bredis\b/i] },
  { display: "Django", patterns: [/\bdjango\b/i] },
  { display: "Flask", patterns: [/\bflask\b/i] },
  { display: "FastAPI", patterns: [/\bfastapi\b/i] },
  { display: "Spring Boot", patterns: [/\bspring boot\b/i] },
  { display: "PHP", patterns: [/\bphp\b/i] },
  { display: "C++", patterns: [/\bc\+\+\b/i] },
  { display: "C#", patterns: [/\bc#\b/i, /\bc sharp\b/i] },
  { display: ".NET", patterns: [/\b\.net\b/i, /\bdotnet\b/i] },
  { display: "AWS", patterns: [/\baws\b/i, /\bamazon web services\b/i] },
  { display: "Azure", patterns: [/\bazure\b/i] },
  { display: "GCP", patterns: [/\bgcp\b/i, /\bgoogle cloud\b/i] },
  { display: "Docker", patterns: [/\bdocker\b/i] },
  { display: "Kubernetes", patterns: [/\bkubernetes\b/i, /\bk8s\b/i] },
  { display: "CI/CD", patterns: [/\bci\/cd\b/i, /\bcontinuous integration\b/i, /\bcontinuous deployment\b/i] },
  { display: "Terraform", patterns: [/\bterraform\b/i] },
  { display: "Linux", patterns: [/\blinux\b/i] },
  { display: "Git", patterns: [/\bgit\b/i, /\bgithub\b/i, /\bgitlab\b/i] },
  { display: "Testing", patterns: [/\btesting\b/i, /\bunit testing\b/i] },
  { display: "Selenium", patterns: [/\bselenium\b/i] },
  { display: "Cypress", patterns: [/\bcypress\b/i] },
  { display: "Postman", patterns: [/\bpostman\b/i] },
  { display: "API Testing", patterns: [/\bapi testing\b/i] },
  { display: "Automation", patterns: [/\bautomation\b/i] },
  { display: "MLOps", patterns: [/\bmlops\b/i] },
  { display: "Airflow", patterns: [/\bairflow\b/i] },
  { display: "MLflow", patterns: [/\bmlflow\b/i] },
  { display: "Hugging Face", patterns: [/\bhugging face\b/i] },
  { display: "Jenkins", patterns: [/\bjenkins\b/i] },
  { display: "Ansible", patterns: [/\bansible\b/i] },
  { display: "Nginx", patterns: [/\bnginx\b/i] },
  { display: "Monitoring", patterns: [/\bmonitoring\b/i] },
  { display: "Jira", patterns: [/\bjira\b/i] },
  { display: "Figma", patterns: [/\bfigma\b/i] },
  { display: "Problem Solving", patterns: [/\bproblem solving\b/i] },
  { display: "Data Structures", patterns: [/\bdata structures\b/i] },
  { display: "Algorithms", patterns: [/\balgorithms\b/i] },
  { display: "Object Oriented Programming", patterns: [/\bobject oriented programming\b/i, /\boops\b/i] },
];

const COMMON_CITY_HINTS = [
  "Bengaluru",
  "Bangalore",
  "Mumbai",
  "Delhi",
  "New Delhi",
  "Noida",
  "Gurugram",
  "Gurgaon",
  "Hyderabad",
  "Chennai",
  "Pune",
  "Ahmedabad",
  "Vadodara",
  "Surat",
  "Kolkata",
  "Jaipur",
  "Indore",
  "Lucknow",
  "Nagpur",
  "Patna",
  "Kochi",
  "Thiruvananthapuram",
  "Coimbatore",
  "Mysuru",
  "Mangalore",
  "Remote",
];

const DEFAULT_RESUME_PARSE = {
  yearsOfExperience: "0",
  educationLevel: "",
  customEducation: "",
  desiredJobRole: "",
  completedProjects: "",
  skills: [],
  certifications: [],
  currentCity: "",
  previousJobTitle: "",
};

const GROUNDING_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "by",
  "for",
  "from",
  "in",
  "of",
  "on",
  "or",
  "the",
  "to",
  "with",
]);

function normalizeWhitespace(value = "") {
  return String(value)
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, "")
    .replace(/[\u2022\u25cf\u25aa\u25e6]/g, "\n- ")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\t/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function cleanLine(value = "") {
  return String(value)
    .replace(/\u00a0/g, " ")
    .replace(/[\u2022\u25cf\u25aa\u25e6]/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .trim();
}

function normalizeKey(value = "") {
  return cleanLine(value)
    .toLowerCase()
    .replace(/[^a-z0-9+.#/&\s-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function titleCase(value = "") {
  return cleanLine(value)
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function normalizeSourceText(value = "") {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[^\w\s+.#/&-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getMeaningfulTokens(value = "") {
  return normalizeSourceText(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token && token.length > 1 && !GROUNDING_STOP_WORDS.has(token));
}

function isPlaceholderText(value = "") {
  const normalized = normalizeKey(value);
  return [
    "",
    "n/a",
    "na",
    "not specified",
    "not mentioned",
    "none",
    "nil",
    "professional",
    "candidate",
    "resume analysis",
    "not applicable",
    normalizeKey(DEFAULT_RESUME_PARSE.desiredJobRole),
    normalizeKey(DEFAULT_RESUME_PARSE.previousJobTitle),
    normalizeKey(DEFAULT_RESUME_PARSE.currentCity),
    normalizeKey(DEFAULT_RESUME_PARSE.completedProjects),
    normalizeKey(DEFAULT_RESUME_PARSE.customEducation),
    normalizeKey(DEFAULT_RESUME_PARSE.skills[0]),
    normalizeKey(DEFAULT_RESUME_PARSE.certifications[0]),
  ].includes(normalized);
}

function uniqueValues(values = []) {
  const seen = new Set();
  return values.filter((value) => {
    const key = normalizeKey(value);
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function splitLines(text = "") {
  return normalizeWhitespace(text)
    .split("\n")
    .map(cleanLine)
    .filter(Boolean);
}

function isLikelySectionHeading(line = "") {
  const normalized = normalizeKey(line).replace(/[:|-]+$/g, "").trim();
  if (!normalized) {
    return null;
  }

  if (HEADING_LOOKUP.has(normalized)) {
    return HEADING_LOOKUP.get(normalized);
  }

  if (normalized.split(" ").length > 5) {
    return null;
  }

  for (const alias of HEADING_LOOKUP.keys()) {
    if (normalized === alias || normalized.startsWith(`${alias} `) || normalized.endsWith(` ${alias}`)) {
      return HEADING_LOOKUP.get(alias);
    }
  }

  return null;
}

function splitIntoSections(text = "") {
  const lines = splitLines(text);
  const sections = Object.fromEntries(SECTION_NAMES.map((name) => [name, []]));
  sections.other = [];

  let currentSection = "other";

  for (const line of lines) {
    const sectionMatch = isLikelySectionHeading(line);
    if (sectionMatch) {
      currentSection = sectionMatch;
      continue;
    }
    sections[currentSection].push(line);
  }

  return { lines, sections };
}

function parseDateValue(value = "") {
  const text = normalizeKey(value);
  if (!text) {
    return null;
  }

  if (/\bpresent\b|\bcurrent\b|\btill date\b|\bnow\b/.test(text)) {
    return new Date();
  }

  const monthMatch = text.match(
    /\b(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\b\s*(\d{4})/
  );

  if (monthMatch) {
    return new Date(`${monthMatch[1]} 1, ${monthMatch[2]}`);
  }

  const yearMatch = text.match(/\b(19|20)\d{2}\b/);
  if (yearMatch) {
    return new Date(`January 1, ${yearMatch[0]}`);
  }

  return null;
}

function extractDateRanges(text = "") {
  const ranges = [];
  const normalized = normalizeWhitespace(text);
  const rangePattern =
    /\b((?:jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\s+\d{4}|\d{4})\s*(?:-|to|until)\s*((?:present|current|till date|now|(?:jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\s+\d{4}|\d{4}))\b/gi;

  let match;
  while ((match = rangePattern.exec(normalized)) !== null) {
    const start = parseDateValue(match[1]);
    const end = parseDateValue(match[2]);
    if (start && end && end >= start) {
      ranges.push({ start, end });
    }
  }

  return ranges;
}

function monthDiff(start, end) {
  const years = end.getFullYear() - start.getFullYear();
  const months = end.getMonth() - start.getMonth();
  return years * 12 + months + 1;
}

function formatYearsOfExperience(value = 0) {
  const numeric = Number(value);
  if (Number.isNaN(numeric) || numeric < 0) {
    return DEFAULT_RESUME_PARSE.yearsOfExperience;
  }

  const roundedToHalfYear = Math.round(numeric * 2) / 2;
  return Number.isInteger(roundedToHalfYear)
    ? String(roundedToHalfYear)
    : roundedToHalfYear.toFixed(1).replace(/\.0$/, "");
}

function isInternshipText(value = "") {
  return /\b(intern|internship)\b/i.test(value);
}

function extractExperienceEntries(lines = []) {
  const entries = [];
  const rangePattern =
    /\b((?:jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\s+\d{4}|\d{4})\s*(?:-|to|until)\s*((?:present|current|till date|now|(?:jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\s+\d{4}|\d{4}))\b/gi;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] || "";
    const contextText = [lines[index - 1], line, lines[index + 1]]
      .filter(Boolean)
      .join(" ");

    let match;
    while ((match = rangePattern.exec(line)) !== null) {
      const start = parseDateValue(match[1]);
      const end = parseDateValue(match[2]);

      if (start && end && end >= start) {
        entries.push({
          start,
          end,
          isInternship: isInternshipText(contextText),
        });
      }
    }

    rangePattern.lastIndex = 0;
  }

  return entries;
}

function extractYearsOfExperience(text = "", sections = {}) {
  const explicitPatterns = [
    /(\d{1,2}(?:\.\d)?)\+?\s+years?(?:\s+of)?\s+experience/i,
    /experience\s*[:\-]\s*(\d{1,2}(?:\.\d)?)/i,
    /over\s+(\d{1,2}(?:\.\d)?)\s+years?/i,
  ];

  for (const pattern of explicitPatterns) {
    const match = text.match(pattern);
    if (match) {
      if (!Number.isNaN(Number(match[1]))) {
        return formatYearsOfExperience(match[1]);
      }
    }
  }

  const experienceLines = sections.experience || [];
  const experienceEntries = extractExperienceEntries(experienceLines);
  if (experienceEntries.length > 0) {
    const totalYears = experienceEntries.reduce((sum, entry) => {
      if (entry.isInternship) {
        return sum + 0.5;
      }

      return sum + Math.max(0, monthDiff(entry.start, entry.end) / 12);
    }, 0);

    return formatYearsOfExperience(Math.min(totalYears, 50));
  }

  if (experienceLines.some((line) => isInternshipText(line))) {
    return formatYearsOfExperience(0.5);
  }

  const experienceText = [...experienceLines, ...(sections.summary || [])].join("\n");
  const ranges = extractDateRanges(experienceText || text);
  if (ranges.length > 0) {
    const totalYears = ranges.reduce(
      (sum, range) => sum + Math.max(0, monthDiff(range.start, range.end) / 12),
      0
    );
    return formatYearsOfExperience(Math.min(totalYears, 50));
  }

  return DEFAULT_RESUME_PARSE.yearsOfExperience;
}

function extractEducation(text = "", sections = {}) {
  const educationText = [...(sections.education || []), ...(sections.summary || []), ...(sections.other || [])].join("\n");
  for (const candidate of EDUCATION_PATTERNS) {
    if (candidate.patterns.some((pattern) => pattern.test(educationText || text))) {
      return {
        educationLevel: candidate.level,
        customEducation: candidate.customEducation,
      };
    }
  }

  return {
    educationLevel: "",
    customEducation: "",
  };
}

function splitSkillChunks(value = "") {
  return cleanLine(value)
    .split(/[,|/]|(?:\s+-\s+)|(?:\s+\u2022\s+)|(?:\s{2,})/g)
    .map(cleanLine)
    .filter(Boolean);
}

function normalizeSkillLabel(value = "") {
  const cleaned = cleanLine(value)
    .replace(/^[-:]+/, "")
    .replace(/\(.*?\)/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) {
    return "";
  }

  const normalized = normalizeKey(cleaned);
  const directMatch = SKILL_CATALOG.find((entry) =>
    entry.patterns.some((pattern) => pattern.test(cleaned))
  );
  if (directMatch) {
    return directMatch.display;
  }

  if (normalized.length <= 1 || normalized.split(" ").length > 4) {
    return "";
  }

  if (/^\d+$/.test(normalized)) {
    return "";
  }

  return titleCase(cleaned);
}

function extractSkillsFromLines(lines = []) {
  const found = [];

  for (const entry of SKILL_CATALOG) {
    if (lines.some((line) => entry.patterns.some((pattern) => pattern.test(line)))) {
      found.push(entry.display);
    }
  }

  for (const line of lines) {
    const chunks = splitSkillChunks(line);
    for (const chunk of chunks) {
      const normalized = normalizeSkillLabel(chunk);
      if (normalized && !/^(skills?|technologies|tools)$/i.test(normalized)) {
        found.push(normalized);
      }
    }
  }

  return uniqueValues(found).slice(0, 40);
}

function countCatalogMatchesInLine(line = "") {
  return SKILL_CATALOG.filter((entry) =>
    entry.patterns.some((pattern) => pattern.test(line))
  ).length;
}

function extractSkills(text = "", sections = {}) {
  const skillSectionLines = sections.skills?.length
    ? sections.skills
    : [];

  if (skillSectionLines.length > 0) {
    const sectionSkills = extractSkillsFromLines(skillSectionLines);
    return sectionSkills.length > 0 ? sectionSkills : [];
  }

  const supportingLines = [
    ...(sections.projects || []),
    ...(sections.experience || []),
    ...(sections.summary || []),
  ].filter((line) => {
    const normalized = normalizeKey(line);
    return (
      /\b(technologies|tech stack|tools|frameworks|libraries|stack|skills used)\b/.test(normalized) ||
      countCatalogMatchesInLine(line) >= 2
    );
  });

  const inferredSkills = extractSkillsFromLines(supportingLines);
  return inferredSkills.length > 0 ? inferredSkills : [];
}

function cleanupCertification(value = "") {
  const cleaned = cleanLine(value)
    .replace(/^[-:]+/, "")
    .trim();

  if (!cleaned) {
    return "";
  }

  if (/^(certifications?|certificates?|licenses?)$/i.test(cleaned)) {
    return "";
  }

  return cleaned;
}

function extractCertifications(text = "", sections = {}) {
  const hasCertificationSection = Array.isArray(sections.certifications) && sections.certifications.length > 0;
  const lines = hasCertificationSection
    ? sections.certifications
    : splitLines(text).filter((line) => /\b(certified|certification|certificate|license)\b/i.test(line));

  const certifications = [];

  for (const line of lines) {
    const chunks = line.split(/[|\u2022]/g).map(cleanupCertification).filter(Boolean);
    if (chunks.length > 1) {
      certifications.push(...chunks);
      continue;
    }

    const splitByComma = line.split(/,(?=\s*[A-Z])/g).map(cleanupCertification).filter(Boolean);
    if (splitByComma.length > 1) {
      certifications.push(...splitByComma);
      continue;
    }

    const single = cleanupCertification(line);
    if (single && (hasCertificationSection || /\b(certified|certification|certificate|license)\b/i.test(single))) {
      certifications.push(single);
    }
  }

  const uniqueCertifications = uniqueValues(certifications).slice(0, 20);
  return uniqueCertifications.length > 0 ? uniqueCertifications : [];
}

function cleanupProjectTitle(value = "") {
  return cleanLine(value)
    .replace(/^\s*(?:[-*]|\u2022|\d+[.)])\s+/, "")
    .replace(/^[-:]+/, "")
    .replace(/^(?:project|capstone|academic project|personal project)\s*\d*\s*[:.)-]\s*/i, "")
    .replace(/^(?:title|name)\s*[:.)-]\s*/i, "")
    .replace(/\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{4}\s*$/i, "")
    .replace(/\s+(?:19|20)\d{2}\s*$/i, "")
    .replace(/\s*[\-|:\u2013\u2014]\s*$/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function isProjectDescriptionLine(line = "") {
  const cleaned = cleanLine(line);
  const normalized = normalizeKey(cleaned);
  return (
    /^\s*(?:[-*]|\u2022|\d+[.)])\s+/.test(line) ||
    /^(developed|built|designed|combined|created|implemented|integrated|used|utilized|trained|deployed|improved|analyzed|managed|worked|collaborated|responsible|handled|performed|provided|generated|automated|optimized|enabled)\b/.test(normalized) ||
    /\b(using|to generate|to recommend|based on|for feature|for real time|with integrated|workflow for|resulting in|which)\b/.test(normalized) && /[.!?]$/.test(cleaned)
  );
}

function isLikelyProjectNoise(line = "") {
  const normalized = normalizeKey(line);
  return (
    !normalized ||
    normalized.length < 4 ||
    /^https?:\/\//.test(normalized) ||
    /\b(github|technologies|tech stack|tools used|responsibilities)\b/.test(normalized)
  );
}

function extractProjectNameFromLine(line = "") {
  if (isProjectDescriptionLine(line)) {
    return "";
  }

  const withoutTrailingDate = cleanLine(line)
    .replace(/\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{4}\s*$/i, "")
    .replace(/\s+(?:19|20)\d{2}\s*$/i, "")
    .replace(/\s*[\-|:\u2013\u2014]\s*$/, "");
  const titleCandidate = withoutTrailingDate
    .split(/\s+\|\s+|\s+-\s+|\s+\u2013\s+|\s+\u2014\s+|:\s+/)[0];
  const cleaned = cleanupProjectTitle(titleCandidate);

  if (!cleaned || isLikelyProjectNoise(cleaned)) {
    return "";
  }

  const wordCount = cleaned.split(/\s+/).length;
  if (wordCount >= 2 && wordCount <= 16 && !/^project\s*\d*$/i.test(cleaned) && !/[.!?]$/.test(cleaned)) {
    return cleaned;
  }

  return "";
}

function extractProjects(text = "", sections = {}) {
  const lines = sections.projects?.length
    ? sections.projects
    : splitLines(text).filter((line) => /\b(project|capstone)\b/i.test(line));

  const projectNames = [];

  for (const line of lines) {
    if (isLikelyProjectNoise(line) || isProjectDescriptionLine(line)) {
      continue;
    }

    const projectName = extractProjectNameFromLine(line);
    if (projectName) {
      projectNames.push(projectName);
      continue;
    }

    // Ambiguous project-like descriptions are intentionally ignored instead of
    // being promoted into fake project names.
  }

  const uniqueProjects = uniqueValues(projectNames).slice(0, 12);
  if (uniqueProjects.length > 0) {
    return uniqueProjects.join(" | ");
  }

  return "";
}

function extractCurrentCity(text = "", lines = []) {
  const locationPatterns = [
    /(?:location|current city|city|address)\s*[:\-]\s*([A-Za-z. ]+(?:,\s*[A-Za-z. ]+){0,2})/i,
    /\b([A-Za-z. ]+),\s*(?:[A-Za-z. ]+),\s*(India|United States|USA|Canada|UK|UAE)\b/i,
    /\b([A-Za-z. ]+),\s*(India|United States|USA|Canada|UK|UAE)\b/i,
  ];

  for (const pattern of locationPatterns) {
    const match = text.match(pattern);
    if (match) {
      const city = cleanLine(match[1]).split(",")[0];
      if (city) {
        return titleCase(city);
      }
    }
  }

  for (const line of lines.slice(0, 12)) {
    for (const city of COMMON_CITY_HINTS) {
      const cityPattern = new RegExp(`\\b${city.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
      if (cityPattern.test(line)) {
        return city === "Remote" ? "Remote" : titleCase(city);
      }
    }

    const compactLocation = line.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s*,\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/);
    if (compactLocation && !/@/.test(line) && !/\d{10}/.test(line)) {
      return titleCase(compactLocation[1]);
    }
  }

  return DEFAULT_RESUME_PARSE.currentCity;
}

function extractTitleSegment(value = "") {
  const pieces = cleanLine(value)
    .split(/\s+\|\s+|\s+-\s+|,\s+(?=[A-Z])/)
    .map(cleanLine)
    .filter(Boolean);

  for (const piece of pieces) {
    const normalized = normalizeKey(piece);
    const wordCount = piece.split(/\s+/).length;
    if (
      wordCount <= 6 &&
      JOB_TITLE_KEYWORDS.some((keyword) => normalized.includes(keyword)) &&
      !/\b(project|education|certification|skills|years|experience|developed|built)\b/i.test(piece)
    ) {
      return titleCase(piece);
    }
  }

  return "";
}

function extractPreviousJobTitle(sections = {}, lines = []) {
  const experienceLines = sections.experience?.length ? sections.experience : [];

  for (const line of experienceLines) {
    const title = extractTitleSegment(line);
    if (title) {
      return title;
    }
  }

  return DEFAULT_RESUME_PARSE.previousJobTitle;
}

function inferRoleFromSkills(skills = [], previousJobTitle = "", text = "") {
  const normalizedText = normalizeKey(`${previousJobTitle}\n${skills.join("\n")}\n${text}`);
  let bestRole = "";
  let bestScore = 0;

  for (const [role, roleSkills] of Object.entries(ROLE_SKILL_MAP)) {
    const score = roleSkills.reduce((count, skill) => {
      const normalizedSkill = normalizeKey(skill);
      return count + (normalizedText.includes(normalizedSkill) ? 1 : 0);
    }, 0);

    if (score > bestScore) {
      bestRole = role;
      bestScore = score;
    }
  }

  if (bestRole && bestScore > 1) {
    return titleCase(bestRole);
  }

  if (previousJobTitle) {
    return previousJobTitle;
  }

  return "";
}

function cleanupRoleLabel(value = "") {
  const cleaned = cleanLine(value)
    .replace(/\b(where|that|to|with)\b.*$/i, "")
    .replace(/\b(role|position|opportunity|internship)\b.*$/i, "")
    .trim();

  const directTitle = extractTitleSegment(cleaned);
  if (directTitle) {
    return directTitle;
  }

  const roleMatch = cleaned.match(
    /\b(data scientist|data analyst|machine learning engineer|frontend developer|backend developer|full stack developer|software engineer|devops engineer|qa engineer|business analyst|product manager)\b/i
  );

  if (roleMatch) {
    return titleCase(roleMatch[1]);
  }

  return titleCase(cleaned);
}

function extractDesiredJobRole(text = "", sections = {}, previousJobTitle = "", skills = []) {
  const summaryText = [...(sections.summary || []), ...(sections.other || [])].join("\n");
  const rolePatterns = [
    /(?:seeking|looking for|aspiring|targeting|aiming for|interested in|applying for)\s+(?:an?\s+)?(data scientist|data analyst|machine learning engineer|frontend developer|backend developer|full stack developer|software engineer|devops engineer|qa engineer|business analyst|product manager)/i,
    /(?:seeking|looking for|aspiring|targeting|aiming for|interested in|applying for)\s+(?:an?\s+)?([A-Za-z/&\s-]{3,80}?)(?:\s+role|\s+position|\s+opportunity|\s+internship)?(?:[.,;\n]|$)/i,
    /(?:desired role|target role|preferred role)\s*[:\-]\s*([A-Za-z/&\s-]{3,80})/i,
  ];

  for (const pattern of rolePatterns) {
    const match = summaryText.match(pattern) || text.match(pattern);
    if (match) {
      return cleanupRoleLabel(match[1]);
    }
  }

  const headlineCandidate = splitLines(text)
    .slice(0, 8)
    .map(extractTitleSegment)
    .find(Boolean);

  if (headlineCandidate) {
    return headlineCandidate;
  }

  if (previousJobTitle && previousJobTitle !== DEFAULT_RESUME_PARSE.previousJobTitle) {
    return previousJobTitle;
  }

  return "";
}

function isGroundedInText(value = "", sourceText = "", minimumRatio = 0.7) {
  const cleanedValue = cleanLine(value);
  const normalizedSource = normalizeSourceText(sourceText);

  if (!cleanedValue || !normalizedSource) {
    return false;
  }

  const normalizedValue = normalizeSourceText(cleanedValue);
  if (!normalizedValue) {
    return false;
  }

  if (normalizedSource.includes(normalizedValue)) {
    return true;
  }

  const skillEntry = SKILL_CATALOG.find((entry) => normalizeKey(entry.display) === normalizeKey(cleanedValue));
  if (skillEntry && skillEntry.patterns.some((pattern) => pattern.test(sourceText))) {
    return true;
  }

  const tokens = getMeaningfulTokens(cleanedValue);
  if (tokens.length === 0) {
    return false;
  }

  const matches = tokens.filter((token) => {
    const tokenPattern = new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    return tokenPattern.test(sourceText);
  }).length;

  return matches / tokens.length >= minimumRatio;
}

function normalizeRoleCandidate(value = "") {
  const cleaned = cleanupRoleLabel(value);
  if (!cleaned || isPlaceholderText(cleaned)) {
    return "";
  }

  const directTitle = extractTitleSegment(cleaned);
  if (directTitle) {
    return directTitle;
  }

  const roleMatch = cleaned.match(
    /\b(data scientist|data analyst|machine learning engineer|frontend developer|backend developer|full stack developer|software engineer|devops engineer|qa engineer|business analyst|product manager)\b/i
  );
  if (roleMatch) {
    return titleCase(roleMatch[1]);
  }

  if (cleaned.split(/\s+/).length <= 6) {
    return titleCase(cleaned);
  }

  return "";
}

function normalizeTitleCandidate(value = "") {
  const cleaned = cleanLine(value);
  if (!cleaned || isPlaceholderText(cleaned)) {
    return "";
  }

  const directTitle = extractTitleSegment(cleaned);
  if (directTitle) {
    return directTitle;
  }

  if (
    cleaned.split(/\s+/).length <= 6 &&
    JOB_TITLE_KEYWORDS.some((keyword) => normalizeKey(cleaned).includes(keyword))
  ) {
    return titleCase(cleaned);
  }

  return "";
}

function normalizeCityCandidate(value = "") {
  const cleaned = cleanLine(value)
    .split(/\n|,/)[0]
    .trim();

  if (!cleaned || isPlaceholderText(cleaned)) {
    return "";
  }

  if (cleaned.split(/\s+/).length > 4) {
    return "";
  }

  return titleCase(cleaned);
}

function normalizeProjectValues(value = "") {
  const rawChunks = String(value || "")
    .split(/\||\n|(?:\u2022)/g)
    .map(cleanupProjectTitle)
    .filter(Boolean);

  const normalized = [];
  for (const chunk of rawChunks) {
    const projectName = extractProjectNameFromLine(chunk) || cleanupProjectTitle(chunk);
    if (projectName && !isPlaceholderText(projectName)) {
      normalized.push(projectName);
    }
  }

  return uniqueValues(normalized).slice(0, 12);
}

function normalizeArrayInput(value) {
  if (Array.isArray(value)) {
    return value.map((item) => cleanLine(item)).filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(/[|,\u2022]/g)
      .map(cleanLine)
      .filter(Boolean);
  }

  return [];
}

function choosePreferredString(primary, secondary, fallback) {
  const candidates = [primary, secondary, fallback]
    .map((value) => cleanLine(value))
    .filter((value) => value && !isPlaceholderText(value));

  if (candidates.length > 0) {
    return candidates[0];
  }

  const fallbackCandidates = [primary, secondary, fallback]
    .map((value) => cleanLine(value))
    .filter(Boolean);

  return fallbackCandidates[0] || fallback;
}

function chooseBestProjects(primary, secondary) {
  const first = cleanLine(primary);
  const second = cleanLine(secondary);

  if (first && first !== DEFAULT_RESUME_PARSE.completedProjects) {
    return first;
  }

  if (second && second !== DEFAULT_RESUME_PARSE.completedProjects) {
    return second;
  }

  return "";
}

function normalizeEducationValue(value = "", fallbackCustomEducation = "") {
  const combinedText = `${cleanLine(value)} ${cleanLine(fallbackCustomEducation)}`.trim();

  if (/doctor of philosophy|ph\.?d|doctorate/i.test(combinedText)) {
    return { educationLevel: "PhD", customEducation: "" };
  }

  if (
    /master|m\.?tech|m\.?e\b|m\.?s\b|mba|mca|pgdm|post[\s-]?graduate/i.test(
      combinedText
    )
  ) {
    return { educationLevel: "Master's", customEducation: "" };
  }

  if (
    /bachelor|b\.?tech|b\.?e\b|b\.?sc|bca|bba|b\.?com|undergraduate/i.test(
      combinedText
    )
  ) {
    return { educationLevel: "Bachelor's", customEducation: "" };
  }

  if (/diploma|polytechnic|associate degree/i.test(combinedText)) {
    return { educationLevel: "Diploma", customEducation: "" };
  }

  if (/high school|higher secondary|secondary school|12th|intermediate/i.test(combinedText)) {
    return { educationLevel: "High School", customEducation: "" };
  }

  return {
    educationLevel: "",
    customEducation: cleanLine(fallbackCustomEducation),
  };
}

function normalizeYearsValue(value = "") {
  const match = cleanLine(String(value || "")).match(/\d+(?:\.\d+)?/);
  if (!match) {
    return "";
  }

  return formatYearsOfExperience(match[0]);
}

export function parseJsonObjectFromText(rawText = "") {
  const text = String(rawText || "").trim();
  if (!text) {
    return null;
  }

  const attempts = [
    text,
    text.replace(/```json/gi, "").replace(/```/g, "").trim(),
    (text.match(/\{[\s\S]*\}/) || [])[0],
  ].filter(Boolean);

  for (const attempt of attempts) {
    try {
      return JSON.parse(attempt);
    } catch {
      // Continue through the fallback parsing attempts.
    }
  }

  return null;
}

export function extractTextFromOpenRouterAnnotations(data = {}) {
  const annotations = data?.choices?.[0]?.message?.annotations;
  if (!Array.isArray(annotations)) {
    return "";
  }

  const chunks = annotations
    .map((annotation) => {
      if (annotation?.type === "file_citation" && Array.isArray(annotation?.file?.content)) {
        return annotation.file.content
          .map((item) => cleanLine(item?.text || ""))
          .filter(Boolean)
          .join("\n");
      }
      return "";
    })
    .filter(Boolean);

  return normalizeWhitespace(chunks.join("\n\n"));
}

export function extractResumeDataHeuristically(resumeText = "") {
  const normalizedText = normalizeWhitespace(resumeText);
  const { lines, sections } = splitIntoSections(normalizedText);

  const education = extractEducation(normalizedText, sections);
  const skills = extractSkills(normalizedText, sections);
  const previousJobTitle = extractPreviousJobTitle(sections, lines);

  return {
    yearsOfExperience: extractYearsOfExperience(normalizedText, sections),
    educationLevel: education.educationLevel,
    customEducation: education.customEducation,
    desiredJobRole: extractDesiredJobRole(normalizedText, sections, previousJobTitle, skills),
    completedProjects: extractProjects(normalizedText, sections),
    skills,
    certifications: extractCertifications(normalizedText, sections),
    currentCity: extractCurrentCity(normalizedText, lines),
    previousJobTitle,
  };
}

export function buildResumeParserPrompt({ pdfText = "", heuristicData = {} } = {}) {
  const extractedText = normalizeWhitespace(pdfText).slice(0, 20000);

  return `
You are a highly accurate resume parser.

Extract these exact fields from the resume:
- yearsOfExperience
- educationLevel
- customEducation
- desiredJobRole
- completedProjects
- skills
- certifications
- currentCity
- previousJobTitle

Rules:
1. Return ONLY valid JSON.
2. Use the resume itself as the source of truth. Use the heuristic hints only as backup, not as hard facts.
3. "yearsOfExperience" must count ONLY actual work experience.
4. Count each internship as 0.5 years, even if the duration looks longer or shorter.
5. If no work experience is found, set "yearsOfExperience" to "0".
6. "educationLevel" must be exactly one of: "High School", "Diploma", "Bachelor's", "Master's", "PhD".
7. Map B.Tech, BE, BSc, BCA, BBA, B.Com and similar undergraduate degrees to "Bachelor's".
8. Map M.Tech, ME, MSc, MBA, MCA, PGDM and similar postgraduate degrees to "Master's".
9. If education is unclear, return "" for "educationLevel" and "" for "customEducation".
10. Set "customEducation" to "" unless the resume explicitly contains a useful custom education detail that is not already captured by the allowed values.
11. "desiredJobRole" must come from the headline or job title near the top of the resume. If that is missing, use the most recent role title. If no role/title is present, return "".
12. "completedProjects" must include ALL actual project names or short project headlines joined by " | ". In the Projects section, use only the title/headline line before technologies, dates, links, and bullet descriptions. Do NOT include descriptions, bullets, tech stacks, links, dates, or counts. If project names are not clearly present, return "".
13. "skills" must include EVERY skill explicitly mentioned in the resume, including programming languages, frameworks, databases, cloud tools, platforms, libraries, tools, and soft skills. Do not omit skills that appear in lists, project lines, or experience bullets.
14. Do NOT guess skills that are not explicitly present in the resume text.
15. "certifications" must contain the FULL certification names exactly as written in the resume. Do not shorten, normalize, or rewrite them. If none are present, return [].
16. "currentCity" must be the city from the address or location if it is present. If not found, return "".
17. "previousJobTitle" must be the MOST RECENT job title exactly from the resume. If the only experience is an internship, use the internship role. If no job title is present, return "".
18. Never invent project names, certifications, job titles, locations, experience, or roles that are not grounded in the resume text.
19. Keep array order aligned to the resume where possible.

Heuristic hints:
${JSON.stringify(heuristicData, null, 2)}

Resume text:
${extractedText}

Return JSON in this exact shape:
{
  "yearsOfExperience": "0",
  "educationLevel": "",
  "customEducation": "",
  "desiredJobRole": "",
  "completedProjects": "",
  "skills": [],
  "certifications": [],
  "currentCity": "",
  "previousJobTitle": ""
}
`.trim();
}

export function normalizeParsedResumeData(rawData = {}, heuristicData = {}, sourceText = "") {
  const safeInput = rawData && typeof rawData === "object" ? rawData : {};
  const heuristic = heuristicData && typeof heuristicData === "object" ? heuristicData : {};
  const groundedSource = normalizeWhitespace(sourceText);

  const educationFromInput = normalizeEducationValue(
    safeInput.educationLevel || heuristic.educationLevel,
    safeInput.customEducation || heuristic.customEducation
  );

  const aiSkills = normalizeArrayInput(safeInput.skills)
    .filter((value) => !isPlaceholderText(value))
    .filter((value) => isGroundedInText(value, groundedSource, 0.6));
  const heuristicSkills = normalizeArrayInput(heuristic.skills).filter((value) => !isPlaceholderText(value));
  const mergedSkills = uniqueValues([...aiSkills, ...heuristicSkills]).slice(0, 40);

  const aiCertifications = normalizeArrayInput(safeInput.certifications)
    .filter((value) => !isPlaceholderText(value))
    .filter((value) => isGroundedInText(value, groundedSource, 0.6));
  const heuristicCertifications = normalizeArrayInput(heuristic.certifications)
    .filter((value) => !isPlaceholderText(value));
  const mergedCertifications = uniqueValues([...aiCertifications, ...heuristicCertifications]).slice(0, 20);

  const aiPreviousTitle = normalizeTitleCandidate(safeInput.previousJobTitle);
  const heuristicPreviousTitle = normalizeTitleCandidate(heuristic.previousJobTitle);
  const previousJobTitle = choosePreferredString(
    aiPreviousTitle && isGroundedInText(aiPreviousTitle, groundedSource, 0.6) ? aiPreviousTitle : "",
    heuristicPreviousTitle,
    DEFAULT_RESUME_PARSE.previousJobTitle
  );

  const heuristicYearsCandidate = normalizeYearsValue(
    heuristic.yearsOfExperience || DEFAULT_RESUME_PARSE.yearsOfExperience
  );
  const aiYearsCandidate = normalizeYearsValue(safeInput.yearsOfExperience || "");
  const normalizedYears =
    aiYearsCandidate ||
    heuristicYearsCandidate ||
    DEFAULT_RESUME_PARSE.yearsOfExperience;

  const aiDesiredRole = normalizeRoleCandidate(safeInput.desiredJobRole);
  const heuristicDesiredRole = normalizeRoleCandidate(heuristic.desiredJobRole);
  const desiredRole = choosePreferredString(
    aiDesiredRole && isGroundedInText(aiDesiredRole, groundedSource, 0.6) ? aiDesiredRole : "",
    heuristicDesiredRole,
    previousJobTitle && previousJobTitle !== DEFAULT_RESUME_PARSE.previousJobTitle
      ? previousJobTitle
      : ""
  );

  const aiProjects = normalizeProjectValues(safeInput.completedProjects)
    .filter((value) => isGroundedInText(value, groundedSource, 0.5))
    .join(" | ");
  const heuristicProjects = normalizeProjectValues(heuristic.completedProjects).join(" | ");

  const aiCity = normalizeCityCandidate(safeInput.currentCity);
  const heuristicCity = normalizeCityCandidate(heuristic.currentCity);

  return {
    yearsOfExperience: normalizedYears,
    educationLevel: educationFromInput.educationLevel || "",
    customEducation: educationFromInput.customEducation || "",
    desiredJobRole: desiredRole || "",
    completedProjects: chooseBestProjects(aiProjects, heuristicProjects),
    skills: mergedSkills.length > 0 ? mergedSkills : [],
    certifications: mergedCertifications.length > 0 ? mergedCertifications : [],
    currentCity: choosePreferredString(
      aiCity && isGroundedInText(aiCity, groundedSource, 1) ? aiCity : "",
      heuristicCity,
      DEFAULT_RESUME_PARSE.currentCity
    ),
    previousJobTitle: previousJobTitle || "",
  };
}

export { DEFAULT_RESUME_PARSE };
