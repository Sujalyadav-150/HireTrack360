// Explicit Vercel function for updating or closing a recruiter-owned job.
const apiHandler = require("../../[...path]");

module.exports = function recruiterJobHandler(req, res) {
  const originalUrl = req.url || "";
  const queryIndex = originalUrl.indexOf("?");
  const query = queryIndex >= 0 ? originalUrl.slice(queryIndex) : "";
  const jobId = req.query?.jobId;
  if (typeof jobId !== "string" || !/^[a-f\d]{24}$/i.test(jobId)) {
    return res.status(400).json({ success: false, message: "A valid job ID is required" });
  }
  req.url = "/api/recruiter/jobs/" + jobId + query;
  return apiHandler(req, res);
};
