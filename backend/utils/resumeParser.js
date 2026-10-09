const fs = require("fs");
const path = require("path");
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");

// Canonical names shown in the profile. Aliases cover common resume spellings.
const SKILL_ALIASES = {
  "JavaScript": ["javascript", "java script", "js"],
  "TypeScript": ["typescript", "type script", "ts"],
  "Node.js": ["node.js", "node js", "nodejs"],
  "Express.js": ["express.js", "express js", "express"],
  "React": ["react", "react.js", "react js"],
  "Angular": ["angular", "angular.js"],
  "Vue.js": ["vue.js", "vue js", "vue"],
  "HTML": ["html", "html5"],
  "CSS": ["css", "css3"],
  "Python": ["python", "python3"],
  "Java": ["java"],
  "C": ["c language"],
  "C++": ["c++", "cpp"],
  "C#": ["c#", "c sharp"],
  "PHP": ["php"],
  "SQL": ["sql", "structured query language"],
  "MySQL": ["mysql", "my sql"],
  "PostgreSQL": ["postgresql", "postgres", "postgre sql"],
  "MongoDB": ["mongodb", "mongo db"],
  "Mongoose": ["mongoose"],
  "REST API": ["rest api", "rest apis", "restful api", "restful apis"],
  "GraphQL": ["graphql", "graph ql"],
  "Git": ["git"],
  "GitHub": ["github", "git hub"],
  "Docker": ["docker"],
  "Kubernetes": ["kubernetes", "k8s"],
  "AWS": ["aws", "amazon web services"],
  "Azure": ["azure", "microsoft azure"],
  "Google Cloud": ["google cloud", "gcp"],
  "Linux": ["linux"],
  "Power BI": ["power bi", "powerbi"],
  "Tableau": ["tableau"],
  "Microsoft Excel": ["microsoft excel", "ms excel", "advanced excel"],
  "Excel": ["excel", "spreadsheet"],
  "Pandas": ["pandas"],
  "NumPy": ["numpy", "num py"],
  "scikit-learn": ["scikit-learn", "scikit learn", "sklearn"],
  "Machine Learning": ["machine learning", "ml"],
  "Data Analysis": ["data analysis", "data analytics", "data analyst"],
  "Data Visualization": ["data visualization", "data visualisation"],
  "Statistics": ["statistics", "statistical analysis"],
  "Communication": ["communication", "communication skills"],
  "Project Management": ["project management"],
  "Agile": ["agile"],
  "Scrum": ["scrum"],
  "Jira": ["jira"],
  "Figma": ["figma"],
  "Spring Boot": ["spring boot"],
  "Django": ["django"],
  "Flask": ["flask"],
  "Redis": ["redis"],
  "Firebase": ["firebase"],
  "CI/CD": ["ci/cd", "continuous integration", "continuous deployment"],
  "Jenkins": ["jenkins"],
  "Terraform": ["terraform"],
  "Cybersecurity": ["cybersecurity", "cyber security", "information security"],
  "Wireshark": ["wireshark"],
  "Nmap": ["nmap"],
  "Data Structures": ["data structures", "data structure"],
  "Algorithms": ["algorithms", "algorithm"],
  "OOP": ["oop", "object oriented programming", "object-oriented programming"],
  "Problem Solving": ["problem solving", "problem-solving"],
  "PowerPoint": ["powerpoint", "power point", "ms powerpoint"],
  "Microsoft Word": ["microsoft word", "ms word"]
};

const SKILL_SECTION = /^(?:technical\s+skills?|skills(?:\s+and\s+(?:competencies|technologies))?|core\s+competencies|competencies|technologies|tools\s+and\s+technologies|technical\s+expertise|key\s+skills)\s*:?$/i;
const OTHER_SECTION = /^(?:professional\s+summary|summary|objective|experience|work\s+experience|professional\s+experience|employment\s+history|education|projects?|certifications?|achievements?|interests|languages|publications|references|internships?|personal\s+details)\s*:?$/i;

function normalizeForMatching(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\u00a0/g, " ")
    .replace(/[^a-z0-9+#/.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function aliasMatches(text, alias) {
  const normalizedText = ` ${normalizeForMatching(text)} `;
  const normalizedAlias = normalizeForMatching(alias);
  if (!normalizedAlias) return false;
  // Whitespace boundaries prevent "java" matching "javascript", while allowing
  // common punctuation differences such as "Node.js" and "Node JS".
  const escaped = normalizedAlias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  return new RegExp(`(?:^|\\s)${escaped}(?:$|\\s)`, "i").test(normalizedText);
}

function findSkillsInText(text) {
  const found = [];
  for (const [canonical, aliases] of Object.entries(SKILL_ALIASES)) {
    if (aliases.some(alias => aliasMatches(text, alias))) found.push(canonical);
  }
  return found;
}

function extractKnownSkills(text) {
  const lines = String(text || "")
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, "\n")
    .split(/\n+/)
    .map(line => line.replace(/[•▪◦]/g, " ").trim())
    .filter(Boolean);

  const skillLines = [];
  let inSkillsSection = false;
  for (const line of lines) {
    // Handles both standalone headings ("Technical Skills") and headings followed
    // by content on the same line ("Technical Skills: Python, SQL, Power BI").
    const headingMatch = line.match(/^((?:technical\s+skills?|skills(?:\s+and\s+(?:competencies|technologies))?|core\s+competencies|competencies|technologies|tools\s+and\s+technologies|technical\s+expertise|key\s+skills))\s*:?\s*(.*)$/i);
    const heading = line.replace(/[•*#:_-]+$/g, "").trim();
    if (headingMatch) {
      inSkillsSection = true;
      if (headingMatch[2].trim()) skillLines.push(headingMatch[2].trim());
      continue;
    }
    if (OTHER_SECTION.test(heading)) {
      inSkillsSection = false;
      continue;
    }
    if (inSkillsSection) skillLines.push(line);
  }

  const sectionSkills = findSkillsInText(skillLines.join(" "));
  // Some resumes do not label a skills section, so scan the full extracted text as
  // a fallback. Only known aliases are returned; this is not an AI inference.
  return sectionSkills.length ? sectionSkills : findSkillsInText(lines.join(" "));
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
      return {
        skills: [],
        status: "unsupported",
        message: "Automatic extraction supports text-based PDF and DOCX files. Legacy .DOC files are saved, but their skills are not extracted automatically. Save this file as PDF or DOCX and upload again."
      };
    }

    if (!text.trim()) {
      return {
        skills: [],
        status: "partial",
        message: "The file contains no selectable text. If it is a scanned/image PDF, OCR is needed; try exporting it as a text-based PDF or DOCX."
      };
    }

    const skills = extractKnownSkills(text);
    return {
      skills,
      status: skills.length ? "complete" : "partial",
      message: skills.length
        ? `Extracted ${skills.length} supported skills from resume text.`
        : "Resume text was readable, but no supported skill names or aliases were found. Check the Skills section or add more skill aliases to the parser."
    };
  } catch (error) {
    console.error("Resume skill extraction error:", error.message);
    return {
      skills: [],
      status: "failed",
      message: "Resume uploaded, but text extraction failed. Try a text-based PDF or DOCX file and check the backend terminal for the extraction error."
    };
  }
}

module.exports = { extractResumeSkills, extractKnownSkills, findSkillsInText };
