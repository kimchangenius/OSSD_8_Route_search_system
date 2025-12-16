import React, { useEffect, useState, useRef, useMemo, useCallback } from "react";
import {
  MapContainer,
  TileLayer,
  useMap,
  Popup,
  useMapEvents,
  Polyline,
  ScaleControl, // [신규] 축척 바 컴포넌트 추가
} from "react-leaflet";
import { Map as LeafletMap, LatLngExpression, LatLngBoundsExpression } from "leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

import LCanvasLayer from "./L.CanvasLayer";
import Sidebar from "./Sidebar";
import { useRoutePath } from "./useRoutePath";
import { AppNode } from "./types";

import "./App.css";

// Render 백엔드 기본 URL (환경변수 미설정 시 Render로 연결)
const API_URL = process.env.REACT_APP_API_URL || "https://ossd-8-route-search-system.onrender.com/api";
const Maptiler_Key = "DFFxHHmQRoAl3CPIlnBb";
const mapTilerStyles: Record<string, string> = {
  black: `http://223.194.46.216:8665/api/maps/positron/{z}/{x}/{y}.png`,
  osm: `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`,
  basic: `https://api.maptiler.com/maps/basic/{z}/{x}/{y}.png?key=${Maptiler_Key}`,
  streets: `https://api.maptiler.com/maps/streets/{z}/{x}/{y}.png?key=${Maptiler_Key}`,
  satellite: `https://api.maptiler.com/maps/hybrid/{z}/{x}/{y}.jpg?key=${Maptiler_Key}`,
};

function MapViewUpdater({ center, zoom }: { center: LatLngExpression; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    if (center) map.setView(center, zoom, { animate: true });
  }, [center, zoom, map]);
  return null;
}

interface MapInteractionHandlerProps {
  allNodes: AppNode[];
  setPinnedNode: (node: AppNode | null) => void;
  isPinned: boolean; 
  setIsSidebarOpen: (isOpen: boolean) => void;
}

function MapInteractionHandler({ allNodes, setPinnedNode, isPinned, setIsSidebarOpen }: MapInteractionHandlerProps) {
    const map = useMap();
    const CLICK_THRESHOLD_PX = 20; 
  
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
      if (closestNode && minPixelDistance < CLICK_THRESHOLD_PX) return closestNode;
      return null;
    };
  
    useMapEvents({
      click(e) {
        const node = findClosestNode(e.latlng);
        if (node) {
          const nodeToPin: AppNode = node;
          L.DomEvent.stopPropagation(e.originalEvent); 
          setTimeout(() => {
              setPinnedNode(nodeToPin);
              setIsSidebarOpen(true);
          }, 0);
        }
      },
    });
    return null;
}

function MapRefSetter({ setRoadRef }: { setRoadRef: (m: LeafletMap | null) => void }) {
  const map = useMap();
  useEffect(() => {
    setRoadRef(map);
    return () => setRoadRef(null);
  }, [map, setRoadRef]);
  return null;
}

// 초기 화면 범위를 고정하기 위한 Bounds 세터
function MapBoundsSetter({ setInitialBounds, setPaddedBounds }: { setInitialBounds: (b: LatLngBoundsExpression | null) => void; setPaddedBounds: (b: LatLngBoundsExpression | null) => void }) {
  const map = useMap();
  useEffect(() => {
    // map 초기 로딩 시점에 현재 bounds를 저장하여 maxBounds로 사용
    const bounds = map.getBounds();
    setInitialBounds(bounds);
    // 줌인 시 약간 여유 있게 이동할 수 있도록 패딩된 bounds도 저장
    const padded = bounds.pad(0.5); // 50% 확장
    setPaddedBounds(padded);
    // 초기에는 딱 맞게 고정
    map.setMaxBounds(bounds);
  }, [map, setInitialBounds, setPaddedBounds]);
  return null;
}

function App() {
  useEffect(() => { document.title = "공유 모빌리티 길찾기"; }, []);

  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [useCanvasLayer, setUseCanvasLayer] = useState<boolean>(false);
  
  const roadRef = useRef<LeafletMap | null>(null);
  const setRoadRef = useCallback((m: LeafletMap | null) => { roadRef.current = m; }, []);
  const canvasLayerRef = useRef<any>(null);

  const [mapStyle, setMapStyle] = useState<string>("basic");
  const [mapCenter, setMapCenter] = useState<LatLngExpression>([37.65146111, 127.0583889]); 
  const [mapZoom, setMapZoom] = useState<number>(15);
  const [initialBounds, setInitialBounds] = useState<LatLngBoundsExpression | null>(null);
  const [paddedBounds, setPaddedBounds] = useState<LatLngBoundsExpression | null>(null);
  const [currentMaxBounds, setCurrentMaxBounds] = useState<LatLngBoundsExpression | null>(null);

    // 초기 고정 범위 로그 출력
    useEffect(() => {
      if (initialBounds) {
          // Leaflet Bounds 객체에서 문자열(BBox)로 출력
          // @ts-ignore toBBoxString은 런타임에서 제공됨
          const bbox = (initialBounds as any).toBBoxString?.() ?? JSON.stringify(initialBounds);
          console.log("[Initial Bounds]", bbox);
      }
    }, [initialBounds]);

  // 줌 수준에 따라 허용 패닝 영역 조정
  useEffect(() => {
    const map = roadRef.current;
    if (!map || !initialBounds) return;

    const applyBounds = () => {
      const z = map.getZoom();
      const target = z > 15 && paddedBounds ? paddedBounds : initialBounds;
      map.setMaxBounds(target);
      setCurrentMaxBounds(target);
    };

    applyBounds();
    map.on("zoomend", applyBounds);
  return () => {
    map.off("zoomend", applyBounds);
  };
  }, [initialBounds, paddedBounds]);

  const [seoulNode, setSeoulNode] = useState<AppNode[]>([]);
  const [bicycleNode, setBicycleNode] = useState<AppNode[]>([]);
  const [ebikeNode, setEbikeNode] = useState<AppNode[]>([]);
  
  const [pinnedNode, setPinnedNode] = useState<AppNode | null>(null);
  
  const [startNode, setStartNode] = useState<AppNode | null>(null);
  const [destNode, setDestNode] = useState<AppNode | null>(null);
  const [viaNodes, setViaNodes] = useState<AppNode[]>([]);
  const [routeRequested, setRouteRequested] = useState<boolean>(false);
  const [selectedMode, setSelectedMode] = useState<"walk" | "bike" | "ebike" | null>(null);
  const { routeModes, defaultMode } = useRoutePath(startNode, destNode, viaNodes, routeRequested);

  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const [favorites, setFavorites] = useState<AppNode[]>([]);

  useEffect(() => {
      const fetchNodes = async () => {
          try {
            const response = await fetch(`${API_URL}/nodes`);
            const data = await response.json();
            if (data.nodes && data.nodes.length > 0) {
              const trafficNodes = data.nodes
                .filter((n:any) => n.type === "traffic")
                .map((n:any) => ({...n, id: Number(n.id), lat: Number(n.lat), lon: Number(n.lon), type: n.type}));
              const bicycleNodes = data.nodes
                .filter((n:any) => n.type === "bicycle_station")
                .map((n:any) => ({...n, id: Number(n.id), lat: Number(n.lat), lon: Number(n.lon), type: n.type}));
              const ebikeNodes = data.nodes
                .filter((n:any) => n.type === "e_bicycle_station")
                .map((n:any) => ({...n, id: Number(n.id), lat: Number(n.lat), lon: Number(n.lon), type: n.type}));
              setSeoulNode(trafficNodes);
              setBicycleNode(bicycleNodes);
              setEbikeNode(ebikeNodes);
              setIsConnected(true);
            }
          } catch(e) { console.error(e); setIsConnected(false); }
      };
      fetchNodes();
  }, []);

  const allNodes = useMemo<AppNode[]>(() => [...seoulNode, ...bicycleNode, ...ebikeNode], [seoulNode, bicycleNode, ebikeNode]);

  const toggleFavorite = (node: AppNode) => {
    if (favorites.some(f => f.id === node.id)) {
        setFavorites(favorites.filter(f => f.id !== node.id));
    } else {
        setFavorites([...favorites, node]);
    }
  };
  const removeFavorite = (id: number) => { setFavorites(favorites.filter(f => f.id !== id)); };

  useEffect(() => {
    if (!roadRef.current) return;
    if (useCanvasLayer) {
        if (canvasLayerRef.current) roadRef.current.removeLayer(canvasLayerRef.current);
        canvasLayerRef.current = LCanvasLayer();
        canvasLayerRef.current.delegate({
            onDrawLayer: ({ canvas, zoom }: any) => {
                 const ctx = canvas.getContext("2d");
                 if (!ctx) return;
                 ctx.clearRect(0, 0, canvas.width, canvas.height);
                 
                 const scale = Math.min(1, zoom / 15);
                 const trafficRadius = Math.max(2.5, 5 * scale); 
                 const bikeSize = Math.max(8, 16 * scale); 

                 // [신규] 우선 순위 노드(출발/도착/경유) ID 집합 생성
                 const priorityIds = new Set<number>();
                 if (startNode) priorityIds.add(startNode.id);
                 if (destNode) priorityIds.add(destNode.id);
                 viaNodes.forEach(v => priorityIds.add(v.id));

                 // [신규] 겹침 방지를 위한 격자 시스템 (줌 레벨 16용)
                 // 화면을 25px 단위 격자로 나누고 한 칸에 하나만 그림
                 const grid: Record<string, boolean> = {};
                 const CELL_SIZE = 25; 
                 const checkGridAvailability = (point: L.Point) => {
                     const gx = Math.floor(point.x / CELL_SIZE);
                     const gy = Math.floor(point.y / CELL_SIZE);
                     const key = `${gx},${gy}`;
                     if (grid[key]) return false;
                     grid[key] = true;
                     return true;
                 };

                 const drawNode = (node: AppNode, kind: "traffic" | "bike" | "ebike") => {
                     const point = roadRef.current!.latLngToContainerPoint(L.latLng(node.lat, node.lon));
                     
                     // ----------------------------------------------------
                     // [수정 1] 줌 레벨에 따른 가시성(Visibility) 로직
                     // ----------------------------------------------------
                     
                     // 1. 자전거 대여소: 모든 줌 레벨에서 표시 (요청사항 1번 참고)
                     // 2. 우선 순위 노드(출발/도착/경유): 모든 줌 레벨에서 무조건 표시
                     // 3. 일반 장소(Traffic):
                     //    - Zoom >= 17: 모두 표시
                     //    - Zoom == 16: 격자 확인 후 겹치면 숨김 (복잡도 해결)
                     //    - Zoom <= 15: 아예 표시하지 않음 (숨김)
                     
                     const isPriority = priorityIds.has(node.id);
                     let shouldDraw = false;

                     if (kind !== "traffic" || isPriority) {
                         shouldDraw = true;
                     } else {
                         // 일반 Traffic 노드 처리
                         if (zoom >= 17) {
                             shouldDraw = true;
                         } else if (zoom >= 16) {
                             // 16 레벨 (두 번 축소): 겹치면 앞에 있는 하나만
                             if (checkGridAvailability(point)) {
                                 shouldDraw = true;
                             }
                         } else {
                             // 15 레벨 이하 (세 번 축소~): 일반 노드 숨김
                             shouldDraw = false;
                         }
                     }

                     if (!shouldDraw) return;

                     // ----------------------------------------------------
                     // 그리기 로직 (기존 디자인 유지)
                     // ----------------------------------------------------
                     ctx.beginPath();
                     
                     let isActive = false;
                     let activeColor = "";
                     if (startNode?.id === node.id) { isActive = true; activeColor = "#f44336"; }
                     else if (destNode?.id === node.id) { isActive = true; activeColor = "#2196f3"; }
                     else if (viaNodes.some(v => v.id === node.id)) { isActive = true; activeColor = "#03C75A"; }

                     if (kind !== "traffic") {
                        const w = bikeSize * 1.5;
                        const h = bikeSize * 1.5;
                        const x = point.x - w/2;
                        const y = point.y - h/2;
                        const r = 4; 

                        const strokeColor = isActive ? activeColor : (kind === "ebike" ? "#f9a825" : "#546e7a");

                        ctx.fillStyle = "white"; 
                        ctx.strokeStyle = strokeColor; 
                        ctx.lineWidth = 2;
                        
                        ctx.beginPath();
                        ctx.moveTo(x + r, y);
                        ctx.arcTo(x + w, y, x + w, y + h, r);
                        ctx.arcTo(x + w, y + h, x, y + h, r);
                        ctx.arcTo(x, y + h, x, y, r);
                        ctx.arcTo(x, y, x + w, y, r);
                        ctx.closePath();
                        ctx.fill();
                        ctx.stroke();

                        ctx.fillStyle = kind === "ebike" ? "#f9a825" : "black";
                        ctx.font = `${bikeSize}px sans-serif`;
                        ctx.textAlign = "center";
                        ctx.textBaseline = "middle";
                        ctx.fillText(kind === "ebike" ? "⚡" : "🚲", point.x, point.y + 1); 

                     } else {
                        const r = trafficRadius;

                        if (isActive) {
                            ctx.fillStyle = activeColor;
                            ctx.arc(point.x, point.y, r * 1.5, 0, Math.PI * 2, true);
                            ctx.fill();
                        } else {
                            // 일반 노드 디자인 (회색 원 + 사각형)
                            ctx.fillStyle = "#cfd8dc"; 
                            ctx.beginPath();
                            ctx.arc(point.x, point.y, r, 0, Math.PI * 2, true);
                            ctx.fill();

                            ctx.fillStyle = "#607d8b"; 
                            const squareSize = r * 0.9;
                            const offset = squareSize / 2;
                            ctx.fillRect(point.x - offset, point.y - offset, squareSize, squareSize);
                        }
                     }
                 };

                 if (seoulNode.length > 0) seoulNode.forEach(node => drawNode(node, "traffic"));
                 if (bicycleNode.length > 0) bicycleNode.forEach(node => drawNode(node, "bike"));
                 if (ebikeNode.length > 0) ebikeNode.forEach(node => drawNode(node, "ebike"));
            }
        });
        roadRef.current.addLayer(canvasLayerRef.current);
        canvasLayerRef.current.needRedraw();
     } else {
         if (canvasLayerRef.current) {
            roadRef.current.removeLayer(canvasLayerRef.current);
            canvasLayerRef.current = null;
         }
     }
  }, [useCanvasLayer, seoulNode, bicycleNode, ebikeNode, startNode, destNode, viaNodes]);

  const handleLocateNode = (node: AppNode) => {
    setMapCenter([node.lat, node.lon]);
    setMapZoom(18);
    setPinnedNode(node);
    setIsSidebarOpen(true);
  };
  const handleStyleChange = (e: React.ChangeEvent<HTMLSelectElement>) => setMapStyle(e.target.value);
  const handleZoomIn = () => roadRef.current?.zoomIn();
  const handleZoomOut = () => roadRef.current?.zoomOut();

  // 출발/도착 변경 시 요청 상태 초기화
  useEffect(() => {
    setRouteRequested(false);
    setSelectedMode(null);
  }, [startNode, destNode]);

  // useRoutePath로 받아온 기본 선택 모드 적용
  useEffect(() => {
    if (defaultMode) setSelectedMode(defaultMode);
  }, [defaultMode]);

  const handleRequestRoutes = () => {
    if (!startNode || !destNode) {
      alert("출발지와 도착지를 모두 선택하세요.");
      return;
    }
    setRouteRequested(true);
  };

  const displayNode = pinnedNode;
  const isDisplayNodeFavorite = displayNode ? favorites.some(f => f.id === displayNode.id) : false;

  return (
    <div className="container">
      {!isConnected ? <div><h1 className="error-message">Not connected to server</h1></div> : (
        <div className="main-layout">
          <Sidebar 
            allNodes={allNodes}
            startNode={startNode}
            destNode={destNode}
            viaNodes={viaNodes}
            setStartNode={setStartNode}
            setDestNode={setDestNode}
            setViaNodes={setViaNodes}
            onLocateNode={handleLocateNode}
            isOpen={isSidebarOpen}
            setIsOpen={setIsSidebarOpen}
            favorites={favorites}
            onRemoveFavorite={removeFavorite}
            clickedNode={pinnedNode}
            routeModes={routeModes}
            routeRequested={routeRequested}
            selectedMode={selectedMode}
            onSelectMode={setSelectedMode}
            onRequestRoutes={handleRequestRoutes}
          />

          <div className="map-wrapper">
            <MapContainer
              center={mapCenter}
              zoom={mapZoom}
              minZoom={15}              // 초기 수준 이하로 줌아웃 방지
              maxZoom={19}              // 더 확대는 허용
              maxBounds={currentMaxBounds || initialBounds || undefined}          // 초기 화면 기준, 줌인 시 살짝 여유
              maxBoundsViscosity={1.0}   // 범위 밖 이동을 막음
              style={{ width: "100%", height: "100%" }}
              zoomControl={false}
              attributionControl={false}
              closePopupOnClick={false}
            >
              <MapRefSetter setRoadRef={setRoadRef} />
              <MapBoundsSetter setInitialBounds={setInitialBounds} setPaddedBounds={setPaddedBounds} />
              <MapViewUpdater center={mapCenter} zoom={mapZoom} />
              <TileLayer url={mapTilerStyles[mapStyle]} />
              
              <MapInteractionHandler 
                allNodes={allNodes} 
                setPinnedNode={setPinnedNode} 
                isPinned={!!pinnedNode} 
                setIsSidebarOpen={setIsSidebarOpen}
              />

              <ScaleControl position="bottomright" imperial={false} />

              {routeRequested && routeModes &&
                (["walk", "bike", "ebike"] as const).map((mode) => {
                  const data = routeModes?.[mode];
                  if (!data) return null;
                  const isSelected = selectedMode === mode;
                  const colorMap: Record<"walk" | "bike" | "ebike", string> = {
                    walk: "#4CAF50",     // green
                    bike: "#FF9800",     // orange
                    ebike: "#9C27B0",    // purple
                  };
                  const segments = data?.segments as any[] | undefined;
                  // fallback: 전체 좌표 한 번에
                  const baseOpacity = isSelected ? 0.9 : 0.35;
                  const baseWeight = isSelected ? 6 : 4;

                  if (segments && segments.length > 0) {
                    return segments.map((seg, idx) => {
                      const coords = seg?.coordinates;
                      if (!coords || coords.length === 0) return null;
                      const positions = coords.map(
                        ([lat, lon]: [number, number]) => [lat, lon]
                      ) as LatLngExpression[];
                      const segType: "walk" | "bike" | "ebike" = seg?.type || mode;
                      const segColor = isSelected ? (
                        segType === "walk" ? colorMap.walk :
                        segType === "bike" ? colorMap.bike :
                        colorMap.ebike
                      ) : "#4a4a4a";
                      return (
                        <Polyline
                          key={`${mode}-seg-${idx}`}
                          positions={positions}
                          pathOptions={{
                            color: segColor,
                            weight: baseWeight,
                            opacity: baseOpacity,
                          }}
                        />
                      );
                    });
                  }

                  // fallback: segments 없으면 전체 경로 단일색
                  const coords = data?.coordinates;
                  if (!coords || coords.length === 0) return null;
                  const positions = coords.map(([lat, lon]: [number, number]) => [lat, lon]) as LatLngExpression[];
                  const baseColor = isSelected ? colorMap[mode] : "#4a4a4a";
                  return (
                    <Polyline
                      key={mode}
                      positions={positions}
                      pathOptions={{
                        color: baseColor,
                        weight: baseWeight,
                        opacity: baseOpacity,
                      }}
                    />
                  );
                })}

              {startNode && <Popup position={[startNode.lat, startNode.lon]} closeButton={false} autoClose={false} closeOnClick={false} className="pin-popup pin-start"><div className="pin-body"><div className="pin-text">출발</div></div></Popup>}
              {destNode && <Popup position={[destNode.lat, destNode.lon]} closeButton={false} autoClose={false} closeOnClick={false} className="pin-popup pin-dest"><div className="pin-body"><div className="pin-text">도착</div></div></Popup>}
              {viaNodes.map((via, idx) => (<Popup key={`via-${idx}`} position={[via.lat, via.lon]} closeButton={false} autoClose={false} closeOnClick={false} className="pin-popup pin-via"><div className="pin-body"><div className="pin-text">경유{idx+1}</div></div></Popup>))}

              {displayNode && (
                <Popup
                  key={displayNode.id}
                  position={[displayNode.lat, displayNode.lon]}
                  closeOnClick={false}
                  closeButton={false}
                  className="naver-popup"
                >
                  <div className="naver-popup-layout-new" onClick={(e) => { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); }}>
                    <button className="popup-close-x" onClick={() => setPinnedNode(null)}>×</button>
                    
                    <div className="popup-row-header">
                        <span className="popup-id-main">ID {displayNode.id}</span>
                        <span className="popup-type-top-right">{displayNode.type === 'traffic' ? '장소' : '대여소'}</span>
                    </div>

                    <div className="popup-bottom-row">
                        <button 
                                className={`btn-star-bottom ${isDisplayNodeFavorite ? 'active' : ''}`} 
                                onClick={() => toggleFavorite(displayNode)}
                        >
                            {isDisplayNodeFavorite ? '★' : '☆'}
                        </button>
                        
                        <div className="popup-actions-group">
                            <button className="btn-naver-action start-color" onClick={() => { setStartNode(displayNode); setPinnedNode(null); setIsSidebarOpen(true); }}>출발</button>
                            <button className="btn-naver-action" onClick={() => { setViaNodes([...viaNodes, displayNode]); setPinnedNode(null); setIsSidebarOpen(true); }}>경유</button>
                            <button className="btn-naver-action dest-color" onClick={() => { setDestNode(displayNode); setPinnedNode(null); setIsSidebarOpen(true); }}>도착</button>
                        </div>
                    </div>
                  </div>
                </Popup>
              )}
            </MapContainer>

            <div className="controls-right">
              <div className="control-box">
                <h3>지도 스타일</h3>
                <select className="style-dropdown" value={mapStyle} onChange={handleStyleChange}>
                    <option value="basic">Basic</option>
                    <option value="black">Black</option>
                    <option value="osm">OSM</option>
                    <option value="streets">Streets</option>
                    <option value="satellite">Satellite</option>
                </select>
              </div>
              <div className="control-box">
                <h3>도로망 표시</h3>
                <div className="radio-group">
                    <label><input type="radio" checked={useCanvasLayer} onChange={() => setUseCanvasLayer(true)} /> On</label>
                    <label><input type="radio" checked={!useCanvasLayer} onChange={() => setUseCanvasLayer(false)} /> Off</label>
                </div>
              </div>
              <div className="zoom-controls">
                <button className="zoom-btn" onClick={handleZoomIn}>+</button>
                <button className="zoom-btn" onClick={handleZoomOut}>-</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;