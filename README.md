# Ascendia CRM Dashboard

Production-ready Marketing Agency CRM built with the MERN stack.

## Stack
- **Frontend**: React + Vite, Tailwind CSS, shadcn/ui, Recharts, React Query, Framer Motion
- **Backend**: Node.js, Express.js, MongoDB, Mongoose, JWT

## Project Structure
```
crm-dashboard/
├── backend/          # Node.js/Express API
└── frontend/         # React/Vite app
```

## Quick Start (Local)

### Backend
```bash
cd backend
cp .env.example .env   # fill in your values
npm install
npm run dev            # starts on port 5000
```

### Frontend
```bash
cd frontend
cp .env.example .env.local   # set VITE_API_URL if not using proxy
npm install
npm run dev            # starts on port 5173
```

## Deploy to Render (Backend)

1. Push code to GitHub
2. Go to [render.com](https://render.com) → New Web Service
3. Connect your GitHub repo, select `backend/` as root
4. Set environment variables from `backend/.env.example`
5. Deploy — your API URL will be `https://crm-backend.onrender.com`

## Deploy to Vercel (Frontend)

1. Go to [vercel.com](https://vercel.com) → New Project
2. Import your GitHub repo, set root directory to `frontend/`
3. Add environment variable: `VITE_API_URL=https://your-render-url.onrender.com/api`
4. Deploy

## Modules
- **Dashboard** — KPIs, revenue charts, lead funnel, activity feed
- **Leads** — Full pipeline management (New → Won/Lost)
- **Clients** — Company profiles, contracts, communication logs
- **Campaigns** — Multi-channel campaigns with budget tracking
- **Projects** — Project timelines and milestone tracking
- **Tasks** — List + Kanban board views
- **SOP Library** — Knowledge base with version control & approval workflow
- **Employees** — Directory, roles, RBAC
- **Attendance** — Clock in/out, reports
- **Reports** — Revenue, lead, campaign analytics
- **Settings** — Profile, security, notifications, appearance

## Roles
| Role | Access |
|------|--------|
| super_admin | Full access |
| admin | All modules except super admin |
| manager | Clients, campaigns, leads, SOP approvals, teams |
| employee | Limited — tasks, SOP view |
| viewer | Read-only |
