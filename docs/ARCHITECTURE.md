# Architecture

## Stack
- Next.js (App Router) + Supabase (Postgres + RLS) + Vercel deploy
- TailwindCSS + fullcalendar or react-big-calendar for Outlook-style views

## Build Now vs Later
- **Now:** rooms CRUD, bookings CRUD with clash prevention, calendar views (month/week/day), user registration, delegation, audit log, verified email sign-in, and team-scoped RLS
- **Later:** email notifications, recurring bookings, analytics dashboard

## Key User Action Flow (Book a Room)
1. User opens calendar → sees month/week/day view with existing bookings shaded
2. User clicks an empty half-hourly slot → booking form opens
3. User selects room → system checks availability (DB query + unique constraint)
4. On submit → booking row inserted, audit log written, calendar refreshes
5. Delegated user can open that booking → edit time/room → same clash check → audit log updated

## Responsive Nav Shell
Left sidebar (desktop) with sections: Calendar, My Bookings, Rooms, Users, Delegations. Collapses to hamburger on mobile. Current section highlighted.

## Layer Plan
1. **Data layer** (`lib/data/`) — all DB queries in one place (rooms, bookings, users, delegations, audit)
2. **Server logic** (`lib/actions/`) — booking clash checks, permission checks, audit writes
3. **UI components** — calendar, booking form, room manager, user manager
4. **Smart features** (`lib/ai/`) — later: booking conflict suggestions, room recommendations

## Why Core Runs Without AI
Clash prevention is a DB unique exclusion constraint + a server-side check. Delegation is a row-level permission check. No AI needed for the core booking loop.

## Repo Structure
```
features/
  calendar/       (calendar views + booking UI)
  bookings/       (CRUD, clash logic, delegation)
  rooms/          (room management)
  users/          (user registration)
  delegations/    (grant/revoke delegation)
lib/data/         (all Supabase queries)
lib/actions/      (server logic: clash, permissions, audit)
lib/ai/           (later: recommendations)
tests/            (beside each feature)
```

## Module Map
| Module | Responsibility | Data owned | Build order |
|---|---|---|---|
| bookings | Create/edit/delete bookings, clash prevention | bookings table | 1st |
| rooms | Room CRUD | rooms table | 2nd |
| calendar | Display bookings in month/week/day | reads bookings | 3rd |
| users | User registration | users table | 4th |
| delegations | Grant/revoke edit rights | delegations table | 5th |
| audit | Log all booking changes | audit_logs table | 6th |
