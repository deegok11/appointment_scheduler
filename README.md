# Scheduler Assistant

A doctor-appointment scheduling system: a REST API backend (Node.js + Express, JSON-file storage) with an
OpenAI-powered conversational scheduling agent, and a React frontend with a login screen and a chat UI
shell.

## Architecture

- **`backend/`** — Express API server. Data is stored as JSON files under `backend/data/`, loaded into
  memory at boot and written back to disk in the background on every mutation (register, login, logout,
  book, cancel), so state survives a restart. Double-booking is prevented with an in-memory per-doctor,
  per-day 30-minute slot index that's synchronously checked-then-committed on every booking (see
  [notes.md](./notes.md) for why this requires a single Node process). A chat agent
  (`POST /api/chat`) sits on top of the same service layer, using the OpenAI SDK with tool/function
  calling to drive get_doctor_list/get_doctor_appointments/book_appointment/cancel_appointment/
  get_appointment_details on the caller's behalf — logged in or as a guest.
- **`frontend/`** — React app (Vite) with `/login`, `/chat`, and `/doctor` screens, all wired to the real
  backend. The login screen has a "Continue without logging in" link straight into `/chat` for guest use.
  A doctor account is routed to `/doctor` (their own schedule) instead of `/chat` on login, and each page
  links to the other.

## Prerequisites

- Node.js ≥ 18 (developed against Node 24)

## Backend setup

```bash
cd backend
cp .env.example .env
npm install
npm run seed      # populates backend/data/*.json with sample doctors, patients, and bookings
npm run dev        # starts the API on http://localhost:4000
```

Re-running `npm run seed` is a no-op if data already exists. To wipe and reseed: `npm run seed -- --force`.

To use the chat agent, set `OPENAI_API_KEY` (and optionally `OPENAI_MODEL`, default `gpt-4o-mini`) in
`backend/.env`. Without a key, every other endpoint still works — only `POST /api/chat` returns a
`CHAT_NOT_CONFIGURED` error.

### Sample credentials (created by the seed script)

| Role    | Username       | Password    |
|---------|----------------|-------------|
| Doctor  | `dr.amit`      | `doctor123` |
| Patient | `patient.ravi` | `patient123`|

(Two more doctors — `dr.sneha`, `dr.kiran` — and a second patient — `patient.meera` — are also seeded,
all with the same passwords as above.)

## Frontend setup

```bash
cd frontend
cp .env.example .env   # VITE_API_BASE_URL defaults to http://localhost:4000/api
npm install
npm run dev             # starts the app on http://localhost:5173 (or the next free port)
```

Open the printed URL, then either log in with one of the sample credentials above, or use "Continue
without logging in" to try the chat as a guest.

## API summary

All responses use the envelope `{ success: true, data: {...} }` or `{ success: false, error: { code, message } }`.

| API | Route | Auth | Purpose |
|---|---|---|---|
| register | `POST /api/auth/register` | none | Create a patient account |
| login | `POST /api/auth/login` | none | Get a JWT; response `user` includes `is_doctor`, which the frontend uses to route to `/doctor` vs `/chat` |
| logout | `POST /api/auth/logout` | required | Revoke the current session |
| get_doctor_list | `GET /api/doctors` | none | List doctors and clinic details |
| get_doctor_appointments | `GET /api/doctors/appointments?doctor_id=&start_datetime=&end_datetime=` | none | Free/busy slot status for a doctor (no patient PII) |
| get_my_appointments (doctor) | `GET /api/doctors/me/appointments?start_datetime=&end_datetime=` | required (doctor) | The logged-in doctor's own schedule, with full patient details (name if the patient was logged in when booking, else null; mobile/email always). 403 `NOT_A_DOCTOR` if the caller's account isn't a doctor. `start_datetime`/`end_datetime` are required. |
| book_appointment | `POST /api/appointments/book` | optional | Book a 30-min-aligned slot (JWT or guest mobile+email) |
| cancel_appointment | `POST /api/appointments/cancel` | optional | Cancel by doctor+time+identity match |
| get_appointment_details | `GET /api/appointments/details?mobile_number=&email=&start_datetime=&end_datetime=` | optional | Look up appointments by identity (JWT or guest mobile+email), filtered to `[start_datetime, end_datetime)`. `start_datetime`/`end_datetime` are required (400 if missing) — the API has no "give me everything" mode; the chat agent defaults to a 30-day range when the patient doesn't specify one. |
| chat | `POST /api/chat` | optional | Send a message to the scheduling agent; body `{ message: string, session_id?: string }`, response `{ reply: string }`. Logged in: history is kept server-side per login session and cleared on logout. Guest: `session_id` is required in the body (the frontend generates one per page load) since there's no login session to key history off. The client only ever sends the latest message either way. |

## Resetting data

Delete the files under `backend/data/*.json` (or run `npm run seed -- --force`) and restart the server.

## Known limitations

See [notes.md](./notes.md) for the full list of assumptions and scope boundaries (working hours, slot
granularity, single-process requirement, chat history being in-memory and only cleaned up on logout for
logged-in sessions (guest sessions are never swept), why chat history gets compressed past 100 messages,
etc.).
