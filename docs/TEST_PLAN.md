# Test Plan

## v1 Success Scenario
1. Open app → calendar loads with seed bookings visible (month view)
2. Switch to week view → half-hourly grid shows existing bookings shaded
3. Click an empty 10:00–10:30 slot → booking form opens
4. Select a room → form shows room is available
5. Enter title "Team Sync" → submit → booking appears on calendar
6. Open My Bookings → booking listed → cancel it → calendar updates
7. Open Rooms → add new room "Huddle B" → appears in room selector
8. Open Users → register user "jane@company.com" → appears in user list
9. Open Delegations → grant delegate rights to jane → jane can now edit your bookings
10. As jane: open a delegated booking → change time to 14:00 → no clash → booking moves on calendar

## Empty State
- No bookings exist → calendar shows empty grid with "No bookings yet — click a slot to create one"
- No rooms exist → room selector shows "No rooms available — ask IT to add rooms"
- No users registered → users screen shows empty state with add button

## Error State
- Try to book an overlapping slot on the same room → form shows "This room is already booked for that time" and blocks submit
- Network error → calendar shows "Failed to load bookings — retry" with retry button
- Submit booking with missing title → form shows validation error inline

## Clash Prevention
- Create booking for Room A 10:00–11:00
- Attempt second booking Room A 10:30–11:00 → rejected (overlap)
- Book Room B 10:30–11:00 → succeeds (different room)

## Delegation Edge Case
- Delegate tries to delete a booking → allowed (edit rights include cancel)
- Non-delegate tries to edit another user's booking → blocked