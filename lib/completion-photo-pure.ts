// Pure constants for completion-photo upload — safe to import from both
// client components and server actions. Lives outside the "use server"
// boundary so server-action files don't break the "exports must be async
// functions" rule.

// Curated, not exhaustive. Three is enough for almost every real-world
// task; past that the customer's attention drops off and the proof loses
// signal.
export const MAX_COMPLETION_PHOTOS = 3;

export const COMPLETION_PHOTO_MAX_BYTES = 8 * 1024 * 1024; // 8 MB

export const COMPLETION_PHOTO_ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;
