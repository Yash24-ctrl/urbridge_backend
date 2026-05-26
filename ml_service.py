"""
UrBridge.ai ML service and local launcher.

Running `python ml_service.py` will:
1. Start the Node backend on port 5000 if it is not already running.
2. Start the Vite frontend on port 5173 if it is not already running.
3. Start this Flask ML API on port 5001.

The manual resume analysis route in the Node backend calls this ML API.
"""

from __future__ import annotations

from flask import Flask, request, jsonify
import atexit
import csv
import os
import pickle
import re
import socket
import subprocess
import sys
import threading
import warnings
from collections import Counter
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
from sklearn.base import BaseEstimator, TransformerMixin
from sklearn.ensemble import GradientBoostingClassifier, RandomForestClassifier
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

try:
    from pymongo import MongoClient
    from pymongo.uri_parser import parse_uri
except ImportError:
    MongoClient = None

    def parse_uri(_uri: str) -> dict:
        return {}


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.abspath(os.path.join(BASE_DIR, ".."))
ML_PORT = 5001
NODE_PORT = 5000
FRONTEND_PORT = 5173
DEFAULT_MODEL_PATH = os.path.join(BASE_DIR, "resume_analyzer_model.pkl")
DEFAULT_BASE_CSV_PATH = "/home/ubuntu/data/resume_training_data_50000.csv"
MODEL_SELECTION_MAX_ROWS = 3000
ROLE_TRAINING_FIELDS = [
    "years_of_experience",
    "education_level",
    "completed_projects",
    "skills",
    "certifications",
    "current_city",
    "previous_job_title",
]
ROLE_TARGET_FIELD = "desired_job_role"
FEATURE_COLUMNS = [
    "years_of_experience",
    "education_level",
    "skills",
    "certifications",
    "projects_completed",
    "languages_known",
    "availability_days",
    "desired_job_role",
    "current_location_city",
    "previous_job_title",
    "notice_period_days_IT",
]
CSV_FIELD_ALIASES = {
    "years_of_experience": ["years_of_experience", "experience", "years_experience"],
    "education_level": ["education_level", "education", "education_encoded"],
    "skills": ["skills", "skills_count"],
    "certifications": ["certifications", "certs_count", "certification_count"],
    "projects_completed": ["projects_completed", "completed_projects", "projects", "project_count"],
    "languages_known": ["languages_known", "languages", "language_count"],
    "availability_days": ["availability_days", "availability", "availability_in_days"],
    "desired_job_role": ["desired_job_role", "desired_role", "job_role", "role"],
    "current_location_city": ["current_location_city", "current_city", "city", "location_city"],
    "previous_job_title": ["previous_job_title", "job_title", "title"],
    "notice_period_days_IT": ["notice_period_days_it", "notice_period_days", "notice_period"],
}
TARGET_FIELD_ALIASES = [
    "score",
    "resume_score",
    "ats_score",
    "final_score",
    "target",
    "label",
]

app = Flask(__name__)
managed_processes: List[subprocess.Popen] = []
model_lock = threading.Lock()
retrain_state_lock = threading.Lock()
mongo_lock = threading.Lock()
retraining_in_progress = False
mongo_client: Optional[MongoClient] = None
mongo_db = None
resume_inputs_collection = None
training_logs_collection = None
role_classifier_model = None
role_classifier_accuracy = 0.0
role_classifier_name = ""


def load_env_file() -> None:
    env_paths = [
        os.path.join(BASE_DIR, ".env"),
        os.path.join(FRONTEND_DIR, ".env"),
        os.path.join(os.path.dirname(FRONTEND_DIR), ".env"),
    ]
    for env_path in env_paths:
        if not os.path.exists(env_path):
            continue
        try:
            with open(env_path, "r", encoding="utf-8") as env_file:
                for raw_line in env_file:
                    line = raw_line.strip()
                    if not line or line.startswith("#") or "=" not in line:
                        continue
                    key, value = line.split("=", 1)
                    cleaned_key = key.strip()
                    cleaned_value = value.strip().strip('"').strip("'")
                    if cleaned_key and cleaned_key not in os.environ:
                        os.environ[cleaned_key] = cleaned_value
            print(f"Loaded environment variables from {env_path}")
        except Exception as exc:
            print(f"⚠️ Failed to load environment variables from {env_path}: {exc}")


load_env_file()
MODEL_PATH = (os.environ.get("MODEL_PATH") or DEFAULT_MODEL_PATH).strip() or DEFAULT_MODEL_PATH
MODEL_LOAD_PATH = MODEL_PATH if os.path.exists(MODEL_PATH) else DEFAULT_MODEL_PATH
BASE_CSV_PATH = (os.environ.get("BASE_CSV_PATH") or DEFAULT_BASE_CSV_PATH).strip() or DEFAULT_BASE_CSV_PATH
MONGO_URI = (os.environ.get("MONGO_URI") or "").strip()

try:
    RETRAIN_THRESHOLD = max(1, int(str(os.environ.get("RETRAIN_THRESHOLD", "4")).strip() or "4"))
except ValueError:
    RETRAIN_THRESHOLD = 4

warnings.filterwarnings(
    "ignore",
    message="Trying to unpickle estimator .*",
)


with open(MODEL_LOAD_PATH, "rb") as model_file:
    loaded_model_artifact = pickle.load(model_file)

if isinstance(loaded_model_artifact, dict) and "analysis_model" in loaded_model_artifact:
    model = loaded_model_artifact.get("analysis_model")
    role_classifier_model = loaded_model_artifact.get("role_classifier_model")
    role_classifier_accuracy = float(loaded_model_artifact.get("role_classifier_accuracy", 0.0) or 0.0)
    role_classifier_name = str(loaded_model_artifact.get("role_classifier_name", "") or "")
else:
    model = loaded_model_artifact

print(f"ML model loaded successfully from {MODEL_LOAD_PATH}")


ROLE_SKILL_MAP: Dict[str, List[str]] = {
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
}

GENERIC_ATS_SKILLS = [
    "communication",
    "problem solving",
    "team collaboration",
    "git",
    "documentation",
]

PROJECT_STRENGTH_KEYWORDS = [
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
]

EDUCATION_FEATURE_MAP = {
    "diploma": 1,
    "bachelors": 2,
    "masters": 3,
    "phd": 4,
    "other": 1,
}

EDUCATION_SCORE_MAP = {
    "diploma": 55,
    "bachelors": 74,
    "masters": 86,
    "phd": 94,
    "other": 60,
}


def is_port_open(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.5)
        return sock.connect_ex(("127.0.0.1", port)) == 0


def get_command_name(command: str) -> str:
    if os.name == "nt" and not command.endswith(".exe") and not command.endswith(".cmd"):
        if command == "npm":
            return "npm.cmd"
        if command == "node":
            return "node.exe"
    return command


def start_managed_process(command: List[str], cwd: str, label: str) -> None:
    executable = get_command_name(command[0])
    process = subprocess.Popen(
        [executable, *command[1:]],
        cwd=cwd,
    )
    managed_processes.append(process)
    print(f"Started {label}")


def ensure_support_services() -> None:
    if not is_port_open(NODE_PORT):
        start_managed_process(["node", "server.js"], BASE_DIR, "Node backend on port 5000")
    else:
        print("Node backend already running on port 5000")

    if not is_port_open(FRONTEND_PORT):
        start_managed_process(["npm", "run", "dev", "--", "--host", "127.0.0.1"], FRONTEND_DIR, "frontend on port 5173")
    else:
        print("Frontend already running on port 5173")


def cleanup_managed_processes() -> None:
    for process in managed_processes:
        if process.poll() is None:
            process.terminate()


atexit.register(cleanup_managed_processes)


def normalize_text(value: str = "") -> str:
    return str(value).strip().lower()


def normalize_skill(value: str = "") -> str:
    return re.sub(r"\s+", " ", normalize_text(value))


def normalize_education(value: str = "", custom_value: str = "") -> str:
    joined = f"{value} {custom_value}".lower()
    if "bachelor" in joined:
        return "bachelors"
    if "master" in joined:
        return "masters"
    if "phd" in joined:
        return "phd"
    if "diploma" in joined:
        return "diploma"
    return "other"


def resolve_role(role_text: str) -> Tuple[str, str, List[str]]:
    normalized_role = normalize_text(role_text)
    for role, skills in ROLE_SKILL_MAP.items():
        if role in normalized_role:
            return role, role.title(), skills
    fallback_label = role_text.strip() or "Your Target Role"
    return "generic", fallback_label, GENERIC_ATS_SKILLS


def matched_skills(user_skills: List[str], target_skills: List[str]) -> List[str]:
    matches: List[str] = []
    for target_skill in target_skills:
        normalized_target = normalize_skill(target_skill)
        if any(
            user_skill == normalized_target
            or user_skill in normalized_target
            or normalized_target in user_skill
            for user_skill in user_skills
        ):
            matches.append(target_skill)
    return matches


def compute_project_quality(project_text: str, role_matches: List[str]) -> Dict[str, int | bool]:
    normalized_project = normalize_text(project_text)
    word_count = len(normalized_project.split()) if normalized_project else 0
    keyword_hits = sum(1 for keyword in PROJECT_STRENGTH_KEYWORDS if keyword in normalized_project)
    role_hits = sum(1 for skill in role_matches if normalize_skill(skill) in normalized_project)
    has_metrics = bool(re.search(r"\b\d+(\.\d+)?%?\b", project_text or ""))

    length_score = min(40, round(word_count * 1.5))
    keyword_score = min(30, keyword_hits * 6)
    role_score = min(20, role_hits * 5)
    metrics_score = 10 if has_metrics else 0
    total_score = min(100, length_score + keyword_score + role_score + metrics_score)

    return {
        "wordCount": word_count,
        "keywordHits": keyword_hits,
        "roleEvidenceHits": role_hits,
        "hasMetrics": has_metrics,
        "score": total_score,
    }


def build_model_features(payload: dict, normalized_education: str, skills_count: int, certs_count: int) -> np.ndarray:
    project_word_count = len((payload.get("completedProjects") or "").split())
    languages_known = max(1, min(6, len({skill.split()[0] for skill in payload.get("skills", []) if str(skill).strip()})))
    desired_role_len = len((payload.get("desiredJobRoles") or "").strip())
    city_len = len((payload.get("currentCity") or "").strip())
    title_len = len((payload.get("previousJobTitle") or "").strip())

    features = np.array([[
        float(payload.get("experience", 0) or 0),
        EDUCATION_FEATURE_MAP.get(normalized_education, 1),
        skills_count,
        certs_count,
        max(1, round(project_word_count / 10) or 1),
        languages_known,
        0,
        desired_role_len,
        city_len,
        title_len,
        30,
    ]])
    return features


def safe_float(value: Any, default: Optional[float] = 0.0) -> Optional[float]:
    if value is None:
        return default
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip()
    if not text:
        return default
    try:
        return float(text)
    except (TypeError, ValueError):
        match = re.search(r"-?\d+(\.\d+)?", text)
        if match:
            try:
                return float(match.group())
            except ValueError:
                return default
    return default


def clamp_score(value: Any, minimum: int = 0, maximum: int = 100) -> int:
    numeric_value = safe_float(value, 0.0) or 0.0
    return int(max(minimum, min(maximum, round(numeric_value))))


def normalize_column_name(value: Any) -> str:
    return re.sub(r"[^a-z0-9]+", "_", str(value or "").strip().lower()).strip("_")


def split_compound_values(value: Any) -> List[str]:
    if isinstance(value, list):
        raw_items = value
    else:
        raw_items = re.split(r"[,\n;|]+", str(value or ""))
    return [str(item).strip() for item in raw_items if str(item).strip()]


def get_live_model():
    with model_lock:
        return model


def set_live_model(new_model) -> None:
    global model
    with model_lock:
        model = new_model


def get_model_prediction_mode(model_to_use) -> str:
    return getattr(model_to_use, "_urbridge_prediction_mode", "legacy_raw")


def predict_model_value(model_to_use, features: np.ndarray) -> float:
    return float(model_to_use.predict(np.asarray(features, dtype=float))[0])


def calibrate_model_output(model_to_use, raw_prediction: float) -> int:
    if get_model_prediction_mode(model_to_use) == "final_score_classifier":
        return clamp_score(raw_prediction, minimum=25, maximum=95)
    return clamp_score(raw_prediction * 8 + 22, minimum=25, maximum=95)


def get_resume_input_education(payload: dict) -> str:
    direct_value = str(payload.get("education", "") or "").strip()
    custom_value = str(payload.get("customEducation", "") or "").strip()
    if normalize_text(direct_value) == "other" and custom_value:
        return custom_value
    return direct_value or custom_value


def get_live_role_classifier_state() -> Tuple[Any, float, str]:
    with model_lock:
        return role_classifier_model, role_classifier_accuracy, role_classifier_name


def set_live_role_classifier(new_model, accuracy: float, model_name: str) -> None:
    global role_classifier_model, role_classifier_accuracy, role_classifier_name
    with model_lock:
        role_classifier_model = new_model
        role_classifier_accuracy = float(accuracy)
        role_classifier_name = str(model_name or "")


def persist_model_bundle(role_model_to_save, role_accuracy: float, role_model_name: str) -> None:
    model_directory = os.path.dirname(MODEL_PATH)
    if model_directory:
        os.makedirs(model_directory, exist_ok=True)
    bundle = {
        "analysis_model": get_live_model(),
        "role_classifier_model": role_model_to_save,
        "role_classifier_accuracy": float(role_accuracy),
        "role_classifier_name": str(role_model_name or ""),
    }
    with open(MODEL_PATH, "wb") as model_file:
        pickle.dump(bundle, model_file)


def normalize_role_label(value: Any) -> str:
    return str(value or "").strip()


def build_role_training_text(record: Dict[str, Any]) -> str:
    return " ".join([
        f"education {record.get('education_level', '')}",
        f"projects {record.get('completed_projects', '')}",
        f"skills {record.get('skills', '')}",
        f"certifications {record.get('certifications', '')}",
        f"city {record.get('current_city', '')}",
        f"title {record.get('previous_job_title', '')}",
    ]).strip()


def build_role_training_numeric_features(record: Dict[str, Any]) -> List[float]:
    projects = split_compound_values(record.get("completed_projects", ""))
    skills = split_compound_values(record.get("skills", ""))
    certifications = split_compound_values(record.get("certifications", ""))
    project_text = str(record.get("completed_projects", "") or "")
    project_quality = compute_project_quality(project_text, [])

    return [
        max(0.0, safe_float(record.get("years_of_experience", 0), 0.0) or 0.0),
        float(EDUCATION_FEATURE_MAP.get(normalize_education(str(record.get("education_level", "") or "")), 1)),
        float(len(projects)),
        float(project_quality["wordCount"]),
        float(project_quality["keywordHits"]),
        float(len(skills)),
        float(len(certifications)),
        float(len(str(record.get("current_city", "") or "").strip())),
        float(len(str(record.get("previous_job_title", "") or "").strip())),
    ]


class RoleTrainingFeatureTransformer(BaseEstimator, TransformerMixin):
    def __init__(self, max_text_features: int = 80):
        self.max_text_features = max_text_features
        self.vectorizer: Optional[TfidfVectorizer] = None

    def fit(self, X, y=None):
        self.vectorizer = TfidfVectorizer(max_features=self.max_text_features, ngram_range=(1, 2), min_df=1)
        self.vectorizer.fit([build_role_training_text(record) for record in X])
        return self

    def transform(self, X):
        if self.vectorizer is None:
            raise ValueError("RoleTrainingFeatureTransformer must be fitted before transform().")

        text_matrix = self.vectorizer.transform([build_role_training_text(record) for record in X]).toarray().astype(np.float32)
        numeric_matrix = np.asarray(
            [build_role_training_numeric_features(record) for record in X],
            dtype=np.float32,
        )
        return np.hstack([numeric_matrix, text_matrix])


def dedupe_preserve_order(items: List[str]) -> List[str]:
    seen = set()
    result: List[str] = []
    for item in items:
        cleaned = item.strip()
        if cleaned and cleaned not in seen:
            seen.add(cleaned)
            result.append(cleaned)
    return result


def ensure_minimum_suggestions(
    suggestions: List[str],
    role_label: str,
    target_skills: List[str],
    role_matches: List[str],
    missing_skills: List[str],
    experience: float,
    education_key: str,
    certifications: List[str],
    project_quality: Dict[str, int | bool],
) -> List[str]:
    fillers: List[str] = [
        f"Field-Specific Skills for {role_label}: {', '.join(target_skills[:10])}.",
        f"Already aligned skills for {role_label}: {', '.join(role_matches[:6]) if role_matches else 'No strong field-specific matches detected yet.'}",
        f"Missing priority skills for {role_label}: {', '.join(missing_skills[:8]) if missing_skills else 'Your current skill list already covers the major keywords for this field.'}",
        "Use an ATS-friendly resume structure with clear sections for Summary, Skills, Projects, Education, Certifications, and Experience.",
        "Rewrite project bullets with action verbs such as Built, Developed, Implemented, Optimized, Automated, or Improved.",
        "Keep the job-targeted keywords consistent across the Skills section, Project description, and Experience section.",
        "Avoid generic skill labels and replace them with specific tools, frameworks, databases, platforms, and methodologies.",
        "Add one short professional summary at the top of the resume that directly mentions your target role and strongest tools.",
        "Place the most job-relevant skills and projects in the upper half of the resume so recruiters and ATS systems see them first.",
        "Use consistent job titles, dates, and formatting so the resume is easier for ATS parsers and recruiters to read.",
        "Proofread for spelling, grammar, and capitalization because ATS systems and recruiters both penalize messy presentation.",
        "Tailor the resume for each application by matching keywords from the job description with the skills and projects you actually have.",
    ]

    if experience < 1:
        fillers.append(
            "Add academic projects, internships, freelance work, Kaggle work, or personal portfolio projects to strengthen early-career credibility."
        )
    if education_key == "other":
        fillers.append(
            "If your education path is non-standard, make the specialization and practical training very clear so recruiters understand your foundation quickly."
        )
    if len(certifications) < 2:
        fillers.append(
            f"Consider adding 1 to 2 certifications related to {role_label} to improve trust, keyword coverage, and shortlist chances."
        )
    if int(project_quality["wordCount"]) < 40:
        fillers.append(
            "Expand the project section with tech stack, business context, your exact contribution, and measurable outcomes in concise bullet points."
        )

    final_suggestions = dedupe_preserve_order(suggestions + fillers)
    while len(final_suggestions) < 10:
        final_suggestions.append(
            f"Refine the resume further for {role_label} by improving keyword relevance, measurable achievements, and field-specific technical depth."
        )
        final_suggestions = dedupe_preserve_order(final_suggestions)
        if len(final_suggestions) >= 10:
            break

    return final_suggestions[:12]


def generate_analysis(payload: dict, model_override=None) -> dict:
    current_model = model_override if model_override is not None else get_live_model()
    experience = max(0.0, float(payload.get("experience", 0) or 0))
    skills = [normalize_skill(item) for item in payload.get("skills", []) if str(item).strip()]
    certifications = [str(item).strip() for item in payload.get("certifications", []) if str(item).strip()]
    education_key = normalize_education(payload.get("education", ""), payload.get("customEducation", ""))
    _, role_label, target_skills = resolve_role(payload.get("desiredJobRoles", ""))
    role_matches = matched_skills(skills, target_skills)
    missing_skills = [skill for skill in target_skills if skill not in role_matches]

    project_quality = compute_project_quality(payload.get("completedProjects", ""), role_matches)
    skill_coverage_score = round((len(role_matches) / len(target_skills)) * 100) if target_skills else min(100, len(skills) * 12)
    skill_depth_score = min(100, len(skills) * 12)
    combined_skill_score = round(skill_coverage_score * 0.7 + skill_depth_score * 0.3)
    education_score = EDUCATION_SCORE_MAP.get(education_key, EDUCATION_SCORE_MAP["other"])
    experience_score = min(100, round(experience * 16))
    certification_score = min(100, len(certifications) * 25)

    model_features = build_model_features(payload, education_key, len(skills), len(certifications))
    raw_model_score = predict_model_value(current_model, model_features)
    calibrated_model_score = calibrate_model_output(current_model, raw_model_score)

    weighted_score = round(
        education_score * 0.18
        + combined_skill_score * 0.34
        + project_quality["score"] * 0.24
        + experience_score * 0.12
        + certification_score * 0.07
        + calibrated_model_score * 0.05
    )
    score = max(30, min(98, weighted_score))

    suggestions: List[str] = []
    suggestions.append(
        f"Field-Specific Skills for {role_label}: {', '.join(target_skills[:8])}."
    )
    if missing_skills:
        suggestions.append(
            f"For {role_label}, add or highlight these ATS skills if you genuinely know them: {', '.join(missing_skills[:6])}."
        )
    else:
        suggestions.append(
            f"Your listed skills already align well with {role_label}. Focus next on proving them through projects and experience bullets."
        )
    if len(skills) < 5:
        suggestions.append(
            "Increase your skills section to at least 5 role-relevant skills so ATS systems can match your resume more confidently."
        )
    else:
        suggestions.append(
            "Reorder your skills so the most important field-specific tools appear first and are easy for ATS systems to detect."
        )
    if project_quality["wordCount"] < 25:
        suggestions.append(
            "Expand the project description into 2 to 3 result-focused lines that explain the problem, tools used, and the final outcome."
        )
    else:
        suggestions.append(
            "Tighten the project description so each line clearly shows the problem solved, the stack used, and the business or technical result."
        )
    if not project_quality["hasMetrics"]:
        suggestions.append(
            "Add measurable project impact such as accuracy, time saved, dataset size, performance gain, or user growth."
        )
    else:
        suggestions.append(
            "Keep your measurable results prominent by using numbers, percentages, scale, or speed improvements in project bullets."
        )
    minimum_role_hits = min(2, len(role_matches) if role_matches else 2)
    if project_quality["roleEvidenceHits"] < minimum_role_hits:
        suggestions.append(
            f"Mention more {role_label} tools inside the project description so recruiters can see direct proof of skill usage."
        )
    else:
        suggestions.append(
            f"Your project already references relevant {role_label} tools. Strengthen it further by clarifying your exact contribution and impact."
        )
    if experience < 2:
        suggestions.append(
            "Strengthen the resume with internships, freelance work, research, or academic projects to show practical experience."
        )
    else:
        suggestions.append(
            "Convert your experience into achievement-focused bullets that show outcomes, ownership, and technologies used."
        )
    if len(certifications) == 0:
        suggestions.append(
            f"Add one recognized certification aligned with {role_label} to improve credibility and keyword coverage."
        )
    else:
        suggestions.append(
            "Keep certifications relevant to your target field and place the strongest or most recent one where it is easy to notice."
        )
    if education_key in {"other", "diploma"}:
        suggestions.append(
            "Make the education section ATS-friendly by clearly writing the degree name, specialization, institute, and graduation year."
        )
    else:
        suggestions.append(
            "Keep the education section concise but complete, including degree, specialization, institution, and graduation year."
        )
    if score >= 85:
        suggestions.append(
            f"Your profile is already strong for {role_label}. Focus next on sharper achievement bullets and stronger keyword placement."
        )
    else:
        suggestions.append(
            f"Improve ATS match further by tailoring the resume wording to each {role_label} job description you apply for."
        )

    suggestions = ensure_minimum_suggestions(
        suggestions=suggestions,
        role_label=role_label,
        target_skills=target_skills,
        role_matches=role_matches,
        missing_skills=missing_skills,
        experience=experience,
        education_key=education_key,
        certifications=certifications,
        project_quality=project_quality,
    )

    return {
        "score": score,
        "suggestions": suggestions,
        "diagnostics": {
            "role": role_label,
            "fieldSpecificSkills": target_skills[:12],
            "matchedSkills": role_matches,
            "missingSkills": missing_skills[:8],
            "projectQuality": project_quality,
            "educationKey": education_key,
            "modelScore": calibrated_model_score,
        },
    }


def resolve_database_name(uri: str) -> str:
    if not uri:
        return "test"
    try:
        parsed_uri = parse_uri(uri)
        database_name = parsed_uri.get("database")
        if database_name:
            return database_name
    except Exception:
        pass

    match = re.search(r"mongodb(?:\+srv)?:\/\/[^/]+/([^?]+)", uri)
    if match and match.group(1):
        return match.group(1)
    return "test"


def initialize_mongo() -> bool:
    global mongo_client, mongo_db, resume_inputs_collection, training_logs_collection

    if resume_inputs_collection is not None and training_logs_collection is not None:
        return True
    if MongoClient is None:
        print("⚠️ pymongo is not installed. MongoDB save and retraining are unavailable in this Python environment.")
        return False
    if not MONGO_URI:
        print("⚠️ MONGO_URI is not set. Skipping MongoDB save and retraining.")
        return False

    with mongo_lock:
        if resume_inputs_collection is not None and training_logs_collection is not None:
            return True
        try:
            if mongo_client is None:
                mongo_client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
            database_name = resolve_database_name(MONGO_URI)
            mongo_db = mongo_client[database_name]
            resume_inputs_collection = mongo_db["resume_inputs"]
            training_logs_collection = mongo_db["training_logs"]
            return True
        except Exception as exc:
            print(f"⚠️ MongoDB initialization error: {exc}")
            return False


def build_resume_input_document(payload: dict) -> dict:
    skills = split_compound_values(payload.get("skills", []))
    certifications = split_compound_values(payload.get("certifications", []))
    return {
        "years_of_experience": max(0.0, safe_float(payload.get("experience", 0), 0.0) or 0.0),
        "education_level": get_resume_input_education(payload),
        "desired_job_role": str(payload.get("desiredJobRoles", "") or "").strip(),
        "completed_projects": str(payload.get("completedProjects", "") or "").strip(),
        "skills": ", ".join(skills),
        "certifications": ", ".join(certifications),
        "current_city": str(payload.get("currentCity", "") or "").strip(),
        "previous_job_title": str(payload.get("previousJobTitle", "") or "").strip(),
        "created_at": datetime.utcnow(),
        "used_for_training": False,
    }


def build_payload_from_resume_document(resume_doc: dict) -> dict:
    return {
        "experience": safe_float(resume_doc.get("years_of_experience", 0), 0.0) or 0.0,
        "education": str(resume_doc.get("education_level", "") or "").strip(),
        "customEducation": "",
        "desiredJobRoles": str(resume_doc.get("desired_job_role", "") or "").strip(),
        "completedProjects": str(resume_doc.get("completed_projects", "") or "").strip(),
        "skills": split_compound_values(resume_doc.get("skills", "")),
        "certifications": split_compound_values(resume_doc.get("certifications", "")),
        "currentCity": str(resume_doc.get("current_city", "") or "").strip(),
        "previousJobTitle": str(resume_doc.get("previous_job_title", "") or "").strip(),
    }


def build_role_training_record_from_resume_document(resume_doc: dict) -> Optional[Dict[str, Any]]:
    normalized_doc = {
        normalize_column_name(key): value
        for key, value in resume_doc.items()
        if key is not None
    }
    return build_feature_row_from_csv_row(normalized_doc)


def encode_education_value(value: Any) -> float:
    numeric_value = safe_float(value, None)
    if numeric_value is not None:
        return float(numeric_value)
    return float(EDUCATION_FEATURE_MAP.get(normalize_education(str(value or "")), 1))


def encode_count_or_number(value: Any) -> float:
    numeric_value = safe_float(value, None)
    if numeric_value is not None:
        return max(0.0, float(numeric_value))
    return float(len(split_compound_values(value)))


def encode_project_value(value: Any) -> float:
    numeric_value = safe_float(value, None)
    if numeric_value is not None:
        return max(1.0, float(numeric_value))
    project_word_count = len(str(value or "").split())
    return float(max(1, round(project_word_count / 10) or 1))


def encode_language_value(value: Any, skills_source: Any = "") -> float:
    numeric_value = safe_float(value, None)
    if numeric_value is not None:
        return max(1.0, float(numeric_value))

    skill_tokens = split_compound_values(skills_source or value)
    normalized_tokens = {
        normalize_skill(token).split()[0]
        for token in skill_tokens
        if normalize_skill(token)
    }
    return float(max(1, min(6, len(normalized_tokens))))


def encode_text_length_or_number(value: Any) -> float:
    numeric_value = safe_float(value, None)
    if numeric_value is not None:
        return max(0.0, float(numeric_value))
    return float(len(str(value or "").strip()))


def encode_notice_or_availability(value: Any, default: float) -> float:
    numeric_value = safe_float(value, None)
    if numeric_value is not None:
        return max(0.0, float(numeric_value))
    text = normalize_text(value)
    if text == "immediate":
        return 0.0
    return float(default)


def build_feature_row_from_resume_document(resume_doc: dict) -> List[float]:
    skills_source = resume_doc.get("skills", "")
    return [
        max(0.0, safe_float(resume_doc.get("years_of_experience", 0), 0.0) or 0.0),
        encode_education_value(resume_doc.get("education_level", "")),
        encode_count_or_number(skills_source),
        encode_count_or_number(resume_doc.get("certifications", "")),
        encode_project_value(resume_doc.get("completed_projects", "")),
        encode_language_value(None, skills_source),
        0.0,
        encode_text_length_or_number(resume_doc.get("desired_job_role", "")),
        encode_text_length_or_number(resume_doc.get("current_city", "")),
        encode_text_length_or_number(resume_doc.get("previous_job_title", "")),
        30.0,
    ]


def get_csv_value(row: Dict[str, Any], field_name: str) -> Any:
    field_aliases = {
        "years_of_experience": ["years_of_experience", "experience"],
        "education_level": ["education_level", "education"],
        "completed_projects": ["completed_projects", "projects"],
        "skills": ["skills"],
        "certifications": ["certifications"],
        "current_city": ["current_city", "current_location_city", "city"],
        "previous_job_title": ["previous_job_title", "job_title", "title"],
        "desired_job_role": ["desired_job_role", "desired_role", "job_role", "role"],
    }
    for alias in field_aliases[field_name]:
        normalized_alias = normalize_column_name(alias)
        if normalized_alias in row and str(row[normalized_alias]).strip():
            return row[normalized_alias]
    return None


def build_feature_row_from_csv_row(row: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    target_role = normalize_role_label(get_csv_value(row, "desired_job_role"))
    if not target_role:
        return None

    return {
        "years_of_experience": max(0.0, safe_float(get_csv_value(row, "years_of_experience"), 0.0) or 0.0),
        "education_level": str(get_csv_value(row, "education_level") or "").strip(),
        "completed_projects": str(get_csv_value(row, "completed_projects") or "").strip(),
        "skills": str(get_csv_value(row, "skills") or "").strip(),
        "certifications": str(get_csv_value(row, "certifications") or "").strip(),
        "current_city": str(get_csv_value(row, "current_city") or "").strip(),
        "previous_job_title": str(get_csv_value(row, "previous_job_title") or "").strip(),
        "desired_job_role": target_role,
    }


def get_csv_target_value(row: Dict[str, Any]) -> Any:
    return normalize_role_label(get_csv_value(row, "desired_job_role"))


def load_base_csv_training_data() -> Tuple[List[Dict[str, Any]], List[str]]:
    feature_rows: List[Dict[str, Any]] = []
    labels: List[str] = []

    if not os.path.exists(BASE_CSV_PATH):
        print(f"⚠️ Base CSV not found at {BASE_CSV_PATH}. Continuing with MongoDB data only.")
        return feature_rows, labels

    try:
        with open(BASE_CSV_PATH, "r", encoding="utf-8-sig", newline="") as csv_file:
            reader = csv.DictReader(csv_file)
            for row in reader:
                normalized_row = {
                    normalize_column_name(key): value
                    for key, value in row.items()
                    if key is not None
                }
                feature_row = build_feature_row_from_csv_row(normalized_row)
                if feature_row is None:
                    continue

                feature_rows.append(feature_row)
                labels.append(feature_row[ROLE_TARGET_FIELD])
    except Exception as exc:
        print(f"⚠️ Failed to load base CSV training data: {exc}")

    return feature_rows, labels


def evaluate_live_model_accuracy(current_model_snapshot, X_test: List[Dict[str, Any]], y_test: List[str]) -> float:
    if current_model_snapshot is None or len(X_test) == 0 or len(y_test) == 0:
        return 0.0

    try:
        return float(accuracy_score(y_test, current_model_snapshot.predict(X_test)))
    except Exception as exc:
        print(f"⚠️ Failed to evaluate current live role model accuracy: {exc}")
        return 0.0


def maybe_start_background_retrain(pending_count: Optional[int] = None, announce_saved_log: bool = True) -> bool:
    global retraining_in_progress

    if not initialize_mongo():
        return False

    try:
        if pending_count is None:
            pending_count = int(resume_inputs_collection.count_documents({"used_for_training": False}))
    except Exception as exc:
        print(f"⚠️ Failed to count pending retraining inputs: {exc}")
        return False

    pending_count = max(0, int(pending_count))
    remaining_needed = max(RETRAIN_THRESHOLD - pending_count, 0)
    if announce_saved_log:
        print(f"📥 New input saved. {remaining_needed} more needed to retrain.")

    if pending_count < RETRAIN_THRESHOLD:
        return False

    with retrain_state_lock:
        if retraining_in_progress:
            return False
        retraining_in_progress = True

    print("🔄 Retraining started in background...")
    retrain_thread = threading.Thread(target=retrain_models_in_background, daemon=True)
    retrain_thread.start()
    return True


def check_and_retrain() -> None:
    try:
        maybe_start_background_retrain()
    except Exception as exc:
        print(f"⚠️ check_and_retrain error: {exc}")


def save_resume_input(payload: dict) -> None:
    if not initialize_mongo():
        return

    try:
        resume_inputs_collection.insert_one(build_resume_input_document(payload))
        check_and_retrain()
    except Exception as exc:
        print(f"⚠️ Failed to save resume input to MongoDB: {exc}")


def retrain_models_in_background() -> None:
    global retraining_in_progress

    try:
        if not initialize_mongo():
            return

        batch_docs = list(
            resume_inputs_collection
            .find({"used_for_training": False})
            .sort("created_at", 1)
            .limit(RETRAIN_THRESHOLD)
        )
        if len(batch_docs) < RETRAIN_THRESHOLD:
            print("⚠️ Retraining skipped because fewer than 4 new inputs are available.")
            return

        current_role_model_snapshot, _, _ = get_live_role_classifier_state()
        batch_ids = [document["_id"] for document in batch_docs if "_id" in document]
        all_resume_docs = list(resume_inputs_collection.find({}))

        combined_features, combined_labels = load_base_csv_training_data()
        for resume_doc in all_resume_docs:
            try:
                role_training_record = build_role_training_record_from_resume_document(resume_doc)
                if role_training_record is None:
                    continue
                combined_features.append(role_training_record)
                combined_labels.append(role_training_record[ROLE_TARGET_FIELD])
            except Exception as doc_exc:
                print(f"⚠️ Skipping one MongoDB resume input during retraining: {doc_exc}")

        label_counts = Counter(combined_labels)
        if len(combined_features) < 8 or len(label_counts) < 2:
            print("⚠️ Retraining skipped because the combined dataset is not large enough for model selection.")
            return

        selection_features = combined_features
        selection_labels = combined_labels
        if len(combined_features) > MODEL_SELECTION_MAX_ROWS:
            selection_features, _, selection_labels, _ = train_test_split(
                combined_features,
                combined_labels,
                train_size=MODEL_SELECTION_MAX_ROWS,
                random_state=42,
                stratify=combined_labels if min(label_counts.values()) >= 2 else None,
            )

        selection_label_counts = Counter(selection_labels)
        print(
            f"🔄 Evaluating models on {len(selection_features)} records and fitting the winner on {len(combined_features)} total records..."
        )
        X_train, X_test, y_train, y_test = train_test_split(
            selection_features,
            selection_labels,
            test_size=0.2 if len(selection_features) >= 10 else 0.5,
            random_state=42,
            stratify=selection_labels if min(selection_label_counts.values()) >= 2 else None,
        )

        current_accuracy = evaluate_live_model_accuracy(current_role_model_snapshot, X_test, y_test)
        candidate_models = [
            (
                "RandomForest",
                make_pipeline(
                    RoleTrainingFeatureTransformer(),
                    RandomForestClassifier(n_estimators=200, random_state=42),
                ),
            ),
            (
                "GradientBoosting",
                make_pipeline(
                    RoleTrainingFeatureTransformer(),
                    GradientBoostingClassifier(random_state=42),
                ),
            ),
            (
                "LogisticRegression",
                make_pipeline(
                    RoleTrainingFeatureTransformer(),
                    StandardScaler(),
                    LogisticRegression(max_iter=2000),
                ),
            ),
        ]

        best_model = None
        best_model_name = ""
        best_accuracy = -1.0

        for model_name, candidate_model in candidate_models:
            try:
                candidate_model.fit(X_train, y_train)
                candidate_predictions = candidate_model.predict(X_test)
                candidate_accuracy = float(accuracy_score(y_test, candidate_predictions))
                if candidate_accuracy > best_accuracy:
                    best_accuracy = candidate_accuracy
                    best_model = candidate_model
                    best_model_name = model_name
            except Exception as model_exc:
                print(f"⚠️ {model_name} training failed: {model_exc}")

        if best_model is None:
            print("⚠️ Retraining failed because none of the candidate models trained successfully.")
            return

        model_improved = best_accuracy > current_accuracy

        if model_improved:
            best_model.fit(combined_features, combined_labels)
            persist_model_bundle(best_model, best_accuracy, best_model_name)
            set_live_role_classifier(best_model, best_accuracy, best_model_name)
        else:
            print("⚠️ New model not better, keeping old model.")

        try:
            if batch_ids:
                resume_inputs_collection.update_many(
                    {"_id": {"$in": batch_ids}},
                    {"$set": {"used_for_training": True}},
                )
        except Exception as update_exc:
            print(f"⚠️ Failed to mark retrained MongoDB inputs: {update_exc}")

        try:
            training_logs_collection.insert_one({
                "trained_at": datetime.utcnow(),
                "total_records_used": int(len(combined_features)),
                "accuracy": round(best_accuracy * 100, 2),
                "model_improved": bool(model_improved),
                "best_model": best_model_name,
                "target_column": "Desired Job Role",
            })
        except Exception as log_exc:
            print(f"⚠️ Failed to save training log: {log_exc}")

        print(f"✅ Retraining done! Best model: {best_model_name} | Accuracy: {best_accuracy * 100:.2f}%")
    except Exception as exc:
        print(f"⚠️ Background retraining failed: {exc}")
    finally:
        with retrain_state_lock:
            retraining_in_progress = False
        try:
            if initialize_mongo():
                pending_after = int(resume_inputs_collection.count_documents({"used_for_training": False}))
                if pending_after >= RETRAIN_THRESHOLD:
                    maybe_start_background_retrain(pending_count=pending_after, announce_saved_log=False)
        except Exception as exc:
            print(f"⚠️ Failed to re-check pending retraining inputs: {exc}")


@app.route("/predict", methods=["POST"])
def predict():
    payload = request.get_json(silent=True) or {}

    try:
        result = generate_analysis(payload)
        try:
            save_resume_input(payload)
        except Exception as save_exc:
            print(f"⚠️ Resume input persistence error: {save_exc}")
        return jsonify(result)
    except Exception as exc:
        print("ML predict error:", exc)
        return jsonify({"error": str(exc)}), 500


@app.route("/", methods=["GET"])
def index():
    return jsonify({
        "message": "UrBridge.ai ML service is running",
        "status": "ok",
        "endpoints": {
            "health": "http://127.0.0.1:5001/health",
            "predict": "POST http://127.0.0.1:5001/predict",
            "frontend": "http://127.0.0.1:5173",
            "backend": "http://127.0.0.1:5000/api/health",
        },
    })


@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "status": "ml_service running",
        "mlPort": ML_PORT,
        "backendPort": NODE_PORT,
        "frontendPort": FRONTEND_PORT,
    })


if __name__ == "__main__":
    ensure_support_services()
    print("ML API running on http://127.0.0.1:5001")
    print("Node backend expected on http://127.0.0.1:5000")
    print("Frontend expected on http://127.0.0.1:5173")
    app.run(host="127.0.0.1", port=ML_PORT, debug=False, threaded=True, load_dotenv=False)
