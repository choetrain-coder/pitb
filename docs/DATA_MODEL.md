# Data Model

## users
- id uuid PK
- email text unique not null
- full_name text not null
- role text default 'staff' — 'staff' | 'admin'
- user_id uuid (nullable, for owner-scoping later)
- created_at timestamptz

## rooms
- id uuid PK
- name text not null
- location text
- capacity int
- amenities text[]
- is_active boolean default true
- user_id uuid (nullable)
- created_at timestamptz

## bookings
- id uuid PK
- room_id uuid not null (references rooms)
- booked_by_user_id uuid (nullable — references users)
- title text not null
- start_time timestamptz not null
- end_time timestamptz not null
- status text default 'confirmed' — 'confirmed' | 'cancelled'
- user_id uuid (nullable, for owner-scoping)
- created_at timestamptz
- **Exclusion constraint:** no two confirmed bookings overlap for the same room

## delegations
- id uuid PK
- delegator_user_id uuid (references users)
- delegate_user_id uuid (references users)
- is_active boolean default true
- user_id uuid (nullable)
- created_at timestamptz

## audit_logs
- id uuid PK
- booking_id uuid
- action text — 'create' | 'update' | 'delete' | 'cancel'
- actor_user_id uuid
- changes jsonb
- user_id uuid (nullable)
- created_at timestamptz

## RLS Notes
- v1: permissive read/write for all (demo-first)
- Lock-down: bookings visible to owner + delegates + admins; rooms/users managed by admins only; audit logs admin-only

## AI Fields
None in v1. Booking title and time are user-supplied. If we add smart scheduling later, suggested_room + confidence + review_status columns would be added to bookings.