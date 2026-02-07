# CLAUDE.md - KintaiKanri (勤怠管理システム)

## Project Overview

KATEstageLASH attendance management system (勤怠管理システム) for a beauty salon. Full-stack web app with a React frontend deployed to GitHub Pages and a Google Apps Script (GAS) backend using Google Sheets as the database.

**Language:** All UI text is in Japanese. Commit messages are typically in Japanese.

## Repository Structure

```
KintaiKanri/
├── frontend/              # React + TypeScript frontend (Vite)
│   ├── src/
│   │   ├── App.tsx        # Root component with routing
│   │   ├── main.tsx       # Entry point
│   │   ├── index.css      # Global styles (Tailwind + custom animations)
│   │   ├── api/           # API client with demo mode support
│   │   ├── pages/         # Page components
│   │   │   ├── Login.tsx
│   │   │   ├── staff/     # ClockPage, MyPage
│   │   │   └── admin/     # Dashboard, StaffManagement, AttendanceManagement,
│   │   │                  # SalaryManagement, PaidLeaveManagement, Settings
│   │   ├── components/common/  # Header, Clock, Loading, Modal, PinInput
│   │   ├── contexts/      # AuthContext (staff + admin auth)
│   │   ├── types/         # TypeScript type definitions
│   │   └── utils/         # Salary/insurance calculation helpers
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json      # References tsconfig.app.json and tsconfig.node.json
│   ├── eslint.config.js
│   └── postcss.config.js
├── gas/                   # Google Apps Script backend
│   ├── Code.gs            # Main API handler (~1,300 lines)
│   └── PdfGenerator.gs    # Salary slip PDF generation
├── .github/workflows/
│   └── deploy.yml         # CI/CD: build + deploy to GitHub Pages
└── README.md
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript 5.9, Vite 7 |
| Styling | Tailwind CSS 4, PostCSS, Autoprefixer |
| Routing | React Router DOM 7 |
| Icons | Lucide React |
| Dates | date-fns |
| PDF | jsPDF (frontend), Google Docs API (GAS backend) |
| Backend | Google Apps Script |
| Database | Google Sheets (auto-created per month) |
| CI/CD | GitHub Actions |
| Hosting | GitHub Pages |
| Node | 20 (CI) |

## Development Commands

All frontend commands run from the `frontend/` directory:

```bash
cd frontend
npm install          # Install dependencies
npm run dev          # Start Vite dev server
npm run build        # TypeScript check (tsc -b) + Vite production build
npm run lint         # ESLint (flat config, TS + React hooks + React Refresh)
npm run preview      # Preview production build locally
```

The `build` script runs `tsc -b && vite build` — TypeScript errors will fail the build.

## Architecture & Key Patterns

### API Layer (`frontend/src/api/index.ts`)

- All API calls go through a single GAS Web App URL
- Uses **GET requests with a JSON-encoded `data` query parameter** to avoid CORS preflight issues
- Actions are dispatched via an `action` string parameter
- **Demo mode**: When `VITE_API_BASE_URL` is empty, the app uses in-memory mock data with 3 test staff members. Any 4-digit PIN works for login.

### Authentication (`frontend/src/contexts/AuthContext.tsx`)

- **Staff login**: staffId + 4-digit PIN (verified via SHA-256 hash on GAS side)
- **Admin login**: 4-digit PIN only (default: `9999`, set in `Code.gs` as `ADMIN_PIN`)
- Sessions stored in localStorage with expiry (staff: 24h, admin: 8h)
- Route protection via `StaffRoute` and `AdminRoute` wrapper components in `App.tsx`

### Routing

| Path | Access | Component |
|------|--------|-----------|
| `/` | Public | LoginPage |
| `/clock` | Staff | ClockPage |
| `/mypage` | Staff | MyPage |
| `/admin` | Admin | AdminDashboard |
| `/admin/staff` | Admin | StaffManagement |
| `/admin/attendance` | Admin | AttendanceManagement |
| `/admin/salary` | Admin | SalaryManagement |
| `/admin/paid-leave` | Admin | PaidLeaveManagement |
| `/admin/settings` | Admin | SettingsPage |

### GAS Backend (`gas/Code.gs`)

- `doGet(e)` / `doPost(e)` handle all requests via `handleRequest(e, method)`
- Data is stored in Google Sheets: `staff_master`, `attendance_YYYYMM`, `salary_YYYYMM`, `paid_leave`, `insurance_rates`, `tax_manual_YYYYMM`, `incentive_YYYYMM`
- Month-specific sheets are auto-created on first access
- `setupSystem()` initializes all base sheets (run once from GAS console)
- `PdfGenerator.gs` creates salary slip PDFs via temporary Google Docs

### Salary Calculation Rules (`frontend/src/utils/calculations.ts`)

- Weekly working hours: 44 (beauty industry special measure per Japanese labor law)
- Monthly working hours: ~190.67 (44 * 52 / 12)
- Overtime: >44h/week at 125%
- Night work (22:00-05:00): +25%
- Holiday work: +35%
- Nursing insurance: only for ages 40-65
- Late/early leave: per-minute deductions

### Styling Conventions

- **Theme**: Gold (#d4af37) & white corporate design
- **Fonts**: Japanese-optimized stack (Hiragino Sans, Yu Gothic, Meiryo)
- Custom CSS animations: fade-in, slide-up, scale-in, shimmer, glow, pulse-gold
- Component classes: `.card`, `.btn-primary`, `.btn-secondary`, `.btn-danger`, `.status-badge`
- Mobile-first responsive design

## Environment Variables

Defined in `frontend/.env` (see `.env.example`):

| Variable | Description |
|----------|-------------|
| `VITE_API_BASE_URL` | GAS Web App deployment URL. Leave empty for demo mode. |
| `VITE_DEMO_MODE` | Set `true` to force demo mode even with API URL set. |

## CI/CD Pipeline

GitHub Actions workflow (`.github/workflows/deploy.yml`):

1. Triggers on push to `main` or specific feature branches
2. Sets up Node.js 20 with npm cache
3. Runs `npm ci` then `npm run build` (includes TypeScript check)
4. Deploys `frontend/dist/` to GitHub Pages

The Vite config sets `base: '/KintaiKanri/'` when building in CI (`GITHUB_ACTIONS` env detected).

## Testing

No automated tests exist currently. The project relies on demo mode for manual testing.

## Code Conventions

- **TypeScript**: Strict mode enabled. All types defined in `frontend/src/types/index.ts`.
- **ESLint**: Flat config with `@eslint/js`, `typescript-eslint`, `react-hooks`, and `react-refresh` plugins.
- **Components**: Functional components with hooks. Common/reusable components in `components/common/`, page components in `pages/`.
- **State management**: React Context API for auth. Local state (`useState`) for page-level data.
- **Exports**: Page components use barrel exports via `pages/index.ts`.
- **Error handling**: Try/catch with Japanese error messages shown via `alert()`.
- **GAS code**: Plain JavaScript (`.gs` files), not TypeScript.

## Important Notes for AI Assistants

1. **Run `npm run build` from `frontend/`** to verify changes compile. The build includes `tsc -b` (TypeScript check).
2. **Run `npm run lint` from `frontend/`** to check for linting errors.
3. The frontend and GAS backend are independent — the GAS code is deployed separately via Google Apps Script editor.
4. All user-facing strings are in Japanese.
5. The API uses GET-only requests with JSON in query params (CORS workaround) — do not introduce POST/PUT/DELETE requests on the frontend side.
6. Google Sheets names are date-based (e.g., `attendance_202602`) — month-specific sheets are created dynamically.
7. Demo mode mock data is embedded in `frontend/src/api/index.ts` — keep it in sync with types if modifying the data model.
8. The `base` path in `vite.config.ts` differs between local dev (`/`) and CI (`/KintaiKanri/`).
