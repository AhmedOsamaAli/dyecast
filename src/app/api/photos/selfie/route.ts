import { apiError, apiUser, errorResponse, json } from "@/lib/http";
import { deleteAllPhotos, loadSelfie } from "@/lib/photos/store";

/** The signed-in user's own stored selfie, decrypted on the fly. Never cached. */
export async function GET(request: Request): Promise<Response> {
  const auth = await apiUser(request);
  if (auth.response) return auth.response;
  try {
    const photo = await loadSelfie(auth.user.id);
    if (!photo) return apiError("No stored photo.", 404, "not_found");
    return new Response(new Uint8Array(photo.bytes), {
      headers: {
        "Content-Type": photo.mime,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Cross-Origin-Resource-Policy": "same-origin",
        "Content-Disposition": "inline",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Deletes every stored photo and shreds the user's photo key. */
export async function DELETE(request: Request): Promise<Response> {
  const auth = await apiUser(request, { mutation: true });
  if (auth.response) return auth.response;
  await deleteAllPhotos(auth.user.id);
  return json({ ok: true });
}
