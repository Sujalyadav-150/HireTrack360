const test = require("node:test");
const assert = require("node:assert/strict");
const { extractKnownSkills, findSkillsInText } = require("./resumeParser");

test("extracts common skills from a same-line Technical Skills heading", () => {
  assert.deepEqual(
    extractKnownSkills("Technical Skills: JavaScript, Node JS, React.js, Python, SQL, PowerBI, MS Excel"),
    ["JavaScript", "Node.js", "React", "Python", "SQL", "Power BI", "Microsoft Excel", "Excel"]
  );
});

test("extracts skills from a multiline skills section", () => {
  const resume = `NAME: Example Candidate
SUMMARY
Entry-level developer
TECHNICAL SKILLS
Programming: Python, Java, C++
Database: MySQL, MongoDB
Tools: GitHub, Docker
PROJECTS
Built a website`;
  assert.deepEqual(extractKnownSkills(resume), [
    "Python", "Java", "C++", "MySQL", "MongoDB", "GitHub", "Docker"
  ]);
});

test("falls back to text when a resume has no skills heading", () => {
  assert.deepEqual(
    extractKnownSkills("Candidate has experience with Power BI, Advanced Excel, SQL and Pandas."),
    ["SQL", "Power BI", "Microsoft Excel", "Excel", "Pandas"]
  );
});

test("does not confuse Java with JavaScript", () => {
  assert.deepEqual(findSkillsInText("JavaScript and TypeScript"), ["JavaScript", "TypeScript"]);
});

test("recognizes common alias spellings", () => {
  assert.deepEqual(
    findSkillsInText("Node.js, Node JS, React JS, K8s, AWS, scikit learn, CI/CD"),
    ["Node.js", "React", "Kubernetes", "AWS", "scikit-learn", "CI/CD"]
  );
});
