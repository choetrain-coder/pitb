import { createClient } from "@/lib/supabase/server";

export type Team = { id: string; name: string };
export type Room = { id: string; name: string; location: string | null; capacity: number; amenities: string[]; is_active: boolean };
export type Person = { id: string; email: string; full_name: string; role: "admin" | "staff" };
export type Booking = { id: string; room_id: string; booked_by_user_id: string | null; title: string; start_time: string; end_time: string; status: "confirmed" | "cancelled" };
export type Delegation = { id: string; delegator_user_id: string; delegate_user_id: string; is_active: boolean };
export type AuditEntry = { id: string; booking_id: string | null; action: string; actor_user_id: string | null; changes: Record<string, unknown> | null; created_at: string };
export type WorkspaceData = { teams: Team[]; team: Team; rooms: Room[]; users: Person[]; bookings: Booking[]; delegations: Delegation[]; audit: AuditEntry[] };

export async function getTeams() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("teams").select("id,name").order("name");
  if (error) throw new Error(error.message);
  return (data || []) as Team[];
}

export async function getWorkspaceData(teamId?: string): Promise<WorkspaceData> {
  const supabase = await createClient();
  const teams = await getTeams();
  const team = teams.find((item) => item.id === teamId) || teams[0];
  if (!team) throw new Error("No team workspace exists yet.");
  const [rooms, usersInTeam, bookings, delegations, audit] = await Promise.all([
    supabase.from("rooms").select("id,name,location,capacity,amenities,is_active").eq("team_id", team.id).order("name"),
    supabase.from("team_members").select("user_id,role").eq("team_id", team.id),
    supabase.from("bookings").select("id,room_id,booked_by_user_id,title,start_time,end_time,status").eq("team_id", team.id).order("start_time"),
    supabase.from("delegations").select("id,delegator_user_id,delegate_user_id,is_active").eq("team_id", team.id).order("created_at", { ascending: false }),
    supabase.from("audit_logs").select("id,booking_id,action,actor_user_id,changes,created_at").eq("team_id", team.id).order("created_at", { ascending: false }).limit(100),
  ]);
  const firstError = rooms.error || usersInTeam.error || bookings.error || delegations.error || audit.error;
  if (firstError) throw new Error(firstError.message);
  const memberIds = (usersInTeam.data || []).map((member) => member.user_id);
  const memberRows = memberIds.length ? await supabase.from("users").select("id,email,full_name,role").in("id", memberIds).order("full_name") : { data: [], error: null };
  if (memberRows.error) throw new Error(memberRows.error.message);
  const roles = new Map((usersInTeam.data || []).map((member) => [member.user_id, member.role]));
  return {
    teams, team,
    rooms: (rooms.data || []) as Room[],
    users: (memberRows.data || []).map((person) => ({ ...person, role: roles.get(person.id) || "staff" })) as Person[],
    bookings: (bookings.data || []) as Booking[],
    delegations: (delegations.data || []) as Delegation[],
    audit: (audit.data || []) as AuditEntry[],
  };
}

export async function insertBookingRow(input: { team_id: string; room_id: string; booked_by_user_id: string; title: string; start_time: string; end_time: string; status: "confirmed" }) {
  const supabase = await createClient(); return supabase.from("bookings").insert(input).select("id").single();
}
export async function updateBookingRow(teamId: string, id: string, values: { room_id?: string; title?: string; start_time?: string; end_time?: string; status?: "cancelled" }) {
  const supabase = await createClient(); return supabase.from("bookings").update(values).eq("team_id", teamId).eq("id", id);
}
export async function writeRoom(input: { team_id: string; id?: string; name: string; location: string; capacity: number; amenities: string[] }) {
  const supabase = await createClient(); const { id, ...values } = input;
  return id ? supabase.from("rooms").update(values).eq("team_id", input.team_id).eq("id", id) : supabase.from("rooms").insert(values);
}
export async function setRoomActiveRow(teamId: string, id: string, is_active: boolean) {
  const supabase = await createClient(); return supabase.from("rooms").update({ is_active }).eq("team_id", teamId).eq("id", id);
}
export async function insertPerson(input: { teamId: string; email: string; full_name: string; role: "staff" | "admin" }) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("register_team_user", {
    target_team: input.teamId,
    user_email: input.email,
    user_name: input.full_name,
    user_role: input.role,
  });
  return { error, data: error ? null : true };
}
export async function saveDelegation(input: { team_id: string; delegator_user_id: string; delegate_user_id: string }) {
  const supabase = await createClient(); return supabase.from("delegations").upsert({ ...input, is_active: true }, { onConflict: "team_id,delegator_user_id,delegate_user_id" });
}
export async function revokeDelegation(teamId: string, delegatorId: string, delegateId: string) {
  const supabase = await createClient(); return supabase.from("delegations").update({ is_active: false }).eq("team_id", teamId).eq("delegator_user_id", delegatorId).eq("delegate_user_id", delegateId);
}
export async function createTeam(name: string, actorId: string) {
  const supabase = await createClient();
  void actorId;
  const { data, error } = await supabase.rpc("create_team_workspace", { team_name: name });
  return { data: data as Team | null, error };
}
