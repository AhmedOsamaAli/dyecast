"use client";

import { useEffect, useState } from "react";
import { OWNER_META, tidyLocal } from "@/lib/client/local-store";

/**
 * Tells this browser which account is signed in ("" for nobody). Photos saved here by any other account, or more
 * than 30 days ago, are removed; with nobody signed in, all of them are.
 */
export function DeviceOwner({ owner }: { owner: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("dyecast-account");
    if (channel) {
      channel.onmessage = (event: MessageEvent<unknown>) => {
        if (typeof event.data === "string" && event.data !== owner) window.location.reload();
      };
      channel.postMessage(owner);
    }
    void tidyLocal(owner).catch(() => {
      console.error("Device photo cleanup failed.");
      setFailed(true);
    });
    return () => channel?.close();
  }, [owner]);
  return (
    <>
      <meta name={OWNER_META} content={owner} />
      {failed && <p role="alert" className="notice danger small">Saved photos could not be cleared. Clear this site&apos;s browser data before sharing this device.</p>}
    </>
  );
}
