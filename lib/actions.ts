"use server";

import { createClient } from "@/lib/supabase/server";
import type { Booking, WorkspaceData } from "@/lib/data";
import { createTeam as insertTeam, getWorkspaceData, insertBookingRow, insertPerson, revokeDelegation, saveDelegation, setRoomActiveRow, updateBookingRow, writeAuditEntry, writeRoom } from "@/lib/data";

export type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };
const failed = <T = undefined>(error: unknown, fallback: string): ActionResult<T> => ({ ok: false, error: error instanceof Error ? error.message : fallback });
function validHalfHourRange(start: string, end: string) {
  const from = new Date(start), to = new Date(end);
  return Number.isFinite(from.getTime()) && Number.isFinite(to.getTime()) && from < to && to.getTime() - from.getTime() >= 1800000 && [from.getMinutes(), to.getMinutes()].every((minute) => minute === 0 || minute === 30) && from.getSeconds() === 0 && to.getSeconds() === 0;
}
async function audit(teamId: string, bookingId: string | null, action: string, actorId: string | null, changes: Record<string, unknown>) {
  const { error } = await writeAuditEntry({ team_id: teamId, booking_id: bookingId, action, actor_user_id: actorId, changes });
  if (error) throw new Error(`The change saved, but its audit entry failed: ${error.message}`);
}
async function isTeamAdmin(teamId: string, actorId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("team_members").select("role").eq("team_id", teamId).eq("user_id", actorId).maybeSingle();
  return data?.role === "admin";
}
async function canEditBooking(teamId: string, booking: Booking, actorId: string) {
  const supabase = await createClient();
  const { data: actor } = await supabase.from("team_members").select("role").eq("team_id", teamId).eq("user_id", actorId).maybeSingle();
  if (!actor) return false;
  if (booking.booked_by_user_id === actorId || actor.role === "admin") return true;
  const { data } = await supabase.from("delegations").select("id").eq("team_id", teamId).eq("delegator_user_id", booking.booked_by_user_id).eq("delegate_user_id", actorId).eq("is_active", true).maybeSingle();
  return Boolean(data);
}
export async function loadWorkspace(teamId?: string): Promise<ActionResult<WorkspaceData>> {
  try { return { ok: true, data: await getWorkspaceData(teamId) }; }
  catch (error) { return failed(error, "Unable to load the booking workspace."); }
}
export async function createWorkspaceTeam(input: { actorId: string; name: string }): Promise<ActionResult<{id:string;name:string}>> {
  if (!input.name.trim()) return { ok: false, error: "Give the team a name." };
  try {
    const supabase = await createClient();
    const { data: role } = await supabase.from("users").select("role").eq("id", input.actorId).maybeSingle();
    if (role?.role !== "admin") return { ok: false, error: "Only an administrator can create a team workspace." };
    const result = await insertTeam(input.name.trim(), input.actorId);
    if (result.error || !result.data) throw result.error || new Error("Could not create team.");
    return { ok: true, data: result.data };
  } catch (error) { return failed(error, "Team could not be created."); }
}
export async function checkAvailability(teamId: string, roomId: string, start: string, end: string, exceptId?: string): Promise<ActionResult<boolean>> {
  try {
    const supabase = await createClient();
    let query = supabase.from("bookings").select("id").eq("team_id", teamId).eq("room_id", roomId).eq("status", "confirmed").lt("start_time", end).gt("end_time", start);
    if (exceptId) query = query.neq("id", exceptId);
    const { data, error } = await query.limit(1); if (error) throw error;
    return { ok: true, data: !data?.length };
  } catch (error) { return failed(error, "Could not check room availability."); }
}
export async function createBooking(input: { teamId: string; roomId: string; actorId: string; title: string; start: string; end: string }): Promise<ActionResult> {
  const title = input.title.trim();
  if (!title) return { ok: false, error: "Add a meeting title before booking." };
  if (!validHalfHourRange(input.start, input.end)) return { ok: false, error: "Choose a time range of at least 30 minutes using half-hour slots." };
  try {
    const supabase = await createClient();
    const { data: member } = await supabase.from("team_members").select("user_id").eq("team_id", input.teamId).eq("user_id", input.actorId).maybeSingle();
    if (!member) return { ok: false, error: "Choose a member of this team to book the room." };
    const availability = await checkAvailability(input.teamId, input.roomId, input.start, input.end);
    if (!availability.ok) return availability;
    if (!availability.data) return { ok: false, error: "This room is already booked for that time." };
    const { data, error } = await insertBookingRow({ team_id: input.teamId, room_id: input.roomId, booked_by_user_id: input.actorId, title, start_time: input.start, end_time: input.end, status: "confirmed" });
    if (error) return { ok: false, error: error.code === "23P01" ? "This room is already booked for that time." : error.message };
    await audit(input.teamId, data.id, "create", input.actorId, { title, room_id: input.roomId, start_time: input.start, end_time: input.end });
    return { ok: true };
  } catch (error) { return failed(error, "Booking could not be saved."); }
}
export async function moveBooking(input: { teamId: string; bookingId: string; actorId: string; roomId: string; title: string; start: string; end: string }): Promise<ActionResult> {
  try {
    if (!input.title.trim()) return { ok: false, error: "Add a meeting title before saving." };
    if (!validHalfHourRange(input.start, input.end)) return { ok: false, error: "Choose a time range of at least 30 minutes using half-hour slots." };
    const supabase = await createClient();
    const { data: old, error: readError } = await supabase.from("bookings").select("*").eq("team_id", input.teamId).eq("id", input.bookingId).single();
    if (readError || !old) throw readError || new Error("Booking not found.");
    if (!(await canEditBooking(input.teamId, old as Booking, input.actorId))) return { ok: false, error: "You do not have permission to change this booking." };
    const available = await checkAvailability(input.teamId, input.roomId, input.start, input.end, input.bookingId);
    if (!available.ok) return available;
    if (!available.data) return { ok: false, error: "This room is already booked for that time." };
    const { error } = await updateBookingRow(input.teamId, input.bookingId, { room_id: input.roomId, title: input.title.trim(), start_time: input.start, end_time: input.end });
    if (error) return { ok: false, error: error.code === "23P01" ? "This room is already booked for that time." : error.message };
    await audit(input.teamId, input.bookingId, "update", input.actorId, { before: { room_id: old.room_id, title: old.title, start_time: old.start_time, end_time: old.end_time }, after: { room_id: input.roomId, title: input.title.trim(), start_time: input.start, end_time: input.end } });
    return { ok: true };
  } catch (error) { return failed(error, "Booking could not be updated."); }
}
export async function cancelBooking(teamId: string, bookingId: string, actorId: string): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { data: booking, error: readError } = await supabase.from("bookings").select("*").eq("team_id", teamId).eq("id", bookingId).single();
    if (readError || !booking) throw readError || new Error("Booking not found.");
    if (!(await canEditBooking(teamId, booking as Booking, actorId))) return { ok: false, error: "You do not have permission to cancel this booking." };
    const { error } = await updateBookingRow(teamId, bookingId, { status: "cancelled" }); if (error) throw error;
    await audit(teamId, bookingId, "cancel", actorId, { title: booking.title, room_id: booking.room_id, start_time: booking.start_time, end_time: booking.end_time });
    return { ok: true };
  } catch (error) { return failed(error, "Booking could not be cancelled."); }
}
export async function saveRoom(input: { teamId:string; actorId: string; id?: string; name: string; location: string; capacity: number; amenities: string[] }): Promise<ActionResult> {
  if (!(await isTeamAdmin(input.teamId, input.actorId))) return { ok: false, error: "Only a team admin can manage rooms." };
  if (!input.name.trim() || !Number.isInteger(input.capacity) || input.capacity < 1) return { ok: false, error: "Enter a room name and a positive whole-number capacity." };
  try { const { error } = await writeRoom({ team_id: input.teamId, id: input.id, name: input.name.trim(), location: input.location.trim(), capacity: input.capacity, amenities: input.amenities }); if (error) throw error; return { ok: true }; }
  catch (error) { return failed(error, "Room could not be saved."); }
}
export async function setRoomActive(teamId: string, actorId: string, id: string, active: boolean): Promise<ActionResult> {
  if (!(await isTeamAdmin(teamId, actorId))) return { ok: false, error: "Only a team admin can manage rooms." };
  try { const { error } = await setRoomActiveRow(teamId, id, active); if (error) throw error; return { ok: true }; }
  catch (error) { return failed(error, "Room could not be updated."); }
}
export async function registerUser(input: { teamId:string; actorId: string; email: string; fullName: string; role: "staff" | "admin" }): Promise<ActionResult> {
  if (!(await isTeamAdmin(input.teamId, input.actorId))) return { ok: false, error: "Only a team admin can manage team members." };
  if (!input.fullName.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) return { ok: false, error: "Enter the person's name and a valid company email." };
  try { const { error } = await insertPerson({ teamId: input.teamId, email: input.email.trim().toLowerCase(), full_name: input.fullName.trim(), role: input.role }); if (error) throw error; return { ok: true }; }
  catch (error) { return failed(error, "Person could not be added to this team."); }
}
export async function setDelegation(input: { teamId:string; actorId: string; delegateId: string; active: boolean }): Promise<ActionResult> {
  if (!(await isTeamAdmin(input.teamId, input.actorId)) && !await isTeamMember(input.teamId, input.actorId)) return { ok: false, error: "Only a member of this team can manage delegations." };
  if (!input.delegateId || input.delegateId === input.actorId) return { ok: false, error: "Choose another person to delegate to." };
  try {
    const result = input.active ? await saveDelegation({ team_id: input.teamId, delegator_user_id: input.actorId, delegate_user_id: input.delegateId }) : await revokeDelegation(input.teamId, input.actorId, input.delegateId);
    if (result.error) throw result.error;
    await audit(input.teamId, null, input.active ? "delegation_granted" : "delegation_revoked", input.actorId, { delegate_user_id: input.delegateId });
    return { ok: true };
  } catch (error) { return failed(error, "Delegation could not be updated."); }
}
async function isTeamMember(teamId:string, actorId:string) {
  const supabase = await createClient(); const { data } = await supabase.from("team_members").select("user_id").eq("team_id", teamId).eq("user_id", actorId).maybeSingle(); return Boolean(data);
}
