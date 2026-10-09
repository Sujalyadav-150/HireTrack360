// Explicit Vercel route for completing or cancelling an interview.
// Forward the dynamic interview ID to the Express API handler.
const apiHandler = require("../[...path]");

module.exports = function interviewStatusHandler(req, res) {
  const originalUrl = req.url || "";
  const queryIndex = originalUrl.indexOf("?");
  const query = queryIndex >= 0 ? originalUrl.slice(queryIndex) : "";
  const interviewId = req.query?.interviewId;

  if (typeof interviewId !== "string" || !/^[a-f\d]{24}$/i.test(interviewId)) {
    return res.status(400).json({ success: false, message: "A valid interview ID is required" });
  }

  if (req.method !== "PATCH") {
    res.setHeader("Allow", "PATCH");
    return res.status(405).json({ success: false, message: "Method not allowed" });
  }

  req.url = "/api/interviews/" + interviewId + query;
  return apiHandler(req, res);
};
