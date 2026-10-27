import { after } from "next/server";
import { apiUser, errorResponse } from "@/lib/http";
import { forgetRemoteTask, takeRender } from "@/lib/youcam/service";

/**
 * Streams a finished YouCam render to its owner exactly once (the URL never reaches the browser),
 * then deletes the task and its images from YouCam. Mock renders return 204 so the client
 * falls back to its on-device preview.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/youcam/renders/[taskId]">): Promise<Response> {
  const auth = await apiUser(request);
  if (auth.response) return auth.response;
  const { taskId } = await ctx.params;
  try {
    const render = await takeRender(auth.user.id, taskId);
    if (!render) return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
    after(() => forgetRemoteTask(taskId));
    return new Response(render.bytes, {
      headers: {
        "Content-Type": render.contentType,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Cross-Origin-Resource-Policy": "same-origin",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
