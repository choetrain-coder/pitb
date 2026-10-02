# Agentic Layer

## Draftable Actions (low risk — auto)
- Tag/label a booking with category
- Draft a booking note or description
- Summarize a day's bookings into a digest

## Executable After Approval (medium risk)
- Auto-reschedule a booking when a conflict is detected (draft proposed time → user approves)
- Cancel a booking on behalf of a user (delegate triggers → owner confirms)

## Human-Only Actions (high/critical risk)
- Delete a room (IT admin only, irreversible)
- Delete a user (IT admin only)
- Bulk cancel bookings

## Named Tools
- `check_room_availability(room_id, start, end)` — read-only, auto
- `propose_alternative_slot(room_id, start, end)` — returns top 3 nearest free slots
- `create_booking(room_id, title, start, end, booked_by)` — requires approval if delegated
- `cancel_booking(booking_id)` — requires booking owner approval

## Audit Log Fields
- booking_id, action, actor_user_id, changes (jsonb diff), timestamp

## v1 vs Later
- v1: manual booking + clash prevention (no agentic actions)
- Later: auto-suggest alternative slots on conflict, delegation-assisted rescheduling