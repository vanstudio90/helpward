"use client";

import { useActionState } from "react";
import Image from "next/image";
import { uploadProviderAvatarAction } from "../profile/actions";

/*
  THE PHOTO STEP, AND THE ONE THING IT MUST NOT SAY.

  It must not say the photo is verified, or that we check it is a
  selfie. A server receives an image file; it cannot tell a front
  camera from a rear one, a screenshot, or a photograph of a
  photograph. Nothing in this estate does face detection, and claiming
  otherwise would be the same class of error as the ID-verification
  step that sat on this very checklist for months without anything
  behind it.

  What IS true, and what the copy says instead: a person reviews the
  application and sees this photo, and it cannot be changed afterwards.
  Both of those are enforced — the first by the admin queue rendering
  it, the second by set_my_avatar (0095) refusing to replace a
  helper's.

  `capture="user"` is a hint, not a guarantee: phone browsers tend to
  open the front camera, desktop browsers ignore it entirely. It is
  here because it helps on the device most helpers sign up on, not
  because it enforces anything.
*/
export function PhotoStep({
  hasPhoto,
  avatarUrl,
}: {
  hasPhoto: boolean;
  avatarUrl: string | null;
}) {
  const [state, action, pending] = useActionState(uploadProviderAvatarAction, {});

  if (hasPhoto) {
    return (
      <div className="mt-3 flex items-start gap-3">
        {avatarUrl && (
          <Image
            src={avatarUrl}
            alt="Your profile photo"
            width={64}
            height={64}
            className="h-16 w-16 rounded-full object-cover border border-slate-200"
            unoptimized
          />
        )}
        <p className="text-[13px] text-slate-500">
          This is the photo customers see, and it is what the reviewer checks your
          application against. It cannot be changed from here — contact support if it
          needs correcting.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="mt-3 space-y-2">
      <p className="text-[13px] text-slate-600">
        A clear photo of your face, looking at the camera, with nothing covering it.
        Customers use it to recognise you at the door, and a person at Helpward checks
        it before approving your account.
      </p>
      <p className="text-[13px] font-semibold text-slate-700">
        Choose carefully: you can&apos;t change this later.
      </p>
      <input
        type="file"
        name="avatar"
        accept="image/jpeg,image/png,image/webp"
        capture="user"
        required
        className="block w-full text-[13px] text-slate-700 file:mr-3 file:rounded-field
                   file:border-0 file:bg-slate-900 file:px-3 file:py-2
                   file:text-white file:font-semibold"
      />
      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-field bg-brand-600 px-3 py-2
                   text-[13px] font-semibold text-white disabled:opacity-50"
      >
        {pending ? "Uploading…" : "Upload photo"}
      </button>
      {state?.error && <p className="text-[13px] text-red-600">{state.error}</p>}
      {state?.success && <p className="text-[13px] text-emerald-700">{state.success}</p>}
    </form>
  );
}
