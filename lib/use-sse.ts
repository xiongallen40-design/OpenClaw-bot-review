"use client";

import { useEffect, useRef, useCallback } from "react";

interface SSEEvent {
  type: string;
  data: any;
}

type SSEHandler = (event: SSEEvent) => void;

/**
 * React hook for SSE connection with auto-reconnect
 */
export function useSSE(
  url: string,
  onEvent: SSEHandler,
  enabled: boolean = true
) {
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    if (!enabled) return;

    let es: EventSource | null = null;
    let reconnectTimer: NodeJS.Timeout | null = null;
    let closed = false;

    function connect() {
      if (closed) return;
      es = new EventSource(url);

      // Listen for known event types
      for (const eventType of [
        "connected",
        "agent:status",
        "agent:activity",
        "gateway:health",
        "heartbeat",
      ]) {
        es.addEventListener(eventType, (e: MessageEvent) => {
          try {
            const data = JSON.parse(e.data);
            handlerRef.current({ type: eventType, data });
          } catch {}
        });
      }

      es.onerror = () => {
        es?.close();
        // Reconnect after 5s
        if (!closed) {
          reconnectTimer = setTimeout(connect, 5000);
        }
      };
    }

    connect();

    return () => {
      closed = true;
      es?.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, [url, enabled]);
}
