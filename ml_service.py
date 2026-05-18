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
import os
import pickle
import re
import socket
import subprocess
import sys
import warnings
from typing import Dict, List, Tuple

import numpy as np


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.abspath(os.path.join(BASE_DIR, ".."))
MODEL_PATH = os.path.join(BASE_DIR, "resume_analyzer_model.pkl")
ML_PORT = 5001
NODE_PORT = 5000
FRONTEND_PORT = 5173

app = Flask(__name__)
managed_processes: List[subprocess.Popen] = []

warnings.filterwarnings(
    "ignore",
    message="Trying to unpickle estimator .*",
)


with open(MODEL_PATH, "rb") as model_file:
    model = pickle.load(model_file)

print("ML model loaded successfully")


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


def generate_analysis(payload: dict) -> dict:
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
    raw_model_score = float(model.predict(model_features)[0])
    calibrated_model_score = max(25, min(95, round(raw_model_score * 8 + 22)))

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


@app.route("/predict", methods=["POST"])
def predict():
    payload = request.get_json(silent=True) or {}

    try:
        result = generate_analysis(payload)
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
