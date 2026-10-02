# Security

## Secret Handling
- Supabase service key lives in server-side env only (never exposed to client)
- Client uses anon key with RLS policies
- No secrets in frontend code or environment

## Permission Model
- **Staff:** can view rooms/bookings, create their own bookings, manage their delegations
- **Delegates:** can edit bookings they've been delegated to (per delegation row)
- **Admins (IT):** can manage rooms, register users, view audit logs, manage all bookings
- v1: open access (demo-first, no login) — all RLS policies permissive
- Lock-down: `auth.uid() = user_id` on bookings; admin role check on rooms/users management

## Approved-Tools Rule
- All DB writes go through `lib/data/` named functions — never raw SQL in UI
- Agent (if added) uses named tools only — never raw `run_any`/`send_any`

## Audit Principle
- Every booking create/update/delete/cancel writes to audit_logs
- Audit logs are admin-readable only (after lock-down)
- Delegation grants/revokes are logged

## Honesty
- If RLS configuration or auth integration is beyond current expertise → stop and get a human security expert before going live with real company data.