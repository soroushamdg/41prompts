import { notFound } from "next/navigation";
import { Kit } from "./kit";

export const dynamic = "force-dynamic";
export const metadata = { title: "Kit" };

/** Component gallery for the browser drive. Off unless SHOW_KIT=1 or in dev. */
export default function KitPage() {
  if (process.env.NODE_ENV === "production" && process.env.SHOW_KIT !== "1") notFound();
  return <Kit />;
}
