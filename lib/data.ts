import { createClient } from "@/lib/supabase/server";

export type Room = {
  id: string;
  name: string;
  location: string | null;
  capacity: number;
  amenities: string[];
  is_active: boolean;
};

export type Person = {
  id: string;
  email: string;
  full_name: string;
  role: "admin" | "staff";
};

export type Booking = {
  id: string;
  room_id: string;
  booked_by_user_id: string | null;
  title: string;
  start_time: string;
  end_time: string;
  status: "confirmed" | "cancelled";
};

export type Delegation = {
  id: string;
  delegator_user_id: string;
  delegate_user_id: string;
  is_active: boolean;
};

export type AuditEntry = {
  id: string;
  booking_id: string | null;
  action: string;
  actor_user_id: string | null;
  changes: Record<string, unknown> | null;
  created_at: string;
};

export type WorkspaceData = {
  rooms: Room[];
  users: Person[];
  bookings: Booking[];
  delegations: Delegation[];
  audit: AuditEntry[];
};

export async function getWorkspaceData(): Promise<WorkspaceData> {
  const supabase = await createClient();
  const [rooms, users, bookings, delegations, audit] = await Promise.all([
    supabase.from("rooms").select("id,name,location,capacity,amenities,is_active").order("name"),
    supabase.from("users").select("id,email,full_name,role").order("full_name"),
    supabase.from("bookings").select("id,room_id,booked_by_user_id,title,start_time,end_time,status").order("start_time"),
    supabase.from("delegations").select("id,delegator_user_id,delegate_user_id,is_active").order("created_at", { ascending: false }),
    supabase.from("audit_logs").select("id,booking_id,action,actor_user_id,changes,created_at").order("created_at", { ascending: false }).limit(100),
  ]);

  const firstError = rooms.error || users.error || bookings.error || delegations.error || audit.error;
  if (firstError) throw new Error(firstError.message);
  return {
    rooms: (rooms.data || []) as Room[],
    users: (users.data || []) as Person[],
    bookings: (bookings.data || []) as Booking[],
    delegations: (delegations.data || []) as Delegation[],
    audit: (audit.data || []) as AuditEntry[],
  };
}

export async function writeAuditEntry(entry: {
  booking_id: string | null;
  action: string;
  actor_user_id: string | null;
  changes: Record<string, unknown>;
}) {
  const supabase = await createClient();
  return supabase.from("audit_logs").insert(entry);
}

export async function insertBookingRow(input: {
  room_id: string; booked_by_user_id: string; title: string;
  start_time: string; end_time: string; status: "confirmed";
}) {
  const supabase = await createClient();
  return supabase.from("bookings").insert(input).select("id").single();
}

export async function updateBookingRow(id: string, values: {
  room_id?: string; title?: string; start_time?: string; end_time?: string; status?: "cancelled";
}) {
  const supabase = await createClient();
  return supabase.from("bookings").update(values).eq("id", id);
}

export async function writeRoom(input: {
  id?: string; name: string; location: string; capacity: number; amenities: string[];
}) {
  const supabase = await createClient();
  const { id, ...values } = input;
  return id ? supabase.from("rooms").update(values).eq("id", id) : supabase.from("rooms").insert(values);
}

export async function setRoomActiveRow(id: string, is_active: boolean) {
  const supabase = await createClient();
  return supabase.from("rooms").update({ is_active }).eq("id", id);
}

export async function insertPerson(input: { email: string; full_name: string; role: "staff" | "admin" }) {
  const supabase = await createClient();
  return supabase.from("users").insert(input);
}

export async function saveDelegation(input: { delegator_user_id: string; delegate_user_id: string }) {
  const supabase = await createClient();
  return supabase.from("delegations").upsert({ ...input, is_active: true }, { onConflict: "delegator_user_id,delegate_user_id" });
}

export async function revokeDelegation(delegatorId: string, delegateId: string) {
  const supabase = await createClient();
  return supabase.from("delegations").update({ is_active: false })
    .eq("delegator_user_id", delegatorId).eq("delegate_user_id", delegateId);
}
