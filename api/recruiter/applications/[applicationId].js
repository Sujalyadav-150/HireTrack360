// Explicit Vercel route for recruiter application status updates.
// Forward the dynamic application ID to the Express API handler.
const apiHandler = require("../../[...path]");

module.exports = function recruiterApplicationHandler(req, res) {
  const originalUrl = req.url || "";
  const queryIndex = originalUrl.indexOf("?");
  const query = queryIndex >= 0 ? originalUrl.slice(queryIndex) : "";
  const applicationId = req.query?.applicationId;

  if (typeof applicationId !== "string" || !/^[a-f\d]{24}$/i.test(applicationId)) {
    return res.status(400).json({ success: false, message: "A valid application ID is required" });
  }

  if (req.method !== "PATCH") {
    res.setHeader("Allow", "PATCH");
    return res.status(405).json({ success: false, message: "Method not allowed" });
  }

  req.url = "/api/recruiter/applications/" + applicationId + query;
  return apiHandler(req, res);
};
