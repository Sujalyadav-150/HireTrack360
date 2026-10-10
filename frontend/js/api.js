const API_BASE = (() => {
  return window.location.protocol === "file:" ? "http://localhost:5000/api" : "/api";
})();

async function apiRequest(path, options = {}) {
  const token = localStorage.getItem("hiretrack_token");
  const headers = { ...(options.headers || {}) };
  if (!(options.body instanceof FormData)) headers["Content-Type"] = headers["Content-Type"] || "application/json";
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: "same-origin",
    headers: {
      ...(token && token !== "undefined" ? { Authorization: `Bearer ${token}` } : {}),
      ...headers
    }
  });
  const rawResponse = await response.text();
  let result = {};
  try { result = rawResponse ? JSON.parse(rawResponse) : {}; } catch {}
  if (!response.ok) {
    if (response.status === 401) {
      localStorage.removeItem("hiretrack_token");
      localStorage.removeItem("hiretrack_role");
      localStorage.removeItem("hiretrack_name");
    }
    const error = new Error(result.message || `Request failed (${response.status}) at ${path}. Check Vercel Runtime Logs for the server-side error.`);
    error.status = response.status;
    error.path = path;
    throw error;
  }
  return result;
}

window.apiRequest = apiRequest;

window.downloadProtectedFile = async function downloadProtectedFile(path, fileName) {
  const token = localStorage.getItem("hiretrack_token");
  const url = path.startsWith("/api/") ? path : `${API_BASE}${path}`;
  const response = await fetch(url, { credentials: "same-origin", headers: token && token !== "undefined" ? { Authorization: `Bearer ${token}` } : {} });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.message || "File could not be downloaded");
  }
  const objectUrl = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
};

window.viewProtectedFile = async function viewProtectedFile(path) {
  const previewWindow = window.open("about:blank", "_blank");
  if (!previewWindow) throw new Error("Allow pop-ups to preview the resume");
  previewWindow.document.title = "Loading resume…";
  const token = localStorage.getItem("hiretrack_token");
  const url = path.startsWith("/api/") ? path : `${API_BASE}${path}`;
  try {
    const response = await fetch(url, { credentials: "same-origin", headers: token && token !== "undefined" ? { Authorization: `Bearer ${token}` } : {} });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      throw new Error(result.message || "Resume could not be opened");
    }
    const objectUrl = URL.createObjectURL(await response.blob());
    previewWindow.location.href = objectUrl;
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
  } catch (error) {
    previewWindow.close();
    throw error;
  }
};
