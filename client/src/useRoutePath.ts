// src/useRoutePath.ts
import { useState, useEffect } from "react";
import { AppNode } from "./types"; // 1단계에서 만든 타입 임포트

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5001/api";

export function useRoutePath(
  startNode: AppNode | null,
  destNode: AppNode | null,
  viaNodes: AppNode[], // 현재 모드별 요청에는 사용하지 않지만 인터페이스 유지
  enabled: boolean = true
) {
  const [routeModes, setRouteModes] = useState<any | null>(null);
  const [defaultMode, setDefaultMode] = useState<"walk" | "bike" | "ebike" | null>(null);

  // enabled && start/dest 있을 때 모드별 경로 요청
  useEffect(() => {
    if (!enabled || !startNode || !destNode) {
      setRouteModes(null);
      setDefaultMode(null);
      return;
    }

    const fetchModes = async () => {
      try {
        console.log("[find-path-modes] request ->", {
          start_id: startNode.id,
          goal_id: destNode.id,
        });
        const res = await fetch(`${API_URL}/find-path-modes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ start_id: startNode.id, goal_id: destNode.id })
        });
        console.log("[find-path-modes] response status", res.status);
        if (!res.ok) throw new Error("Server error");
        const json = await res.json();
        console.log("[find-path-modes] response body", json);
        setRouteModes(json);
        const def = (["walk", "bike", "ebike"] as const).find((m) => json?.[m]?.success) || null;
        setDefaultMode(def);
      } catch (e) {
        console.error(e);
        setRouteModes(null);
        setDefaultMode(null);
      }
    };

    fetchModes();
  }, [enabled, startNode, destNode]);

  return { routeModes, defaultMode };
}