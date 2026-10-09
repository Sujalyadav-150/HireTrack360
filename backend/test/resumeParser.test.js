const test = require("node:test");
const assert = require("node:assert/strict");
const { extractKnownSkills, findSkillsInText } = require("../utils/resumeParser");

test("extracts skills from a same-line skills heading", () => {
  assert.deepEqual(
    extractKnownSkills("Technical Skills: JavaScript, Node JS, React.js, Python, SQL, PowerBI, MS Excel"),
    ["JavaScript", "Node.js", "React", "Python", "SQL", "Power BI", "Microsoft Excel", "Excel"]
  );
});

test("extracts skills from multiline sections and stops before projects", () => {
  const resume = [
    "Candidate",
    "TECHNICAL SKILLS",
    "Programming: Python, Java, C++",
    "Database: MySQL, MongoDB",
    "Tools: GitHub, Docker",
    "PROJECTS",
    "Built a React application"
  ].join("\n");
  assert.deepEqual(extractKnownSkills(resume), [
    "Python", "Java", "C++", "MySQL", "MongoDB", "GitHub", "Docker"
  ]);
});

test("falls back to known skills when there is no skills heading", () => {
  assert.deepEqual(
    extractKnownSkills("Experience with Power BI, Advanced Excel, SQL and Pandas."),
    ["SQL", "Power BI", "Microsoft Excel", "Excel", "Pandas"]
  );
});

test("does not confuse Java with JavaScript", () => {
  assert.deepEqual(findSkillsInText("JavaScript and TypeScript"), ["JavaScript", "TypeScript"]);
});

test("recognizes common punctuation and alias variants", () => {
  assert.deepEqual(
    findSkillsInText("Node.js, Node JS, React JS, K8s, AWS, scikit learn, CI/CD"),
    ["Node.js", "React", "Kubernetes", "AWS", "scikit-learn", "CI/CD"]
  );
});
