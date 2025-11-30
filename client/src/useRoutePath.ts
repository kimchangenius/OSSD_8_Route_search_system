// src/useRoutePath.ts
import { useState, useEffect } from "react";
import { LatLngExpression } from "leaflet";
import { AppNode } from "./types"; // 1단계에서 만든 타입 임포트

const API_URL = "http://localhost:5001/api";

export function useRoutePath(
  startNode: AppNode | null,
  destNode: AppNode | null,
  viaNodes: AppNode[]
) {
  const [routeCoords, setRouteCoords] = useState<LatLngExpression[]>([]);

  // 1. 경로의 한 구간(Start -> End)을 가져오는 함수
  const fetchPathSegment = async (sId: number, gId: number) => {
    try {
      const res = await fetch(`${API_URL}/find-path`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start_id: sId, goal_id: gId }),
      });
      if (!res.ok) throw new Error("Server error");
      const json = await res.json();
      const coords = json.coordinates ?? json.path ?? json.coords ?? null;
      const coordsOut: LatLngExpression[] = [];
      
      if (Array.isArray(coords) && coords.length > 0) {
        coords.forEach((c: any) => {
          let lat, lon;
          if (Array.isArray(c)) {
            lat = Number(c[1]);
            lon = Number(c[0]);
          } else {
            lat = Number(c.lat ?? c.latitude ?? c[0]);
            lon = Number(c.lon ?? c.lng ?? c.longitude ?? c[1]);
          }
          if (!Number.isNaN(lat) && !Number.isNaN(lon)) {
            // Leaflet은 [lat, lon] 순서이나 GeoJSON은 [lon, lat]일 수 있어 확인 필요
            // 기존 로직 그대로 유지: lat > 90이면 뒤집기
            if (lat > 90) coordsOut.push([lon, lat] as [number, number]);
            else coordsOut.push([lat, lon] as [number, number]);
          }
        });
        return coordsOut.length > 0 ? coordsOut : null;
      }
      return null;
    } catch (e) {
      console.error(e);
      return null;
    }
  };

  // 2. start, dest, via가 변경될 때마다 전체 경로 계산
  useEffect(() => {
    if (!startNode || !destNode) {
      setRouteCoords([]);
      return;
    }

    (async () => {
      const points = [startNode, ...viaNodes, destNode];
      let totalPath: LatLngExpression[] = [];

      for (let i = 0; i < points.length - 1; i++) {
        const start = points[i];
        const end = points[i + 1];
        const segment = await fetchPathSegment(start.id, end.id);
        
        // 경로를 못 찾으면 직선으로라도 연결 (기존 로직 유지)
        const validSegment = segment || [
          [start.lat, start.lon],
          [end.lat, end.lon],
        ] as LatLngExpression[];
        
        totalPath = [...totalPath, ...validSegment];
      }
      setRouteCoords(totalPath);
    })();
  }, [startNode, destNode, viaNodes]);

  return routeCoords;
}