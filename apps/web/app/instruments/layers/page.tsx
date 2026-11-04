import { redirect } from "next/navigation";

// Map Layers splits the land in place on the answer (the overview at /valley), so the old layer stack page is no
// longer reachable by its address: a visitor who has it lands on the valley, with the address's query kept (?case=,
// ?run=).
export default async function LayersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams))
    for (const v of Array.isArray(value) ? value : value === undefined ? [] : [value])
      query.append(key, v);
  const q = query.toString();
  redirect(q ? `/valley?${q}` : "/valley");
}
