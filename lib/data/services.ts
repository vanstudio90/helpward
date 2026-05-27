import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Service, ServiceCategory, Country } from "@/lib/supabase/types";

export type ServiceWithCategory = Service & { category: ServiceCategory };

/* Service catalog reads. Always use server client — RLS lets anyone read
   active services. */
export async function listServices(opts?: {
  country?: Country;
  categoryId?: string;
}): Promise<ServiceWithCategory[]> {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("services")
    .select("*, category:service_categories(*)")
    .eq("active", true)
    .order("popular", { ascending: false })
    .order("title");

  if (opts?.categoryId) {
    query = query.eq("category_id", opts.categoryId);
  }
  if (opts?.country) {
    query = query.contains("countries", [opts.country]);
  }

  const { data, error } = await query;
  if (error) {
    console.error("listServices error:", error.message);
    return [];
  }
  return (data ?? []) as ServiceWithCategory[];
}

export async function listCategories(): Promise<ServiceCategory[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("service_categories")
    .select("*")
    .eq("active", true)
    .order("sort_order");
  if (error) {
    console.error("listCategories error:", error.message);
    return [];
  }
  return data ?? [];
}

export async function getService(slug: string): Promise<ServiceWithCategory | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("services")
    .select("*, category:service_categories(*)")
    .eq("id", slug)
    .single();
  if (error) {
    console.error("getService error:", error.message);
    return null;
  }
  return data as ServiceWithCategory;
}
