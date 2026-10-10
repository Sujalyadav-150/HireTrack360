# HireTrack360 — Smart Job Search & Application Intelligence

HireTrack360 is a job portal designed to help job seekers discover relevant opportunities and track applications, while giving recruiters a workspace to publish jobs and manage candidates.

## Live Demo

- **Website:** https://hiretrack360-ten.vercel.app/
- **GitHub Repository:** https://github.com/Sujalyadav-150/HireTrack360

> Note: Live features depend on the current deployment and configured environment variables. Test the complete flow before an interview.

## Key Features

### For Job Seekers
- Create an account and sign in as a job seeker.
- Browse and filter available job listings.
- Review job details and apply for jobs.
- Track submitted applications and their statuses.
- **Job Match Score:** compare profile skills with job requirements to help assess relevance.
- **Application Health:** identify applications that may need follow-up when no status update has occurred for seven days.
- **Job Trust Score:** surface potentially suspicious job-listing signals for further review.
- Password reset flow, when email/SMTP settings are configured.

### For Recruiters
- Register and sign in through the recruiter workspace.
- Create and manage job postings.
- Review applications submitted to recruiter-owned jobs.
- Update application statuses and manage the hiring pipeline.
- Manage interview-related steps supported by the application.

### Platform
- Role-based access for job seekers and recruiters.
- MongoDB persistence with Mongoose models.
- JWT-based authentication and session handling.
- Scheduled application-health checks using `node-cron`.
- Optional email and web-push configuration.

## Tech Stack

- **Frontend:** HTML, CSS, JavaScript
- **Backend:** Node.js, Express.js
- **Database:** MongoDB, Mongoose
- **Authentication:** JSON Web Tokens (JWT), bcrypt
- **Supporting libraries:** node-cron, Nodemailer, web-push, Multer, Helmet, express-rate-limit

## Project Structure

```text
HireTrack360/
├── backend/
│   ├── models/           # MongoDB/Mongoose models
│   ├── routes/           # Route modules, where applicable
│   ├── utils/            # Shared helpers and scoring logic
│   ├── uploads/          # User-uploaded files (not committed)
│   ├── server.js         # Express application entry point
│   ├── package.json
│   └── .env.example      # Example environment configuration
├── frontend/
│   ├── css/              # Stylesheets
│   ├── js/               # Frontend scripts
│   ├── index.html        # Landing page
│   ├── login.html
│   └── signup.html
├── package.json
└── README.md
```

## Run Locally

### 1. Prerequisites

Install:
- Node.js (LTS recommended)
- npm
- MongoDB locally, or a MongoDB Atlas database

### 2. Clone the repository

```bash
git clone https://github.com/Sujalyadav-150/HireTrack360.git
cd HireTrack360
```

### 3. Install dependencies

From the project root:

```bash
npm install
```

### 4. Configure environment variables

Copy the example environment file.

**Windows PowerShell**
```powershell
Copy-Item backend/.env.example backend/.env
```

**macOS/Linux**
```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env` and set at least:

```env
PORT=5000
NODE_ENV=development
MONGODB_URI=mongodb://127.0.0.1:27017/hiretrack360
JWT_SECRET=replace_with_a_long_random_secret
JWT_EXPIRES_IN=7d
APP_URL=http://localhost:8000
CRON_ENABLED=true
CRON_TIMEZONE=Asia/Kolkata
```

Use a strong, unique `JWT_SECRET`. Never commit your real `.env` file, passwords, API keys, SMTP credentials, or production database URI. For password-reset emails, configure the SMTP variables in `backend/.env`.

### 5. Start the backend

From the repository root:

```bash
npm start
```

The root start script runs `backend/server.js`. The backend uses the configured `PORT` (typically `5000`).

### 6. Open the frontend

Serve the `frontend` directory with a local static web server on the port configured in `APP_URL` / `FRONTEND_PORT` (typically `8000`). For example, in a second terminal:

```bash
npx http-server frontend -p 8000
```

Then open http://localhost:8000.

> Do not open HTML files directly with `file://`; use a local HTTP server so browser requests and routing behave consistently. If your setup uses a different frontend/backend origin, configure the appropriate CORS origins and frontend API base URL.

## Tests

Run the test suite from the repository root:

```bash
npm test
```

Or run backend tests from the backend folder:

```bash
cd backend
npm test
```

## Important Environment Variables

| Variable | Purpose |
|---|---|
| `PORT` | Backend port (usually `5000`) |
| `MONGODB_URI` | MongoDB connection string |
| `JWT_SECRET` | Secret used to sign JWTs |
| `JWT_EXPIRES_IN` | JWT lifetime (example: `7d`) |
| `APP_URL` | Local frontend URL used by the application |
| `FRONTEND_URL` | Optional public frontend URL, especially for password-reset links |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM` | Optional email delivery settings |
| `CRON_ENABLED`, `CRON_TIMEZONE` | Scheduled application-health task configuration |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Optional web-push configuration |
| `CORS_ORIGINS` | Allowed frontend origins when configured |

See `backend/.env.example` for the full list.

## Demo Walkthrough

For a short interview demo:

1. Open the live website or local frontend.
2. Sign in as a **Job Seeker** and browse/search jobs.
3. Open a job, review its details and submit an application.
4. Show the candidate's application list/status and Job Match Score, if enabled in the deployed build.
5. Sign out, then sign in with a separate **Recruiter** account.
6. Create a test job and review applicants/status management.
7. Explain how Application Health can flag applications with no update for seven days and how Job Trust Score uses listing signals.

Use separate test accounts for the two roles. Test the full flow before the interview; do not rely on seeded/demo credentials unless you have verified them in the current environment.

## Security Notes

- Never publish secrets or production credentials.
- Use HTTPS and strong environment secrets in production.
- Restrict database access and configure allowed CORS origins for deployment.
- Treat Job Trust Score as a signal for further review, not a guarantee that a job is fraudulent or legitimate.

## Future Improvements

- Expand automated integration tests for the main user journeys.
- Improve recruiter/job-seeker role mismatch messaging and session recovery.
- Add more transparent explanations for match and trust scores.
- Improve monitoring and deployment checks.

## Author

**Sujal Yadav**

If you find a bug, please open an issue in the GitHub repository with steps to reproduce it. Do not include passwords, JWTs, API keys, or other secrets in the issue.
