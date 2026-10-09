const fs = require("fs");
const path = require("path");
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");

const KNOWN_SKILLS = [
  "JavaScript", "TypeScript", "Node.js", "Express.js", "React", "Angular", "Vue.js",
  "HTML", "CSS", "Python", "Java", "C", "C++", "C#", "PHP", "SQL", "MySQL",
  "PostgreSQL", "MongoDB", "Mongoose", "REST API", "GraphQL", "Git", "GitHub",
  "Docker", "Kubernetes", "AWS", "Azure", "Google Cloud", "Linux", "Power BI",
  "Tableau", "Microsoft Excel", "Excel", "Pandas", "NumPy", "scikit-learn",
  "Machine Learning", "Data Analysis", "Data Visualization", "Statistics",
  "Communication", "Project Management", "Agile", "Scrum", "Jira", "Figma",
  "Spring Boot", "Django", "Flask", "Redis", "Firebase", "CI/CD", "Jenkins",
  "Terraform", "Cybersecurity", "Wireshark", "Nmap", "Data Structures",
  "Algorithms", "OOP", "Problem Solving", "PowerPoint", "Microsoft Word"
];

const SKILL_SECTION = /^(?:technical\\s+skills?|skills(?:\\s+and\\s+(?:competencies|technologies))?|core\\s+competencies|competencies|technologies|tools\\s+and\\s+technologies|technical\\s+expertise|key\\s+skills)\\s*:?$/i;
const OTHER_SECTION = /^(?:professional\\s+summary|summary|objective|experience|work\\s+experience|professional\\s+experience|employment\\s+history|education|projects?|certifications?|achievements?|interests|languages|publications|references)\\s*:?$/i;

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&").replace(/\\s+/g, "\\\\s+");
}

function findSkillsInText(text) {
  const normalized = String(text || "").replace(/\\u00a0/g, " ").replace(/\\s+/g, " ").toLowerCase();
  const found = [];
  for (const skill of KNOWN_SKILLS) {
    const escaped = escapeRegex(skill.toLowerCase());
    const pattern = new RegExp(`(^|[^a-z0-9+#.])${escaped}($|[^a-z0-9+#.])`, "i");
    if (pattern.test(normalized) && !found.some(item => item.toLowerCase() === skill.toLowerCase())) found.push(skill);
  }
  return found;
}

function extractKnownSkills(text) {
  const lines = String(text || "").replace(/\\u00a0/g, " ").split(/\\r?\\n/).map(line => line.trim()).filter(Boolean);
  const sections = [];
  let activeSection = "";
  for (const line of lines) {
    const heading = line.replace(/[•*#:_-]+$/g, "").trim();
    if (SKILL_SECTION.test(heading)) {
      activeSection = "skills";
      continue;
    }
    if (OTHER_SECTION.test(heading)) {
      activeSection = "";
      continue;
    }
    if (activeSection === "skills") sections.push(line);
  }
  const sectionSkills = findSkillsInText(sections.join(" "));
  // Prefer a dedicated skills section to avoid treating every technology mentioned
  // in project descriptions as a verified skill. Fall back for resumes without headings.
  return sectionSkills.length ? sectionSkills : findSkillsInText(text);
}

async function extractResumeSkills(filePath, originalName = "") {
  const extension = path.extname(originalName || filePath).toLowerCase();
  try {
    let text = "";
    if (extension === ".pdf") {
      const buffer = await fs.promises.readFile(filePath);
      const parsed = await pdfParse(buffer);
      text = parsed.text || "";
    } else if (extension === ".docx") {
      const parsed = await mammoth.extractRawText({ path: filePath });
      text = parsed.value || "";
    } else {
      return { skills: [], status: "unsupported", message: "Automatic skill extraction supports text-based PDF and DOCX files. This DOC file was saved, but its skills could not be extracted." };
    }
    if (!text.trim()) return { skills: [], status: "partial", message: "No readable text found. If this is a scanned/image PDF, use a text-based PDF or DOCX." };
    const skills = extractKnownSkills(text);
    return {
      skills,
      status: skills.length ? "complete" : "partial",
      message: skills.length ? `Extracted ${skills.length} skills from resume text.` : "Resume text was read, but no skills from the supported skill list were detected."
    };
  } catch (error) {
    console.error("Resume skill extraction error:", error.message);
    return { skills: [], status: "failed", message: "Resume uploaded, but automatic skill extraction failed. You can still view or download the file." };
  }
}

module.exports = { extractResumeSkills, extractKnownSkills };
