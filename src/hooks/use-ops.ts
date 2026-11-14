"use client";

/**
 * Voxora AI — lightweight ops data hooks (fetch + refresh + light polling).
 * Views call `useOps<T>("leads", params)`; mutations call `opsPost` then `refresh()`.
 * In production the same shapes are served by Supabase Realtime subscriptions —
 * swap the poller for realtime without touching views.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { ApiResponse } from "@/lib/ops-types";

const OPS_API_BASE = (process.env.NEXT_PUBLIC_OPS_API_BASE_URL || "/api/ops").replace(/\/$/, "");

export function buildOpsUrl(path: string, params?: Record<string, string | undefined>) {
  const url = new URL(`${OPS_API_BASE}/${path.replace(/^\//, "")}`, window.location.origin);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, v);
    }
  }
  return url.toString();
}

export async function opsGet<T>(path: string, params?: Record<string, string | undefined>): Promise<T> {
  const res = await fetch(buildOpsUrl(path, params), { cache: "no-store" });
  const json = (await res.json()) as ApiResponse<T>;
  if (!json.ok) throw new Error(json.error || "ops_error");
  return json.data;
}

export async function opsPost<T>(path: string, body?: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${OPS_API_BASE}/${path.replace(/^\//, "")}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const json = (await res.json()) as ApiResponse<T>;
  if (!json.ok) throw new Error(json.error || "ops_error");
  return json.data;
}

interface UseOpsResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useOps<T>(
  path: string | null,
  params?: Record<string, string | undefined>,
  options?: { pollMs?: number }
): UseOpsResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const paramsKey = JSON.stringify(params ?? {});
  const mounted = useRef(true);

  const load = useCallback(
    async (silent = false) => {
      if (!path) return;
      if (!silent) setLoading(true);
      try {
        const d = await opsGet<T>(path, JSON.parse(paramsKey));
        if (mounted.current) {
          setData(d);
          setError(null);
        }
      } catch (e) {
        if (mounted.current) setError(e instanceof Error ? e.message : "ops_error");
      } finally {
        if (mounted.current) setLoading(false);
      }
    },
    [path, paramsKey]
  );

  useEffect(() => {
    mounted.current = true;
    const timer = window.setTimeout(() => void load(), 0);
    return () => {
      window.clearTimeout(timer);
      mounted.current = false;
    };
  }, [load]);

  useEffect(() => {
    if (!options?.pollMs || !path) return;
    const id = setInterval(() => load(true), options.pollMs);
    return () => clearInterval(id);
  }, [path, options?.pollMs, load]);

  return { data, loading, error, refresh: () => load(true) };
}

/** Shared refresh bus so cross-view mutations can trigger refetches. */
const listeners = new Set<() => void>();
export function notifyOpsChanged() {
  for (const l of listeners) l();
}
export function onOpsChanged(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
