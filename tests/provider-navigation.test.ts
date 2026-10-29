import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

/* A helper on a phone had NO navigation at all.
 *
 * The provider sidebar is `hidden lg:flex`, so below 1024px none of the ten
 * sections were reachable — land on Active task from a notification and you
 * were stranded with no way back to anything.
 */

const layout = readFileSync("app/(provider)/layout.tsx", "utf8");
const tabBar = readFileSync("components/provider/ProviderTabBar.tsx", "utf8");
const topBar = readFileSync("components/provider/ProviderTopBar.tsx", "utf8");
const sideNav = readFileSync("components/provider/ProviderSideNav.tsx", "utf8");

test("the phone has navigation", () => {
  assert.match(layout, /<ProviderTabBar/);
  // Matches the tag however it is called. Pinning `<ProviderTopBar />`
  // exactly made this fail the moment the bar took a prop, which told us
  // nothing about navigation — the thing the test is here to protect.
  assert.match(layout, /<ProviderTopBar[\s/>]/);
  // And it must be hidden where the sidebar takes over, or both show at once.
  assert.match(tabBar, /lg:hidden/);
  assert.match(topBar, /lg:hidden/);
  assert.match(layout, /hidden lg:flex/, "the sidebar should still be desktop-only");
});

test("the tab bar stays thumb-sized", () => {
  // Five is the practical limit for a bottom bar; everything else belongs
  // behind Menu. grid-cols-5 is the thing that would silently break if a
  // sixth tab were added.
  const tabs = tabBar.match(/href: "\/provider\/[a-z]+"/g) ?? [];
  assert.equal(tabs.length, 5, `tab bar has ${tabs.length} tabs, should have 5`);
  assert.match(tabBar, /grid-cols-5/);
  assert.match(tabBar, /safe-area-inset-bottom/, "must clear the iPhone home indicator");
});

test("Menu reaches everything the tabs do not", () => {
  assert.ok(existsSync("app/(provider)/provider/menu/page.tsx"));
  const menu = readFileSync("app/(provider)/provider/menu/page.tsx", "utf8");
  // Every section that is NOT a tab has to be reachable from Menu, or it is
  // unreachable on a phone.
  for (const href of ["/provider/schedule", "/provider/messages", "/provider/reviews",
                      "/provider/portfolio", "/provider/analytics", "/provider/profile",
                      "/provider/onboard"]) {
    assert.ok(menu.includes(href), `Menu does not link to ${href}`);
  }
  assert.match(menu, /logoutAction/, "no way to log out on a phone");
});

test("the content clears the fixed tab bar", () => {
  // A fixed bar over the last element hides whatever sits at the bottom of
  // the page — usually the save button.
  assert.match(layout, /pb-20 lg:pb-0/);
});

test("both navigations show where you are", () => {
  assert.match(tabBar, /aria-current=\{active \? "page" : undefined\}/);
  assert.match(sideNav, /aria-current=\{active \? "page" : undefined\}/);
  // The sidebar previously rendered every link identically.
  assert.match(sideNav, /bg-emerald-50 text-emerald-900/);
});

test("back goes somewhere that was actually visited", () => {
  // Sections reached through Menu send you back to Menu; a generic
  // history-back would lie when the page was opened from a link.
  assert.match(topBar, /VIA_MENU/);
  assert.match(topBar, /"\/provider\/menu" : base/);
});

test("no icon components cross the server/client boundary", () => {
  /* This shipped a 500 on every provider page.
   *
   * NAV_GROUPS was defined in the Server Component layout and passed to
   * ProviderSideNav, a Client Component. The items carry icon COMPONENTS,
   * and a React component is a function — functions cannot be serialised
   * across that boundary. TypeScript cannot see it: the types are correct
   * and the serialisation is not, so tsc, the build and every existing
   * test all passed while the live page threw.
   *
   * The rule that prevents it: a client nav owns its own list. */
  assert.doesNotMatch(layout, /NAV_GROUPS/,
    "the layout defines a nav list again — keep it inside the client component");
  assert.doesNotMatch(layout, /<ProviderSideNav[^>]*groups=/,
    "icon components are being passed from a Server Component again");

  // Each client nav must declare its own items.
  assert.match(sideNav, /^const GROUPS = \[/m);
  assert.match(tabBar, /^const TABS = \[/m);
  // And both must import their icons directly rather than receive them.
  assert.match(sideNav, /from "lucide-react"/);
  assert.match(tabBar, /from "lucide-react"/);
});
