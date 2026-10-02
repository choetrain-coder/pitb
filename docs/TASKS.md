# Tasks & Sprints

## Sprint 1: Core Booking Engine (v1 functional milestone)
**Goal:** A user can book a room with no clashes — demo-first, no login wall.
- [ ] Create Supabase schema: rooms, bookings, users, delegations, audit_logs with seed data
- [ ] Build `lib/data/` data-access layer for all tables
- [ ] Build booking creation with clash prevention (DB exclusion constraint + app check)
- [ ] Build calendar UI (month/week/day) with half-hourly slots showing bookings
- [ ] Build booking form (select room, pick slot, set title)
- [ ] Empty/loading/error states for calendar + booking form
- **Done:** User opens calendar, picks a free half-hourly slot, books a room, sees it on calendar, no clash possible.

## Sprint 2: Room & User Management
**Goal:** IT can manage rooms and register users.
- [ ] Room management screen (add/edit/deactivate rooms)
- [ ] User registration screen (add users with company email + role)
- [ ] My Bookings screen (list own bookings, cancel)
- [ ] Audit log writes on every booking change
- **Done:** IT adds a room, registers a user, and both appear in the system. Booking changes are audited.

## Sprint 3: Delegation
**Goal:** A user delegates edit rights; delegate can move bookings.
- [ ] Delegation screen (grant/revoke delegation to another user)
- [ ] Permission check: delegate can edit delegator's bookings
- [ ] Delegate sees delegated bookings in their My Bookings view
- **Done:** Manager grants PA delegation; PA reschedules manager's booking to a different slot/room without clash.

## Sprint 4: Lock It Down (Auth + RLS)
**Goal:** Real company auth + per-user data isolation.
- [ ] Add company email login (Supabase Auth)
- [ ] Replace permissive RLS with owner-scoped policies (auth.uid() = user_id)
- [ ] Admin role check for rooms/users management
- [ ] Audit logs admin-only
- **Done:** Only logged-in users see data; staff see own + delegated bookings; admins see all.

## Sprint 5: Polish & Smart Suggestions (later)
- [ ] Room recommendation on conflict (top 3 alternative rooms)
- [ ] Email notifications for bookings and delegations
- [ ] Recurring bookings
- [ ] Dashboard analytics (utilization rates)

## Gantt
```
S1 [####]        Core booking engine + calendar
S2    [####]     Rooms + users + audit
S3       [####]  Delegation
S4          [###] Auth lock-down
S5            [···]  Smart + polish (later)
```