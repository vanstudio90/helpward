import { redirect } from "next/navigation";

/* /helper is a URL people actually arrive at.
 *
 * It is the natural thing to type, it is what every /helper/* link
 * shortens to in conversation, and the app's own menu once pointed at
 * it — but there was no page here, so it fell through to the
 * not-found screen and told a signed-in helper we were "not offering
 * that one right now".
 *
 * The section's real front door is the dashboard. Signing in is already
 * handled one level up: the (helper) layout redirects anyone without a
 * session to /login?next=/helper/dashboard before this runs, so this
 * only ever sees a helper who is allowed to be here.
 */
export default function HelperIndexPage() {
  redirect("/helper/dashboard");
}
