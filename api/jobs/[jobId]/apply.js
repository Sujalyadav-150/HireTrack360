// Explicit Vercel function for applying to a job.
// Forward the request to the Express route so nested job actions are deployed
// consistently instead of falling through to Vercel's platform 404 page.
const apiHandler = require("../../[...path]");

module.exports = function applyToJobHandler(req, res) {
  const originalUrl = req.url || "";
  const queryIndex = originalUrl.indexOf("?");
  const query = queryIndex >= 0 ? originalUrl.slice(queryIndex) : "";
  const jobId = req.query?.jobId;

  if (typeof jobId !== "string" || !/^[a-f\d]{24}$/i.test(jobId)) {
    return res.status(400).json({ success: false, message: "A valid job ID is required" });
  }

  req.url = "/api/jobs/" + jobId + "/apply" + query;
  return apiHandler(req, res);
};
