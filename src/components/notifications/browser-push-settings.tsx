"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

interface PushStatusResponse {
  configured: boolean;
  activeCount: number;
}

export function BrowserPushSettings({ enableAdminTest = false }: { enableAdminTest?: boolean }) {
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [configured, setConfigured] = useState<boolean>(true);
  const [activeCount, setActiveCount] = useState<number>(0);
  const [currentSubscribed, setCurrentSubscribed] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [busy, setBusy] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const refreshStatus = useCallback(async () => {
    try {
      const isSupported =
        typeof window !== "undefined" &&
        "serviceWorker" in navigator &&
        "PushManager" in window &&
        "Notification" in window;

      const res = await fetch("/api/notifications/push/status", { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as PushStatusResponse;
        setConfigured(Boolean(data.configured));
        setActiveCount(Number(data.activeCount ?? 0));
      }

      setSupported(isSupported);
      if (isSupported) {
        setPermission(Notification.permission);
        const reg = await navigator.serviceWorker.getRegistration("/sw.js");
        const sub = reg ? await reg.pushManager.getSubscription() : null;
        setCurrentSubscribed(Boolean(sub));
      }
    } catch {
      // Keep UI responsive even if status fetch fails transiently.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    async function loadInitialStatus() {
      try {
        const isSupported =
          typeof window !== "undefined" &&
          "serviceWorker" in navigator &&
          "PushManager" in window &&
          "Notification" in window;

        const res = await fetch("/api/notifications/push/status", { cache: "no-store" });
        if (!active) return;
        if (res.ok) {
          const data = (await res.json()) as PushStatusResponse;
          setConfigured(Boolean(data.configured));
          setActiveCount(Number(data.activeCount ?? 0));
        }

        setSupported(isSupported);
        if (isSupported) {
          setPermission(Notification.permission);
          const reg = await navigator.serviceWorker.getRegistration("/sw.js");
          const sub = reg ? await reg.pushManager.getSubscription() : null;
          if (active) setCurrentSubscribed(Boolean(sub));
        }
      } catch {
        // Keep UI responsive even if status fetch fails transiently.
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadInitialStatus();
    return () => {
      active = false;
    };
  }, []);

  async function handleEnablePush() {
    setBusy(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") {
        setErrorMessage(
          perm === "denied"
            ? "Browser notifications are blocked. Please enable notifications for this site in your browser settings."
            : "Notification permission was dismissed.",
        );
        return;
      }

      const keyRes = await fetch("/api/push/vapid-public-key", { cache: "no-store" });
      if (!keyRes.ok) {
        setErrorMessage("Web Push is not configured on the server yet.");
        return;
      }
      const { publicKey } = (await keyRes.json()) as { publicKey: string };

      const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;

      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
      }

      const json = subscription.toJSON();
      const subscribeRes = await fetch("/api/notifications/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: subscription.endpoint,
          keys: {
            p256dh: json.keys?.p256dh ?? "",
            auth: json.keys?.auth ?? "",
          },
        }),
      });

      if (!subscribeRes.ok) {
        const errBody = (await subscribeRes.json().catch(() => ({}))) as { error?: string };
        setErrorMessage(errBody.error ?? "Failed to save browser push subscription.");
        return;
      }

      setStatusMessage("Browser push notifications enabled on this device.");
      await refreshStatus();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to enable browser push.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDisablePush() {
    setBusy(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe();
        await fetch("/api/notifications/push/unsubscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint }),
        });
      }
      setStatusMessage("Browser push notifications disabled on this device.");
      await refreshStatus();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to disable browser push.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSendTestPush() {
    setBusy(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const res = await fetch("/api/admin/push-subscriptions/test", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        sent?: number;
        total?: number;
      };
      if (!res.ok) {
        setErrorMessage(data.error ?? "Failed to send test push notification.");
        return;
      }
      setStatusMessage(`Test push sent to ${data.sent ?? 0} of ${data.total ?? 0} active device(s).`);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to send test push.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-5 rounded-md bg-surface-container/40 border border-outline flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-title text-title-md text-on-surface">Browser Push Notifications</h3>
          <p className="font-body text-body-sm text-on-surface-variant mt-0.5">
            Receive instant real-time alerts in this browser even when the tab is in the background.
          </p>
        </div>
        <span className="font-mono text-label-sm text-on-surface-variant">
          {loading ? "Checking…" : `${activeCount} active device${activeCount === 1 ? "" : "s"}`}
        </span>
      </div>

      {!loading && !supported ? (
        <p className="text-body-sm text-on-surface-variant">
          Browser Push is not supported in this browser environment.
        </p>
      ) : !loading && !configured ? (
        <p className="text-body-sm text-on-surface-variant">
          Web Push is currently unconfigured on the server.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          {!currentSubscribed ? (
            <Button
              type="button"
              onClick={handleEnablePush}
              disabled={busy || loading || permission === "denied"}
            >
              {busy ? "Enabling…" : "Enable Browser Push"}
            </Button>
          ) : (
            <Button type="button" variant="secondary" onClick={handleDisablePush} disabled={busy}>
              {busy ? "Disabling…" : "Disable on This Device"}
            </Button>
          )}

          {enableAdminTest ? (
            <Button
              type="button"
              variant="secondary"
              onClick={handleSendTestPush}
              disabled={busy || loading || activeCount === 0}
            >
              Send Test Push
            </Button>
          ) : null}

          {permission === "denied" ? (
            <span className="text-body-sm text-error">
              Permission blocked in browser settings.
            </span>
          ) : null}
        </div>
      )}

      {statusMessage ? <p className="text-body-sm text-primary">{statusMessage}</p> : null}
      {errorMessage ? <p className="text-body-sm text-error">{errorMessage}</p> : null}
    </div>
  );
}
