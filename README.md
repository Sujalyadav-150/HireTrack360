# HireTrack 360

Smart Job Search & Application Management Platform.

## Stack
- Frontend: HTML, CSS, Vanilla JavaScript
- Backend: Node.js, Express.js
- Database: MongoDB + Mongoose
- Authentication: JWT + bcrypt
- Automation: node-cron
- Notifications: Web Push + Service Worker

## Core Features
- Job Seeker / Recruiter role-based authentication
- Job search, filters and saved jobs
- Job applications and application tracking
- Job Match Score
- Application Health / follow-up detection
- Job Trust Score
- Resume versioning
- Interview tracking
- Recruiter applicant management
- Browser push notification architecture
- Scheduled automation with Cron
- Responsive premium UI

## Run locally

### Backend
```bash
cd backend
npm install
copy .env.example .env
npm run dev
```

### Frontend
Open `frontend/index.html` directly for the UI demo, or serve the frontend with a static server.

For the full backend-connected version, configure:
- MONGODB_URI
- JWT_SECRET
- VAPID_PUBLIC_KEY
- VAPID_PRIVATE_KEY
- VAPID_EMAIL

## Important
This starter contains the complete project structure and polished frontend foundation. Connect the API endpoints in `frontend/js/api.js` to the backend controllers as you implement them.
