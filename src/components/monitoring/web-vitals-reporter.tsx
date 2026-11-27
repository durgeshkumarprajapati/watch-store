"use client";

import { useReportWebVitals } from "next/web-vitals";

export function WebVitalsReporter() {
  useReportWebVitals((metric) => {
    try {
      if (process.env.NODE_ENV === "test") return;
      const payload = {
        event: "web_vital",
        name: metric.name,
        value: Math.round(metric.name === "CLS" ? metric.value * 1000 : metric.value),
        rating: metric.rating,
        path: typeof window !== "undefined" ? window.location.pathname : "/",
      };
      if (process.env.NODE_ENV === "development") {
        console.debug(JSON.stringify(payload));
      }
    } catch {
      // Non-blocking telemetry
    }
  });

  return null;
}
