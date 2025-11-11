import React, { useEffect, useState, useRef, useMemo, useCallback } from "react";
// react-leaflet 임포트 수정
import {
  MapContainer,
  TileLayer,
  useMap,
  Popup,
  useMapEvents,
  Polyline,
} from "react-leaflet";
import { Map as LeafletMap, LatLngExpression } from "leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

import LCanvasLayer from "./L.CanvasLayer";

import "./App.css";

const API_URL = "http://localhost:5001/api";

const Maptiler_Key = "DFFxHHmQRoAl3CPIlnBb";

const mapTilerStyles: Record<string, string> = {
  black: `http://223.194.46.216:8665/api/maps/positron/{z}/{x}/{y}.png`,
  osm: `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`,
  basic: `https://api.maptiler.com/maps/basic/{z}/{x}/{y}.png?key=${Maptiler_Key}`,
  streets: `https://api.maptiler.com/maps/streets/{z}/{x}/{y}.png?key=${Maptiler_Key}`,
  satellite: `https://api.maptiler.com/maps/hybrid/{z}/{x}/{y}.jpg?key=${Maptiler_Key}`,
};

// 노드 타입 정의 (전역 Node와 충돌 방지)
interface AppNode {
  lat: number;
  lon: number;
  id: number;
  type: string;
}

// MapViewUpdater 컴포넌트
interface MapViewUpdaterProps {
  center: LatLngExpression;
  zoom: number;
}

function MapViewUpdater({ center, zoom }: MapViewUpdaterProps) {
  const map = useMap();
  useEffect(() => {
    if (center) {
      map.setView(center, zoom);
    }
  }, [center, zoom, map]);
  return null;
}

// API 응답 타입 정의
interface NodesResponse {
  nodes: {
    id: number;
    lat: number;
    lon: number;
    type: string;
  }[];
  count: number;
}

// 맵 상호작용(클릭)을 처리하는 컴포넌트
interface MapInteractionHandlerProps {
  allNodes: AppNode[];
  setPinnedNode: (node: AppNode | null) => void;
}

function MapInteractionHandler({
  allNodes,
  setPinnedNode,
}: MapInteractionHandlerProps) {
  const map = useMap();
  
  // 클릭 감지 범위 (픽셀)
  const CLICK_THRESHOLD_PX = 20; 

  // 가장 가까운 노드를 찾는 헬퍼 함수
  const findClosestNode = (latlng: L.LatLng): AppNode | null => {
    let closestNode: AppNode | null = null;
    let minPixelDistance = Infinity;
    const point = map.latLngToContainerPoint(latlng);

    allNodes.forEach((node) => {
      const nodePoint = map.latLngToContainerPoint([node.lat, node.lon]);
      const distance = point.distanceTo(nodePoint);

      if (distance < minPixelDistance) {
        minPixelDistance = distance;
        closestNode = node;
      }
    });

    if (closestNode && minPixelDistance < CLICK_THRESHOLD_PX) {
      return closestNode;
    }
    return null;
  };

  useMapEvents({
    click(e) {
      console.log("Map clicked"); // 1. 맵 클릭 감지
      const node = findClosestNode(e.latlng);
      
      if (node) {
        // 👈 [TypeScript 오류 수정]
        // node의 타입을 잃지 않도록 새로운 상수에 할당합니다.
        const nodeToPin: AppNode = node;
 
        console.log("Node found:", nodeToPin.id); // 2. 노드 찾음
        L.DomEvent.stopPropagation(e.originalEvent); 
        
        setTimeout(() => {
          // 👈 [TypeScript 오류 수정]
          // 새로 할당한 상수를 사용합니다.
          console.log("Setting pinned node:", nodeToPin.id); // 4. (지연 후) 팝업 띄우기
          setPinnedNode(nodeToPin); // 클릭한 노드를 '고정'
        }, 0);
 
      } else {
        console.log("Empty space clicked — popup remains until closed via X"); // 빈 공간 클릭해도 닫지 않음
      }
    },
  });

  return null;
}

// Map 인스턴스를 부모로 전달하는 헬퍼 컴포넌트
// props를 직접 변경하지 않도록 'setRoadRef' 콜백을 사용합니다.
function MapRefSetter({ setRoadRef }: { setRoadRef: (m: LeafletMap | null) => void }) {
  const map = useMap();
  useEffect(() => {
    setRoadRef(map);
    return () => setRoadRef(null);
  }, [map, setRoadRef]);
  return null;
}

function App() {
  // API 상태
  const [isConnected, setIsConnected] = useState<boolean>(false);

  // Road Map
  const [useCanvasLayer, setUseCanvasLayer] = useState<boolean>(false);
  const roadRef = useRef<LeafletMap | null>(null);
  // roadRef를 직접 변경하는 대신 콜백으로 전달 (ESLint 규칙 회피)
  const setRoadRef = useCallback((m: LeafletMap | null) => {
    roadRef.current = m;
  }, []);
  const canvasLayerRef = useRef<any>(null);
  const [mapStyle, setMapStyle] = useState<string>("black");
  const [mapCenter] = useState<LatLngExpression>([37.65146111, 127.0583889]);
  const [mapZoom] = useState<number>(15);

  // Node
  const [seoulNode, setSeoulNode] = useState<AppNode[]>([]);
  const [bicycleNode, setBicycleNode] = useState<AppNode[]>([]);

  // 클릭으로 고정(pin)된 상태
  const [pinnedNode, setPinnedNode] = useState<AppNode | null>(null);

  // 출발지, 도착지 상태
  const [startNode, setStartNode] = useState<AppNode | null>(null);
  const [destNode, setDestNode] = useState<AppNode | null>(null);
  // 경로 좌표 상태 (폴리라인 그리기용)
  const [routeCoords, setRouteCoords] = useState<LatLngExpression[] | null>(null);

  // API로 노드 데이터 가져오기
  useEffect(() => {
    const fetchNodes = async () => {
      try {
        const response = await fetch(`${API_URL}/nodes`);
        const data: NodesResponse = await response.json();

        console.log("Nodes received:", data);

        if (data.nodes && data.nodes.length > 0) {
          // type에 따라 노드 분류
          const trafficNodes: AppNode[] = data.nodes
            .filter((node) => node.type === "traffic")
            .map((node) => ({
              lat: node.lat,
              lon: node.lon,
              id: Number(node.id),
              type: node.type,
            }));

          const bicycleNodes: AppNode[] = data.nodes
            .filter((node) => node.type === "bicycle_station")
            .map((node) => ({
              lat: node.lat,
              lon: node.lon,
              id: Number(node.id),
              type: node.type,
            }));

          setSeoulNode(trafficNodes);
          setBicycleNode(bicycleNodes);
          setIsConnected(true);

          console.log(
            `Traffic nodes: ${trafficNodes.length}, Bicycle nodes: ${bicycleNodes.length}`
          );
        }
      } catch (error) {
        console.error("Failed to fetch nodes:", error);
        setIsConnected(false);
      }
    };

    fetchNodes();
  }, []);

  // 성능을 위해 전체 노드 목록을 useMemo로 관리
  const allNodes = useMemo<AppNode[]>(
    () => [...seoulNode, ...bicycleNode],
    [seoulNode, bicycleNode]
  );

  // startNode 기준으로 가장 가까운 bicycle_station 찾기
  const findNearestBicycle = useCallback((start: AppNode | null): AppNode | null => {
    if (!start || !bicycleNode || bicycleNode.length === 0) return null;
    let best: AppNode | null = null;
    let bestDist = Infinity;
    const startLatLng = L.latLng(start.lat, start.lon);
    for (const b of bicycleNode) {
      const d = startLatLng.distanceTo(L.latLng(b.lat, b.lon));
      if (d < bestDist) {
        bestDist = d;
        best = b;
      }
    }
    return best;
  }, [bicycleNode]);

// startNode와 destNode가 결정되면 경로(왕복이 아닌 경유 포함)를 계산하여 폴리라인 좌표로 설정
  useEffect(() => {
     // start 또는 dest가 없으면 경로 제거
     if (!startNode || !destNode) {
       setRouteCoords(null);
       return;
     }
 
     let cancelled = false;
 
     // API 호출 헬퍼 함수
     const fetchPathSegment = async (sId: number, gId: number) => {
       try {
         const res = await fetch(`${API_URL}/find-path`, {
           method: "POST",
           headers: { "Content-Type": "application/json" },
           body: JSON.stringify({ start_id: sId, goal_id: gId }),
         });
         const json = await res.json();
         // console.log(`find-path (${sId} -> ${gId}):`, json); // 디버깅용
         
         const coordsOut: LatLngExpression[] = [];
         const coords = json.coordinates ?? json.path ?? json.coords ?? null;

         if (Array.isArray(coords)) {
           if (coords.length > 0) {
             if (Array.isArray(coords[0])) {
               // [[a,b], [a,b], ...] 형태
               coords.forEach((c: any) => {
                 const a = Number(c[0]);
                 const b = Number(c[1]);
                 
                 // ▼▼▼ [오류 수정] ▼▼▼
                 // [a, b]가 number[]가 아닌 [number, number] 튜플임을 명시
                 if (a >= -90 && a <= 90 && b >= -180 && b <= 180) coordsOut.push([a, b] as [number, number]);
                 else if (b >= -90 && b <= 90 && a >= -180 && a <= 180) coordsOut.push([b, a] as [number, number]);
                 // ▲▲▲ [오류 수정] ▲▲▲
               });
             } else if (typeof coords[0] === "object" && coords[0] !== null) {
               // [{lat:.., lon:..}, {lat:.., lon:..}]
               coords.forEach((c: any) => {
                 const lat = Number(c.lat ?? c.latitude ?? c[0]);
                 const lon = Number(c.lon ?? c.lng ?? c.longitude ?? c[1]);

                 // ▼▼▼ [오류 수정] ▼▼▼
                 // [lat, lon]이 number[]가 아닌 [number, number] 튜플임을 명시
                 if (!Number.isNaN(lat) && !Number.isNaN(lon)) coordsOut.push([lat, lon] as [number, number]);
                 // ▲▲▲ [오류 수정] ▲▲▲
               });
             }
           }
         }

        if (coordsOut.length > 0) return coordsOut;
        console.warn(`find-path (${sId} -> ${gId}) returned no coordinates:`, json);
        return null;
      } catch (e) {
        console.error(`find-path (${sId} -> ${gId}) error:`, e);
        return null;
      }
    };

    // ------------------------------------------------------------------
    // ▼ [수정된 핵심 로직] (여기는 변경 없음) ▼
    // ------------------------------------------------------------------
    (async () => {
      // 1. 출발지/도착지에서 가장 가까운 자전거 정류소 탐색
      const nearestBike_S = findNearestBicycle(startNode); // 출발지 -> 출발 정류소
      const nearestBike_D = findNearestBicycle(destNode);  // 도착지 -> 도착 정류소

      // 2. Walk-Bike-Walk 경로가 불가능한 경우 (자전거 정류소가 없음)
      if (!nearestBike_S || !nearestBike_D) {
        console.warn("Could not find bike stations for full walk-bike-walk path. Falling back to direct path.");
        const segDirect = await fetchPathSegment(startNode.id, destNode.id);
        
        if (!cancelled) {
          if (segDirect && segDirect.length > 0) {
            setRouteCoords(segDirect); // 백엔드가 준 직접 경로
          } else {
            setRouteCoords([[startNode.lat, startNode.lon], [destNode.lat, destNode.lon]]);
          }
        }
        return;
      }

      // 3. 3개 세그먼트(도보, 자전거, 도보)의 ID 정의
      const seg1_S = startNode.id;       // A: 출발지
      const seg1_G = nearestBike_S.id; // B: 출발 정류소
      
      const seg2_S = nearestBike_S.id; // B: 출발 정류소
      const seg2_G = nearestBike_D.id; // C: 도착 정류소

      const seg3_S = nearestBike_D.id; // C: 도착 정류소
      const seg3_G = destNode.id;      // D: 도착지

      // 4. 3개 세그먼트 병렬로 API 호출
      const [seg1, seg2, seg3] = await Promise.all([
        // Seg 1 (Walk): A -> B
        (seg1_S === seg1_G)
          ? Promise.resolve([[startNode.lat, startNode.lon] as [number, number]]) // 여기도 타입 명시
          : fetchPathSegment(seg1_S, seg1_G),
        
        // Seg 2 (Bike): B -> C
        (seg2_S === seg2_G)
          ? Promise.resolve([[nearestBike_S.lat, nearestBike_S.lon] as [number, number]]) // 여기도 타입 명시
          : fetchPathSegment(seg2_S, seg2_G),

        // Seg 3 (Walk): C -> D
        (seg3_S === seg3_G)
          ? Promise.resolve([[destNode.lat, destNode.lon] as [number, number]]) // 여기도 타입 명시
          : fetchPathSegment(seg3_S, seg3_G)
      ]);

      if (cancelled) return;

      // 5. 결과 조합
      const validSeg1 = seg1 && seg1.length > 0 ? seg1 : null;
      const validSeg2 = seg2 && seg2.length > 0 ? seg2 : null;
      const validSeg3 = seg3 && seg3.length > 0 ? seg3 : null;

      // 6. 3개 경로가 모두 유효할 때만 조합
      if (validSeg1 && validSeg2 && validSeg3) {
        
        // 중복되는 연결점 좌표 제거 헬퍼
        const filterDuplicates = (segment: LatLngExpression[], prevSegment: LatLngExpression[] | null) => {
            if (!prevSegment || prevSegment.length === 0) return segment;
            const lastOfPrev = prevSegment[prevSegment.length - 1] as [number, number];
            const firstOfNew = segment[0] as [number, number];
            
            if (Number(firstOfNew[0]) === Number(lastOfPrev[0]) && Number(firstOfNew[1]) === Number(lastOfPrev[1])) {
                return segment.slice(1); // 첫 번째 점(중복)을 제외하고 반환
            }
            return segment;
        };
        
        const combined: LatLngExpression[] = [
          ...validSeg1,
          ...filterDuplicates(validSeg2, validSeg1),
          ...filterDuplicates(validSeg3, validSeg2),
        ];
        setRouteCoords(combined);

      } else {
        // [직선 경로 원인] 3개 세그먼트 중 하나라도 API가 경로를 안 주면 직선
        console.warn("One or more path segments failed to load. Falling back to straight line.");
        setRouteCoords([[startNode.lat, startNode.lon], [destNode.lat, destNode.lon]]);
      }
    })();
    // ------------------------------------------------------------------
    // ▲ [수정된 핵심 로직 끝] ▲
    // ------------------------------------------------------------------
 
     return () => {
       cancelled = true;
     };
   }, [startNode, destNode, bicycleNode, findNearestBicycle]); // findNearestBicycle도 의존성에 추가

  // Canvas Layer 렌더링을 위한 별도 useEffect
  useEffect(() => {
    if (!roadRef.current) return;

    if (useCanvasLayer) {
      if (canvasLayerRef.current) {
        roadRef.current.removeLayer(canvasLayerRef.current);
      }
      canvasLayerRef.current = LCanvasLayer();
      canvasLayerRef.current.delegate({
        onDrawLayer: ({ canvas, bounds, size, zoom, center, corner }: any) => {
          const ctx = canvas.getContext("2d");
          if (!ctx) return;

          ctx.clearRect(0, 0, canvas.width, canvas.height);

          // 줌 레벨 15를 기준으로, 15보다 크면(확대) 크기를 고정하고, 15보다 작으면(축소) 크기를 줄입니다.
          const scale = Math.min(1, zoom / 15); // 줌 15 이상에선 scale이 1이 됨
          const trafficRadius = Math.max(1, 3 * scale); // 기본 3
          const bicycleRadius = Math.max(1.5, 4 * scale); // 기본 4

          // Seoul Traffic Nodes 렌더링 (파란색)
          if (seoulNode && seoulNode.length > 0) {
            seoulNode.forEach((node) => {
              const latLng = L.latLng(node.lat, node.lon);
              const point = roadRef.current!.latLngToContainerPoint(latLng);
              ctx.beginPath();
              
              if (startNode?.id === node.id) {
                ctx.fillStyle = "yellow"; // 출발지: 노란색
              } else if (destNode?.id === node.id) {
                ctx.fillStyle = "green"; // 도착지: 초록색
              } else {
                ctx.fillStyle = "blue"; // 기본 교통 노드: 파란색
              }
 
              ctx.arc(point.x, point.y, trafficRadius, 0, Math.PI * 2, true);
              ctx.fill();
            });
          }
 
          // Bicycle Station Nodes 렌더링 (빨간색)
          if (bicycleNode && bicycleNode.length > 0) {
            bicycleNode.forEach((node) => {
              const latLng = L.latLng(node.lat, node.lon);
              const point = roadRef.current!.latLngToContainerPoint(latLng);
              ctx.beginPath();
              
              if (startNode?.id === node.id) {
                ctx.fillStyle = "yellow"; // 출발지(자전거역인 경우)
              } else if (destNode?.id === node.id) {
                ctx.fillStyle = "green"; // 도착지(자전거역인 경우)
              } else {
                ctx.fillStyle = "red"; // 자전거 대여소: 빨강
              }
 
              ctx.arc(point.x, point.y, bicycleRadius, 0, Math.PI * 2, true); 
              ctx.fill();
            });
          }
        },
      });
      roadRef.current.addLayer(canvasLayerRef.current);
      canvasLayerRef.current.needRedraw();
    } else {
      if (canvasLayerRef.current) {
        roadRef.current.removeLayer(canvasLayerRef.current);
        canvasLayerRef.current = null;
      }
    }
  }, [useCanvasLayer, seoulNode, bicycleNode, startNode, destNode]);

  const handleStyleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMapStyle(e.target.value);
  };

  // 팝업에 표시할 노드를 결정 (pinnedNode만 사용)
  const displayNode = pinnedNode;
  
  return (
    <div className="container">
      {!isConnected ? (
        <div>
          <h1 className="error-message">Not connected to server</h1>
        </div>
      ) : (
        <div className="map-container">
          <MapContainer
            center={mapCenter}
            zoom={mapZoom}
            style={{ width: "100%", height: "100%" }}
            zoomControl={false}
            attributionControl={false}
            // 맵 빈 공간 클릭으로 팝업이 닫히지 않게 함
            closePopupOnClick={false}
          >
            {/* Map 인스턴스를 roadRef에 저장 (콜백으로 전달) */}
            <MapRefSetter setRoadRef={setRoadRef} />
            <MapViewUpdater center={mapCenter} zoom={mapZoom} />
            <TileLayer url={mapTilerStyles[mapStyle]} />

            {/* 맵 상호작용 핸들러 컴포넌트 */}
            <MapInteractionHandler
              allNodes={allNodes}
              setPinnedNode={setPinnedNode}
            />

            {/* 경로 폴리라인: 파란색, 도로와 유사한 굵기 */}
            {routeCoords && routeCoords.length > 0 && (
              <Polyline
                positions={routeCoords}
                pathOptions={{ color: "blue", weight: 6, opacity: 0.95 }}
              />
            )}
 
             {/* 팝업 렌더링 로직 */}
             {displayNode && (
               <Popup
                key={displayNode.id}
                position={[displayNode.lat, displayNode.lon]}
                // 맵 클릭으로 닫히지 않음(안전 처리)
                closeOnClick={false}
                // 기본 닫기 버튼 비활성화하고 직접 닫기 버튼을 만듭니다.
                closeButton={false}
              >
                <div className="popup-content">
                  {/* 우측 상단 X (직접 닫기) */}
                  <button
                    className="popup-close-x"
                    onClick={() => setPinnedNode(null)}
                    aria-label="Close"
                    style={{ float: "right" }}
                  >
                    X
                  </button>

                  <div>ID: {displayNode.id}</div>
                  <div>Type: {displayNode.type}</div>
                  <button
                    className="popup-button"
                    onClick={() => {
                      setStartNode(displayNode);
                      setPinnedNode(null); // 선택 후 팝업 닫기
                    }}
                  >
                    출발
                  </button>
                  <button
                    className="popup-button"
                    onClick={() => {
                      setDestNode(displayNode);
                      setPinnedNode(null); // 선택 후 팝업 닫기
                    }}
                  >
                    도착
                  </button>
                </div>
              </Popup>
            )}
          </MapContainer>

          <div className="road-network">
            <h3>Road Network</h3>
            <label>
              <input
                type="radio"
                name="seoulNode"
                checked={useCanvasLayer}
                onChange={() => setUseCanvasLayer(!useCanvasLayer)}
              />
              On
            </label>
            <label>
              <input
                type="radio"
                name="seoulNode"
                checked={!useCanvasLayer}
                onChange={() => setUseCanvasLayer(!useCanvasLayer)}
              />
              Off
            </label>
          </div>
          <div className="map-style">
            <h3>Map Style</h3>
            <label>
              <input
                type="radio"
                name="mapStyle"
                value="black"
                checked={mapStyle === "black"}
                onChange={handleStyleChange}
              />
              Black
            </label>
            <label>
              <input
                type="radio"
                name="mapStyle"
                value="osm"
                checked={mapStyle === "osm"}
                onChange={handleStyleChange}
              />
              Osm
            </label>
            <label>
              <input
                type="radio"
                name="mapStyle"
                value="basic"
                checked={mapStyle === "basic"}
                onChange={handleStyleChange}
              />
              Basic
            </label>
            <label>
              <input
                type="radio"
                name="mapStyle"
                value="streets"
                checked={mapStyle === "streets"}
                onChange={handleStyleChange}
              />
              Streets
            </label>
            <label>
              <input
                type="radio"
                name="mapStyle"
                value="satellite"
                checked={mapStyle === "satellite"}
                onChange={handleStyleChange}
              />
              Satellite
            </label>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;