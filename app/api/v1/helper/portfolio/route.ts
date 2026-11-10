import { withBearerAuth } from "@/lib/api/bearer";
import { listPortfolioPhotos, setPortfolioPhoto } from "@/lib/portfolio";

/*
  The helper's portfolio, for the native app.

  Portfolio was the last row in the app's menu still pointing at
  helpward.com, and an embedded browser carries none of the app's
  session — so a signed-in helper tapping it got the website's login
  form under a Helpward header. The page itself cannot be loaded as-is
  either: the booking-photos bucket is private and every tile is a
  service-role signed URL.

  So the data comes through here instead, and the grid is native. Same
  shared implementation as the website's own page and action, so the two
  surfaces cannot drift on what "completed" or "featured" means.
*/

export async function GET(request: Request) {
  return withBearerAuth(async ({ user, supabase }) => {
    const photos = await listPortfolioPhotos(supabase, user.id);
    return Response.json({ photos });
  })(request);
}

type PatchBody = {
  photoId?: unknown;
  isPortfolio?: unknown;
  caption?: unknown;
};

/*
  Feature a photo, unfeature it, or rewrite its caption.

  PATCH rather than POST: this changes one field of one existing photo,
  and nothing here creates anything.
*/
export async function PATCH(request: Request) {
  return withBearerAuth(async ({ user, supabase }) => {
    let body: PatchBody;
    try {
      body = (await request.json()) as PatchBody;
    } catch {
      return Response.json({ error: "Expected a JSON body." }, { status: 400 });
    }

    if (typeof body.photoId !== "string" || body.photoId.length === 0) {
      return Response.json({ error: "Which photo?" }, { status: 400 });
    }
    if (body.isPortfolio !== undefined && typeof body.isPortfolio !== "boolean") {
      return Response.json({ error: "isPortfolio must be true or false." }, { status: 400 });
    }
    if (
      body.caption !== undefined
      && body.caption !== null
      && typeof body.caption !== "string"
    ) {
      return Response.json({ error: "caption must be text or null." }, { status: 400 });
    }

    const result = await setPortfolioPhoto(supabase, user.id, body.photoId, {
      isPortfolio: body.isPortfolio as boolean | undefined,
      caption: body.caption as string | null | undefined,
    });
    /*
      409 for a refused change, as everywhere else in /api/v1/helper. A
      helper whose booking is not completed, or whose photo is not
      theirs, matches no row — the policy refuses it, and that is a
      conflict with the state of the world rather than a bad request.
    */
    if (!result.ok) return Response.json({ error: result.error }, { status: 409 });
    return Response.json({
      message: result.message,
      isPortfolio: result.isPortfolio ?? null,
    });
  })(request);
}
