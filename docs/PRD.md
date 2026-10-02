# Room Booking System — PRD

## Problem
Staff overwrite each other's room bookings because everyone has admin rights. There's no clash prevention, no ownership, and no audit trail. We need a structured booking system with clear permissions.

## Target User
All company staff who book meeting rooms — from executives to management staff. IT staff act as administrators managing rooms and user registrations.

## Core Objects
- **Users** — company staff who book rooms (registered by IT)
- **Rooms** — meeting rooms managed by IT (name, location, capacity, amenities)
- **Bookings** — a room reserved for a time range by a user (half-hourly granularity)
- **Delegations** — one user grants another user edit rights over their bookings
- **Audit Logs** — every booking create/update/delete is recorded

## MVP (v1) — Must-haves
- [ ] Register users (IT admin only)
- [ ] Add/remove/edit rooms (IT admin only)
- [ ] Book a room in half-hourly slots via calendar (month/week/day views)
- [ ] Prevent double-booking (clash detection at DB + app level)
- [ ] View availability before booking
- [ ] Delegate edit rights to another user
- [ ] Delegate edits a booking on behalf of the owner
- [ ] Audit log of all booking changes
- [ ] Demo-first: works without login wall initially (seed data)

## Non-goals (v1)
- External guest booking
- Recurring bookings
- Room resource equipment tracking beyond simple amenities
- Mobile native app
- Email notifications (later)
- SSO / SAML integration (later)

## Success Criteria
A staff member opens the calendar, picks a free half-hourly slot on a room, creates a booking with no clash, and a delegated assistant can later move that booking to a different time/room — all reflected in the database and visible on refresh.