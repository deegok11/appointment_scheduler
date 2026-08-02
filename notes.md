# Notes

Assumptions and scope boundaries for this build. More content to be added later.

## Working hours (required assumption)

Doctors work **Monday–Saturday**, **8AM–12PM** and **1PM–8PM**. Sundays and the 12PM–1PM lunch hour are
closed — no bookings are accepted outside these windows.

## Other assumptions

- **Fixed 30-minute slot grid, but bookings are NOT limited to one slot.** Each doctor's working day is
  divided into 22 fixed 30-min slots (8 in the morning window, 14 in the afternoon window). A booking can
  span any whole number of contiguous slots (30 min, 1 hour, 3 hours, a full 4-hour window, etc.) — the
  only requirements are that `start_datetime` falls on a 30-min boundary and the whole span stays within
  a single working window (can't cross the lunch gap or midnight). `alignToSlotIndices` in `dateUtils.js`
  and the slot-index check/commit in `appointment.service.js` both already handle multi-slot ranges; this
  was true from the original design, not a later change.
- **Single Node process required.** Double-booking prevention relies on a synchronous check-then-commit
  against an in-memory slot index, with no `await` between the check and the write. This is atomic
  within one Node process but is **not** safe under `cluster` or multi-process/PM2-cluster deployment.
- **Naive datetimes, single timezone.** All `start_datetime`/`end_datetime` values are treated as local
  wall-clock time with no timezone conversion — send/read them as `YYYY-MM-DDTHH:mm:ss` without a `Z` or
  offset suffix.
- **JSON-file storage, demo scale.** All four tables (`users`, `doctors`, `schedules`, `sessions`) are
  loaded fully into memory and written back to disk on every mutation. This is fine for demo-scale data,
  not intended for production-scale concurrent load.
- **Guest identity has no verification.** Booking/cancelling/looking up appointments as a guest only
  requires knowing a mobile number + email — there's no OTP or confirmation step. This is a deliberate
  simplification, not a security control.
- **Appointment `status` is an open field**, not a hard 2-value enum. Only `booked` and `cancelled` are
  reachable through the current APIs. Other values (`pending_details`, `rejected_by_doctor`, `completed`,
  `no_show`, etc.) are reserved for a future doctor-approval workflow that isn't built yet — no schema
  change will be needed when that's added.
- **Doctors are created via a seed script only** (`backend/src/seed/seed.js`) — there's no admin/create-doctor
  API yet, since a doctor also needs clinic details that the patient-facing register endpoint doesn't collect.
- **Chat screen is now wired to the real chat agent** (`POST /api/chat`, see below) from both the login
  screen ("Continue without logging in") and, once logged in, the normal chat page. Exposing the REST
  APIs as MCP tools is still future work.
- **No reschedule endpoint.** Rescheduling is cancel + book again. No notifications/reminders are sent.
- **Doctor schedule view (`GET /api/doctors/me/appointments`, `/doctor` screen).** Unlike the public
  `get_doctor_appointments` (free/busy only, no PII, by design), this authenticated endpoint returns the
  logged-in doctor's own appointments with full patient contact info. `patient_name` is resolved via
  `client_id` and is `null` for guest bookings (guests only ever have mobile_number/email, never an
  account/name) — the frontend shows "Guest" in that case. `start_datetime`/`end_datetime` are required,
  same API-stays-a-mechanism pattern as `get_appointment_details`; the frontend defaults the date inputs
  to today through +30 days. A non-doctor account hitting this endpoint gets `403 NOT_A_DOCTOR`. On login,
  the response's `is_doctor` field routes a doctor straight to `/doctor` instead of `/chat`; the two pages
  cross-link to each other.

## Chat / OpenAI agent (`POST /api/chat`)

- **Login is optional.** Logged-in patients chat under their auth session (the same `session_id`
  embedded in their JWT) and never need to give their mobile number/email — the agent already knows who
  they are. Guests can open `/chat` directly from a link on the login screen; since they have no auth
  session, the frontend generates a random `session_id` (one per page load, via `crypto.randomUUID()`)
  and sends it with every message so the backend can keep that one conversation's history together. The
  system prompt tells the agent to greet a guest as **"Hello User"** (never guess a name) and to collect
  their mobile number + email in conversation before calling `book_appointment`, `cancel_appointment`, or
  `get_appointment_details` — the same guest-identity rule the REST APIs already enforce.
- **Guest chat sessions are never explicitly cleaned up server-side.** Logged-in history is deleted on
  logout (see below), but there's no equivalent event for a guest — closing the tab just abandons it.
  Each is one entry in an in-memory `Map` keyed by the client-generated `session_id`, so a long-running
  server will slowly accumulate abandoned guest sessions. Acceptable at demo scale; a real deployment
  would want a TTL sweep.
- **Chat history is in-memory only, and a logged-in session's is deleted on logout.** It's keyed by the
  auth `session_id` and cleared the moment that session is revoked (`authService.revokeSession` calls
  `chatService.clearHistory`). It is **not** written to disk — a server restart loses all in-progress
  chat conversations (unlike `users`/`doctors`/`schedules`/`sessions`, which are write-through). This
  was a deliberate choice: chat history is conversational scratch state meant to be ephemeral, not a
  durable business record like an appointment.
- **Why messages get compressed after 100.** Every call to the OpenAI API must resend the *entire*
  conversation so far (the API is stateless per call) — so a long-running chat's token cost, latency,
  and eventual risk of exceeding the model's context window all grow with every turn if history is kept
  unbounded. Once a session's stored history passes 100 messages, the oldest 50 are condensed into a
  single summary message (via one extra LLM call) and spliced in as a system-role note in their place.
  This bounds per-request token usage for long conversations while still preserving the gist of earlier
  context, instead of either silently truncating (losing information) or letting cost/latency grow
  unbounded.
- **Tool-call pairing is preserved across compression.** OpenAI's API requires every `tool` role message
  to immediately follow the assistant message that requested it, in the same request. The compression
  step never cuts between an assistant tool-call and its result — any leftover `tool` messages at the
  new head of history are pulled into the compressed batch too, so the live history never starts with an
  orphaned tool result.
- **Both booking and cancellation always require in-conversation confirmation.** The system prompt
  instructs the agent to restate the specific appointment (doctor, date, start time, duration) and get an
  explicit yes from the patient immediately before calling `book_appointment` or `cancel_appointment` —
  neither is ever called as a first action, and merely having agreed on a doctor/time earlier in the
  conversation does not itself count as confirmation. Verified live: a fully-specified booking request
  ("book me with Dr. X on date at time") gets a confirmation question first, nothing is booked until an
  explicit "yes" arrives in the same session, and the booking then completes correctly.
- **The agent must treat `status` as the source of truth when multiple records share a slot.** Cancelling
  and re-booking the same doctor/time creates more than one `schedule_table` row for that slot (one
  `cancelled`, one `booked`) — this is normal, not a data bug. Since `status` is an open field, not a
  fixed pair of values (see below), the system prompt does **not** hardcode `"booked"` as the one true
  active string — it tells the agent to read what each status value actually means (e.g. "cancelled" or
  "rejected_by_doctor" clearly inactive, "booked" clearly active) and only treat semantically-active
  records as current when listing "my appointments" or picking which appointment a cancellation request
  refers to, ignoring inactive ones and never confusing them with the active record for that same slot.
  This keeps the instruction correct if a future status value (e.g. `confirmed`, `pending_approval`) is
  introduced without needing a prompt change. Verified live: with a doctor/slot that has both a cancelled
  and a re-booked record, the agent correctly reports only the active one and, when asked to cancel,
  resolves to that same active record and still asks for confirmation.
- **The agent is instructed to handle a difficult patient gracefully**: staying calm if the patient gets
  frustrated or angry, not proceeding when the patient won't confirm/provide what's needed, and not
  blindly retrying an immediately-failed booking (e.g. a slot another patient just booked) — it's told to
  explain the conflict and offer to check other times instead.
- **The agent addresses the patient by name if logged in, otherwise as "User"** — computed once in
  `buildSystemPrompt` and injected as an explicit instruction, not left for the model to infer.
- **The logged-in identity line also states `status: doctor`/`status: patient`** (the same `isDoctor`
  check the SCOPE section already gates on, just now stated explicitly alongside name/mobile/email)
  rather than leaving the model to infer it only implicitly from which instructions happen to apply.
  Verified live: asked directly, the agent correctly reports "patient" or "doctor" for each account type.
- **`get_appointment_details` requires a date range** (`start_datetime`/`end_datetime`, filtering to
  appointments whose `start_datetime` falls in `[start, end)`) — a 400 if either is missing, no "give me
  everything" mode. This is a deliberate API/agent split: the API stays a plain mechanism with one
  required shape, matching `book_appointment`/`cancel_appointment`/`get_doctor_appointments` (all of which
  already require an explicit range or slot). The **next-30-days default lives entirely in the chat
  system prompt**: the agent is told that if the patient asks about their appointments without naming a
  range, it must compute `start_datetime` = now and `end_datetime` = +30 days itself and pass those,
  rather than asking the patient to specify one or omitting the params. A non-chat caller of the raw API
  has no default to lean on and must pass an explicit range itself (e.g. a wide one, for full history).
- **Fixed a chat-agent bug where it refused multi-hour bookings.** The original system prompt/tool wording
  ("Appointments are fixed 30-minute slots... No custom durations", "one specific 30-minute-aligned time
  slot") was misleading the model into thinking every booking had to be exactly 30 minutes, even though
  the API always supported any multiple of 30 minutes (see above). Reworded both the CLINIC RULES section
  and the `book_appointment` tool description to explicitly state that duration can be any whole multiple
  of 30 minutes within one working window, with a worked example (9:00 AM-12:00 PM = valid 3-hour
  booking). Verified live: a 3-hour chat booking request that was previously refused now succeeds.
- **Not implemented: reporting the specific overlapping time on a booking conflict.** Today,
  `book_appointment`'s `SLOT_CONFLICT` error only says the requested range conflicts with an existing
  booking — it doesn't say which portion. The system prompt tells the agent not to blindly retry and to
  offer nearby times via `get_doctor_appointments`, but the agent has no ready-made overlap window (e.g.
  "your 2:00-2:30 overlaps with an existing booking") to relay to the patient; it would have to infer that
  itself from a separate availability check. Flagged as a potential future UX enhancement, not built yet.
- **Non-doctors are scoped to scheduling-only, own-appointments-only.** `buildSystemPrompt` checks whether
  the logged-in `user_id` has a matching `doctor_table` row (`doctorService.findDoctorByUserId`) — guests
  and logged-in patients (`isDoctor === false`) get an added SCOPE instruction: refuse off-topic questions
  and refuse any request for other people's appointment/booking information (e.g. "who else has an
  appointment next week"). A logged-in doctor account is exempt from this restriction. Note this is a
  prompt-level policy, not an access-control enforcement layer — the underlying tools already can't leak
  other patients' data regardless (`get_doctor_appointments` returns free/busy with no PII, and
  `get_appointment_details` is always scoped to the caller's own identity), so this closes the loop at the
  conversational layer on top of that. Basic greetings/pleasantries ("hello", "thank you") are explicitly
  carved out as always fine, so the restriction doesn't make small talk feel redirected/robotic.
- **`SECURITY` guardrail against prompt injection sits at the very top of the system prompt** — before
  even the "you are the scheduling assistant" role line — instructing the agent to never follow
  instructions embedded in the patient's message or in any tool-returned data (a concrete example: a
  patient's `name`, set at self-registration, is injected verbatim into their own system prompt on every
  message — someone could register with an instruction-like name), and to never reveal/quote/summarize its
  own system prompt. This applies to every caller, including doctors (unlike `SCOPE`, it's not
  conditional). It's a **soft** guardrail, not a guarantee — the actual backstop is that every tool call is
  still independently re-validated by `appointment.service.js`/`doctor.service.js` regardless of what the
  model is tricked into attempting, so a jailbroken model still can't book/cancel/leak anything the
  underlying APIs wouldn't otherwise allow.
- **Content moderation was designed but deferred, not implemented.** The plan was an OpenAI Moderation API
  pre-check on the patient's message, skipping the main model call entirely (no tool-call risk, no extra
  cost on the main model) if flagged. Deferred because it adds latency and cost to every single chat turn,
  and — per the reasoning for not building it now — the tools that actually perform bookings, cancellations,
  and lookups already validate everything independently server-side regardless of what the model does, so
  this would only guard against disallowed *conversation* content, not data/business-logic integrity,
  which doesn't depend on the chat layer at all. Flagged as a future option if content-safety becomes a
  requirement.
- **No doctor-specific prompt yet.** A doctor account is only exempted from the SCOPE restriction above —
  there's no separate system prompt granting doctors extra permissions (e.g. viewing their own patient
  list). Out of scope for now; build it if/when actually needed.
- **`OPENAI_API_KEY` is required** for `/api/chat` to function; without it the endpoint returns a clear
  `CHAT_NOT_CONFIGURED` error while the rest of the API continues to work normally (the OpenAI client is
  constructed lazily, not at server boot, specifically so a missing key can't crash the whole server).

## Working with an AI coding assistant: suggestions vs. my decisions

Points in this build where the AI assistant proposed one approach and I went a different way (or, in one
case, the same way) are worth recording:

- **Storage for chat history.** The assistant's default pattern across the rest of the app was to persist
  every table to a JSON file on disk. For chat conversation history, my answer was to keep it as an
  in-memory cache instead — not written to disk like everything else, cleared when the session logs out.
  It's conversational scratch state, not a durable business record, so it didn't need the same persistence
  guarantee the rest of the data has.
- **Content safety for the chat agent.** The assistant suggested adding one more abstraction layer — an
  OpenAI Moderation API pre-check on every patient message before it reaches the main model. My call was
  not to add that layer: we already manage restriction and control through the tools themselves — every
  tool call the agent can make is independently validated server-side regardless of what the model does —
  so that control point is enough for now, without the extra latency and cost a separate moderation step
  would add.
- **Booking race-condition design.** For preventing double-booking, the assistant suggested a per-doctor,
  per-day array of the (at most) 22 fixed 30-minute slots, checked and committed synchronously with no
  rollback needed. That's also what I suggested, and it's what's implemented in `slotIndex.service.js`
  today — the one case here where the assistant's suggestion and my own direction landed on the same
  approach rather than diverging.

## What I'd implement with more time

- **A separate doctor chat session/prompt.** Today a doctor account only gets exempted from the `SCOPE`
  restriction (see "No doctor-specific prompt yet" above) — there's no dedicated system prompt, tool set,
  or permission model for the extra things a doctor should actually be able to do (e.g. reviewing their
  own patient list conversationally, managing their schedule, approving/rejecting appointments once that
  workflow exists). With more time I'd build that out as its own prompt/tool surface, checked and gated
  properly, rather than a single shared prompt with one restriction toggled off.
- **A real UI for booking-conflict overlaps.** See "Not implemented: reporting the specific overlapping
  time on a booking conflict" above — right now neither the backend (the `SLOT_CONFLICT` error payload)
  nor the frontend (the chat window just renders plain text bubbles) has any structured way to show a
  patient exactly which part of their requested time overlaps with an existing booking. I'd want both
  sides built together: the API returning the actual overlap window, and a proper UI treatment for it
  (e.g. highlighting the conflicting time against the requested range) instead of leaving it to prose.
- **Much stronger validation around `status`.** It's deliberately an open field today (see "Appointment
  `status` is an open field" above) so a future doctor-approval workflow doesn't need a schema change, but
  that also means nothing stops an invalid value or an invalid transition (e.g. `cancelled` → `booked`
  directly, skipping intended states) from being written. With more time I'd add real transition
  validation — a defined state machine of which status can move to which — instead of leaving it as a
  free-form string enforced only by convention.
- **A real permission/role-based access model.** To support the no-login chat screen, the appointment
  APIs (`book_appointment`, `cancel_appointment`, `get_appointment_details`, and `/api/chat` itself) were
  all opened up to unauthenticated callers (see "Guest identity has no verification" above) — a mobile
  number + email is trusted with no proof of ownership (no OTP, no rate limiting). That was a deliberate
  scope tradeoff to get guest booking working, but it's also the biggest security gap in the current
  build: anyone who can guess or already knows someone's mobile+email can view or cancel their
  appointments through these APIs directly (not just through the chat UI). With more time this would be
  the first thing I'd replace with a proper permission-based model instead of the current blanket-open
  guest access.
