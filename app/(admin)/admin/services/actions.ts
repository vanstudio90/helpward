"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/admin";

type State = { error?: string; success?: string } | undefined;

export async function toggleServiceActiveAction(serviceId: string, active: boolean) {
  await requireAdmin();
  const supabase = createSupabaseServiceClient();
  await supabase.from("services").update({ active }).eq("id", serviceId);
  revalidatePath("/admin/services");
  revalidatePath("/services");
  revalidatePath("/new-request");
}

export async function createServiceAction(
  _prev: State,
  formData: FormData
): Promise<State> {
  const id = String(formData.get("id") ?? "").trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
  const category_id = String(formData.get("category_id") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const blurb = String(formData.get("blurb") ?? "").trim();
  const base_price_dollars = parseFloat(String(formData.get("base_price") ?? "0"));
  const eta_label = String(formData.get("eta_label") ?? "").trim() || null;
  const image_url = String(formData.get("image_url") ?? "").trim() || null;
  const popular = formData.get("popular") === "on";

  if (!id || !title || !blurb || !category_id) return { error: "All fields are required." };
  if (!base_price_dollars || base_price_dollars <= 0) return { error: "Price must be > 0." };
  if (id.length > 60) return { error: "Slug too long (max 60 chars)." };
  if (title.length > 80) return { error: "Title too long (max 80 chars)." };
  if (blurb.length > 400) return { error: "Blurb too long (max 400 chars)." };
  if (eta_label && eta_label.length > 40) return { error: "ETA label too long." };
  if (image_url && !/^https:\/\//.test(image_url)) return { error: "Image URL must start with https://" };
  if (image_url && image_url.length > 500) return { error: "Image URL too long." };

  try {
    await requireAdmin();
  } catch {
    return { error: "Forbidden." };
  }
  const supabase = createSupabaseServiceClient();
  const { error } = await supabase.from("services").insert({
    id, category_id, title, blurb,
    base_price_cents: Math.round(base_price_dollars * 100),
    eta_label, image_url, popular, active: true,
  });
  if (error) return { error: error.message };

  revalidatePath("/admin/services");
  revalidatePath("/services");
  revalidatePath("/new-request");
  return { success: `${title} added.` };
}

// Update an existing service. Slug + category are immutable post-creation
// (changing them would break inbound /services/<slug> and /cities/<x>/<slug>
// SEO URLs) — all the editable copy/pricing/image go through this single action.
export async function updateServiceAction(
  serviceId: string,
  _prev: State,
  formData: FormData,
): Promise<State> {
  try {
    await requireAdmin();
  } catch {
    return { error: "Forbidden." };
  }

  const title = String(formData.get("title") ?? "").trim();
  const blurb = String(formData.get("blurb") ?? "").trim();
  const base_price_dollars = parseFloat(String(formData.get("base_price") ?? "0"));
  const eta_label = String(formData.get("eta_label") ?? "").trim() || null;
  const image_url = String(formData.get("image_url") ?? "").trim() || null;
  const popular = formData.get("popular") === "on";

  if (!title || !blurb) return { error: "Title and blurb are required." };
  if (!base_price_dollars || base_price_dollars <= 0) return { error: "Price must be > 0." };
  if (title.length > 80) return { error: "Title too long (max 80 chars)." };
  if (blurb.length > 400) return { error: "Blurb too long (max 400 chars)." };
  if (eta_label && eta_label.length > 40) return { error: "ETA label too long." };
  if (image_url && !/^https:\/\//.test(image_url)) return { error: "Image URL must start with https://" };
  if (image_url && image_url.length > 500) return { error: "Image URL too long." };

  const supabase = createSupabaseServiceClient();
  const { error } = await supabase
    .from("services")
    .update({
      title, blurb,
      base_price_cents: Math.round(base_price_dollars * 100),
      eta_label, image_url, popular,
    })
    .eq("id", serviceId);
  if (error) return { error: error.message };

  // Refresh every surface that renders service data — homepage uses it via
  // ServicesCatalog, /services/[slug] is its own page, /cities/[city]/[service]
  // joins both, /new-request lists services. Don't skip these or the admin
  // sees stale prices after editing.
  revalidatePath("/admin/services");
  revalidatePath("/");
  revalidatePath("/services");
  revalidatePath("/new-request");
  revalidatePath(`/services/${serviceId}`);
  revalidatePath("/cities", "layout");

  return { success: `${title} updated.` };
}

/* ================================================================== */
/* DRAFTS AND PUBLICATION                                             */
/* ================================================================== */
/*
  The three actions above write straight through, and they predate the
  draft workflow. The ones below are the new path for the service
  editor: propose, review, publish — so that changing a price is a
  decision somebody takes rather than a side effect of opening a form.
*/

/*
  CHANGING A SERVICE.

  Every one of these goes through a database function that checks the
  admin claim itself, validates the result and writes its own audit
  event. Nothing here trusts the form: the browser decides what to
  propose, the database decides what is allowed.

  WHAT THE OPERATOR IS TOLD WHEN IT REFUSES. The database raises a
  specific code for each refusal, and each one needs a different
  response from the person reading it — reload, fix a number, or stop.
  Printing "Failed." for all of them is how somebody retries the same
  impossible save six times.
*/

export type ServiceResult =
  | { ok: true; message: string; detail?: string }
  | { ok: false; error: string; conflict?: boolean };

type PgError = { message?: string; code?: string } | null;

function fail(error: PgError): ServiceResult {
  const message = error?.message ?? "The change could not be saved.";
  switch (error?.code) {
    case "42501":
      return { ok: false, error: "You are not permitted to change services." };
    case "HW090":
      return { ok: false, error: "That service no longer exists." };
    case "HW091":
      return { ok: false, error: "That draft no longer exists. Reload and start again." };
    case "HW092":
      return { ok: false, error: "This draft has already been published or discarded. Reload to see where it got to." };
    case "HW093":
      return { ok: false, error: "There is nothing to publish — this draft changes nothing." };
    case "HW094":
      /* Somebody else moved a field this draft is about to overwrite.
         That is a reload, not a retry, so it is flagged separately. */
      return { ok: false, error: stripContext(message), conflict: true };
    case "HW095":
      return { ok: false, error: stripContext(message) };
    case "HW096":
      return { ok: false, error: "Say why it is being discarded. The reason is kept with the draft." };
    default:
      return { ok: false, error: message };
  }
}

/* Postgres prefixes its own sentence; the operator wants the rest. */
function stripContext(message: string): string {
  return message.replace(/^[^:]*:\s*/, "").trim() || message;
}

export async function saveServiceDraftAction(
  serviceId: string,
  market: "CA" | "US",
  changes: Record<string, unknown>,
  note?: string,
): Promise<ServiceResult> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_service_draft_save", {
    p_service: serviceId, p_market: market, p_changes: changes, p_note: note ?? null,
  });
  if (error) return fail(error);
  const result = data as { changed_fields: number };
  revalidatePath("/admin/services");
  return result.changed_fields === 0
    ? {
        ok: true,
        message: "Nothing changed, so nothing was saved.",
        detail: "Every value you submitted already matches what is live.",
      }
    : {
        ok: true,
        message: `Draft saved — ${result.changed_fields} unpublished change${result.changed_fields === 1 ? "" : "s"}.`,
        detail: "Customers are still quoted the published prices until this is published.",
      };
}

export async function publishServiceDraftAction(draftId: string): Promise<ServiceResult> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_service_draft_publish", { p_draft: draftId });
  if (error) return fail(error);
  const result = data as { fields_published: number; market: string };
  revalidatePath("/admin/services");
  revalidatePath("/services");
  return {
    ok: true,
    message: `Published — ${result.fields_published} field${result.fields_published === 1 ? "" : "s"} changed in ${result.market}.`,
    detail: "New quotes use these values. Requests and bookings already quoted keep the price they were given.",
  };
}

export async function discardServiceDraftAction(
  draftId: string, reason: string,
): Promise<ServiceResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_service_draft_discard", {
    p_draft: draftId, p_reason: reason,
  });
  if (error) return fail(error);
  revalidatePath("/admin/services");
  return {
    ok: true,
    message: "Draft discarded.",
    detail: "The draft is kept with your reason — nothing was deleted and the live service is unchanged.",
  };
}
