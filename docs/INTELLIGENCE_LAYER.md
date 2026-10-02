# Intelligence Layer

## Messy Inputs
- User picks a slot that conflicts → system suggests the nearest available slot
- User searches for a room by capacity/amenity → ranked results

## Auto-Structure Schema (later)
```json
{
  "requested_time": "2024-03-15T10:00:00",
  "duration_minutes": 30,
  "participants": 8,
  "preferred_amenities": ["projector", "whiteboard"],
  "suggested_rooms": [
    {"room_id": "...", "name": "Boardroom A", "score": 0.92, "reason": "capacity match + available"}
  ]
}
```

## Events to Track
- booking_created, booking_updated, booking_cancelled, clash_detected, delegation_granted, delegation_revoked

## Scoring Rules (v1 — rule-based)
- Room availability: 50 pts if free during requested slot
- Capacity match: 30 pts if room capacity >= participants (−10 if too large by 2x)
- Amenity match: +5 pts per matched amenency

## What Gets Ranked
- Room suggestions for a given time + participant count + amenities

## v1 vs Later
- v1: rule-based clash detection + simple availability check (no AI)
- Later: smart room recommendations, optimal slot suggestions, no-show prediction