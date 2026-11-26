"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/icon";
import {
  PWA_INSTALL_DISMISS_COOLDOWN_MS,
  PWA_INSTALL_DISMISS_STORAGE_KEY,
  isIosSafariUserAgent,
} from "@/lib/pwa-config";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

declare global {
  interface Window {
    __wsInstallPrompt?: BeforeInstallPromptEvent | null;
  }
}

function isStandaloneMode(): boolean {
  if (typeof window === "undefined") return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true
  );
}

function isDismissedRecently(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(PWA_INSTALL_DISMISS_STORAGE_KEY);
    if (!raw) return false;
    const ts = Number(raw);
    if (!Number.isFinite(ts)) return false;
    return Date.now() - ts < PWA_INSTALL_DISMISS_COOLDOWN_MS;
  } catch {
    return false;
  }
}

export function CustomerPwaManager() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosGuide, setShowIosGuide] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        // Service worker registration is progressive; ignore errors in unsupported contexts
      });
    }

    if (isStandaloneMode() || isDismissedRecently()) {
      return;
    }

    let timer: number | undefined;
    if (window.__wsInstallPrompt) {
      const earlyPrompt = window.__wsInstallPrompt;
      timer = window.setTimeout(() => setDeferredPrompt(earlyPrompt), 0);
    } else if (isIosSafariUserAgent(window.navigator.userAgent)) {
      timer = window.setTimeout(() => setShowIosGuide(true), 0);
    }

    function onBeforeInstallPrompt(e: Event) {
      e.preventDefault();
      window.__wsInstallPrompt = e as BeforeInstallPromptEvent;
      if (isStandaloneMode() || isDismissedRecently()) return;
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    }

    function onAppInstalled() {
      window.__wsInstallPrompt = null;
      setDeferredPrompt(null);
      setShowIosGuide(false);
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);

    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  function handleDismiss() {
    setDismissed(true);
    setDeferredPrompt(null);
    setShowIosGuide(false);
    try {
      window.localStorage.setItem(PWA_INSTALL_DISMISS_STORAGE_KEY, String(Date.now()));
    } catch {
      // Ignore storage quota / privacy mode errors
    }
  }

  async function handleInstallClick() {
    if (!deferredPrompt) return;
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      window.__wsInstallPrompt = null;
      if (choice.outcome === "dismissed") {
        handleDismiss();
        return;
      }
      setDeferredPrompt(null);
    } catch {
      window.__wsInstallPrompt = null;
      setDeferredPrompt(null);
    }
  }

  if (dismissed || (!deferredPrompt && !showIosGuide)) {
    return null;
  }

  return (
    <aside
      aria-label="Install WatchStore App"
      className="fixed bottom-4 right-4 left-4 sm:left-auto sm:max-w-sm z-40 pb-[env(safe-area-inset-bottom)]"
    >
      <div className="bg-surface border border-outline rounded-md shadow-xl p-4 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded bg-secondary text-on-secondary flex items-center justify-center shrink-0">
              <Icon name="schedule" size={20} className="text-primary" />
            </div>
            <div>
              <p className="font-title text-title-sm text-on-surface">Install WatchStore</p>
              <p className="font-body text-body-sm text-on-surface-variant">
                Add WatchStore to your home screen for quick app-like access.
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Dismiss install prompt"
            onClick={handleDismiss}
            className="w-7 h-7 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container transition-colors"
          >
            <Icon name="close" size={16} />
          </button>
        </div>

        {deferredPrompt ? (
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={handleDismiss}
              className="px-3 py-1.5 rounded border border-outline font-label text-label-sm uppercase tracking-wider text-on-surface hover:border-primary transition-colors"
            >
              Not Now
            </button>
            <button
              type="button"
              onClick={() => void handleInstallClick()}
              className="px-4 py-1.5 rounded bg-primary text-on-primary font-label text-label-sm uppercase tracking-wider hover:opacity-90 transition-opacity"
            >
              Install App
            </button>
          </div>
        ) : showIosGuide ? (
          <ol className="text-body-sm text-on-surface-variant space-y-1 pl-4 list-decimal">
            <li>Open WatchStore in Safari.</li>
            <li>Tap the Share button.</li>
            <li>Select Add to Home Screen.</li>
            <li>Confirm Add.</li>
          </ol>
        ) : null}
      </div>
    </aside>
  );
}
