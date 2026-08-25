import { redirect } from "next/navigation";

/**
 * Signed-in users land on their own expenses. Managers reach the review queue
 * from the nav — the brief scopes the default view to "your own expenses" for
 * everyone, and managers are employees too.
 */
export default function HomePage() {
  redirect("/expenses");
}
