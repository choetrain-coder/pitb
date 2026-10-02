"use server";

import { createClient } from "@/lib/supabase/server";
import type { Booking, WorkspaceData } from "@/lib/data";
import {
  getWorkspaceData, insertBookingRow, insertPerson, revokeDelegation, saveDelegation,
  setRoomActiveRow, updateBookingRow, writeAuditEntry, writeRoom,
} from "@/lib/data";

export type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

function validHalfHourRange(start: string, end: string) {
  const from = new Date(start);
  const to = new Date(end);
  return Number.isFinite(from.getTime()) && Number.isFinite(to.getTime()) &&
    from < to && to.getTime() - from.getTime() >= 30 * 60 * 1000 &&
    [from.getMinutes(), to.getMinutes()].every((minute) => minute === 0 || minute === 30) &&
    from.getSeconds() === 0 && to.getSeconds() === 0;
}

async function audit(bookingId: string | null, action: string, actorId: string | null, changes: Record<string, unknown>) {
  const { error } = await writeAuditEntry({
    booking_id: bookingId,
    action,
    actor_user_id: actorId,
    changes,
  });
  if (error) throw new Error(`The change saved, but its audit entry failed: ${error.message}`);
}

async function canEditBooking(booking: Booking, actorId: string) {
  const supabase = await createClient();
  const { data: actor } = await supabase.from("users").select("role").eq("id", actorId).maybeSingle();
  if (booking.booked_by_user_id === actorId || actor?.role === "admin") return true;
  const { data } = await supabase.from("delegations").select("id").eq("delegator_user_id", booking.booked_by_user_id).eq("delegate_user_id", actorId).eq("is_active", true).maybeSingle();
  return Boolean(data);
}

export async function loadWorkspace(): Promise<ActionResult<WorkspaceData>> {
  try { return { ok: true, data: await getWorkspaceData() }; }
  catch (error) { return { ok: false, error: error instanceof Error ? error.message : "Unable to load the booking workspace." }; }
}

export async function checkAvailability(roomId: string, start: string, end: string, exceptId?: string): Promise<ActionResult<boolean>> {
  try {
    const supabase = await createClient();
    let query = supabase.from("bookings").select("id").eq("room_id", roomId).eq("status", "confirmed").lt("start_time", end).gt("end_time", start);
    if (exceptId) query = query.neq("id", exceptId);
    const { data, error } = await query.limit(1);
    if (error) throw error;
    return { ok: true, data: !data?.length };
  } catch (error) { return { ok: false, error: error instanceof Error ? error.message : "Could not check room availability." }; }
}

export async function createBooking(input: { roomId: string; actorId: string; title: string; start: string; end: string }): Promise<ActionResult> {
  const title = input.title.trim();
  if (!title) return { ok: false, error: "Add a meeting title before booking." };
  if (!validHalfHourRange(input.start, input.end)) return { ok: false, error: "Choose a time range of at least 30 minutes using half-hour slots." };
  try {
    const availability = await checkAvailability(input.roomId, input.start, input.end);
    if (!availability.ok) return availability;
    if (!availability.data) return { ok: false, error: "This room is already booked for that time." };
    const { data, error } = await insertBookingRow({ room_id: input.roomId, booked_by_user_id: input.actorId, title, start_time: input.start, end_time: input.end, status: "confirmed" });
    if (error) return { ok: false, error: error.code === "23P01" ? "This room is already booked for that time." : error.message };
    await audit(data.id, "create", input.actorId, { title, room_id: input.roomId, start_time: input.start, end_time: input.end });
    return { ok: true };
  } catch (error) { return { ok: false, error: error instanceof Error ? error.message : "Booking could not be saved." }; }
}

export async function moveBooking(input: { bookingId: string; actorId: string; roomId: string; title: string; start: string; end: string }): Promise<ActionResult> {
  try {
    if (!input.title.trim()) return { ok: false, error: "Add a meeting title before saving." };
    if (!validHalfHourRange(input.start, input.end)) return { ok: false, error: "Choose a time range of at least 30 minutes using half-hour slots." };
    const supabase = await createClient();
    const { data: old, error: readError } = await supabase.from("bookings").select("*").eq("id", input.bookingId).single();
    if (readError || !old) throw readError || new Error("Booking not found.");
    if (!(await canEditBooking(old as Booking, input.actorId))) return { ok: false, error: "You do not have permission to change this booking." };
    const available = await checkAvailability(input.roomId, input.start, input.end, input.bookingId);
    if (!available.ok) return available;
    if (!available.data) return { ok: false, error: "This room is already booked for that time." };
    const { error } = await updateBookingRow(input.bookingId, { room_id: input.roomId, title: input.title.trim(), start_time: input.start, end_time: input.end });
    if (error) return { ok: false, error: error.code === "23P01" ? "This room is already booked for that time." : error.message };
    await audit(input.bookingId, "update", input.actorId, { before: { room_id: old.room_id, title: old.title, start_time: old.start_time, end_time: old.end_time }, after: { room_id: input.roomId, title: input.title.trim(), start_time: input.start, end_time: input.end } });
    return { ok: true };
  } catch (error) { return { ok: false, error: error instanceof Error ? error.message : "Booking could not be updated." }; }
}

export async function cancelBooking(bookingId: string, actorId: string): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { data: booking, error: readError } = await supabase.from("bookings").select("*").eq("id", bookingId).single();
    if (readError || !booking) throw readError || new Error("Booking not found.");
    if (!(await canEditBooking(booking as Booking, actorId))) return { ok: false, error: "You do not have permission to cancel this booking." };
    const { error } = await updateBookingRow(bookingId, { status: "cancelled" });
    if (error) throw error;
    await audit(bookingId, "cancel", actorId, { title: booking.title, room_id: booking.room_id, start_time: booking.start_time, end_time: booking.end_time });
    return { ok: true };
  } catch (error) { return { ok: false, error: error instanceof Error ? error.message : "Booking could not be cancelled." }; }
}

async function isAdmin(actorId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("users").select("role").eq("id", actorId).maybeSingle();
  return data?.role === "admin";
}

export async function saveRoom(input: { actorId: string; id?: string; name: string; location: string; capacity: number; amenities: string[] }): Promise<ActionResult> {
  if (!(await isAdmin(input.actorId))) return { ok: false, error: "Only an IT admin can manage rooms." };
  if (!input.name.trim() || !Number.isInteger(input.capacity) || input.capacity < 1) return { ok: false, error: "Enter a room name and a positive whole-number capacity." };
  try {
    const values = { name: input.name.trim(), location: input.location.trim(), capacity: input.capacity, amenities: input.amenities };
    const { error } = await writeRoom({ ...values, id: input.id });
    if (error) throw error;
    return { ok: true };
  } catch (error) { return { ok: false, error: error instanceof Error ? error.message : "Room could not be saved." }; }
}

export async function setRoomActive(actorId: string, id: string, active: boolean): Promise<ActionResult> {
  if (!(await isAdmin(actorId))) return { ok: false, error: "Only an IT admin can manage rooms." };
  try { const { error } = await setRoomActiveRow(id, active); if (error) throw error; return { ok: true }; }
  catch (error) { return { ok: false, error: error instanceof Error ? error.message : "Room could not be updated." }; }
}

export async function registerUser(input: { actorId: string; email: string; fullName: string; role: "staff" | "admin" }): Promise<ActionResult> {
  if (!(await isAdmin(input.actorId))) return { ok: false, error: "Only an IT admin can register users." };
  if (!input.fullName.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) return { ok: false, error: "Enter the person's name and a valid company email." };
  try { const { error } = await insertPerson({ email: input.email.trim().toLowerCase(), full_name: input.fullName.trim(), role: input.role }); if (error) throw error; return { ok: true }; }
  catch (error) { return { ok: false, error: error instanceof Error ? error.message : "User could not be registered." }; }
}

export async function setDelegation(input: { actorId: string; delegateId: string; active: boolean }): Promise<ActionResult> {
  if (!input.delegateId || input.delegateId === input.actorId) return { ok: false, error: "Choose another person to delegate to." };
  try {
    if (input.active) {
      const { error } = await saveDelegation({ delegator_user_id: input.actorId, delegate_user_id: input.delegateId });
      if (error) throw error;
      await audit(null, "delegation_granted", input.actorId, { delegate_user_id: input.delegateId });
    } else {
      const { error } = await revokeDelegation(input.actorId, input.delegateId);
      if (error) throw error;
      await audit(null, "delegation_revoked", input.actorId, { delegate_user_id: input.delegateId });
    }
    return { ok: true };
  } catch (error) { return { ok: false, error: error instanceof Error ? error.message : "Delegation could not be updated." }; }
}
