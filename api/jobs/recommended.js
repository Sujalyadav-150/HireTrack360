// Explicit Vercel function for personalized job recommendations.
const apiHandler = require("../[...path]");

module.exports = function recommendedJobsHandler(req, res) {
  const originalUrl = req.url || "";
  const queryIndex = originalUrl.indexOf("?");
  const query = queryIndex >= 0 ? originalUrl.slice(queryIndex) : "";
  req.url = "/api/jobs/recommended" + query;
  return apiHandler(req, res);
};
