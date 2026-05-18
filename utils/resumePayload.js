export function sanitizeResumePayload(body = {}, fallbackName = "") {
  return {
    name: body.name?.trim() || fallbackName || "",
    skills: Array.isArray(body.skills)
      ? body.skills.map((item) => String(item).trim()).filter(Boolean)
      : [],
    experience: Math.max(0, Number(body.experience) || 0),
    education: body.education?.trim() || "",
    customEducation: body.customEducation?.trim() || "",
    certifications: Array.isArray(body.certifications)
      ? body.certifications
          .map((item) => String(item).trim())
          .filter((item) => item && item.toLowerCase() !== 'n/a' && item.toLowerCase() !== 'na')
      : [],
    completedProjects: body.completedProjects?.trim() || "",
    desiredJobRoles: body.desiredJobRoles?.trim() || "",
    currentCity: body.currentCity?.trim() || "",
    previousJobTitle: body.previousJobTitle?.trim() && body.previousJobTitle.trim().toLowerCase() !== 'n/a' && body.previousJobTitle.trim().toLowerCase() !== 'na'
      ? body.previousJobTitle.trim()
      : "",
  };
}
