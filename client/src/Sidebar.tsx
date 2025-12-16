import React, { useEffect } from 'react';
import './Sidebar.css';
import './App.css'; 
import Favorites from './Favorites';
import { AppNode } from './types';

interface SidebarProps {
  allNodes: AppNode[];
  startNode: AppNode | null;
  destNode: AppNode | null;
  viaNodes: AppNode[];
  setStartNode: (node: AppNode | null) => void;
  setDestNode: (node: AppNode | null) => void;
  setViaNodes: (nodes: AppNode[]) => void;
  onLocateNode?: (node: AppNode) => void;
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  favorites: AppNode[];
  onRemoveFavorite: (id: number) => void;
  clickedNode: AppNode | null;
  routeModes?: any | null;
  routeRequested: boolean;
  selectedMode: "walk" | "bike" | "ebike" | null;
  onSelectMode: (mode: "walk" | "bike" | "ebike") => void;
  onRequestRoutes: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({
  allNodes,
  startNode,
  destNode,
  viaNodes,
  setStartNode,
  setDestNode,
  setViaNodes,
  onLocateNode,
  isOpen,     
  setIsOpen,
  favorites,
  onRemoveFavorite,
  clickedNode,
  routeModes,
  routeRequested,
  selectedMode,
  onSelectMode,
  onRequestRoutes
}) => {
  useEffect(() => {
    // 검색 기능 제거: 클릭된 노드를 별도 상태로 보관하지 않음
  }, [clickedNode]);

  const toggleSidebar = () => {
    setIsOpen(!isOpen); 
  };

  const removeVia = (index: number) => {
    const newVias = [...viaNodes];
    newVias.splice(index, 1);
    setViaNodes(newVias);
  };

  return (
    <div 
      className={`sidebar-container ${!isOpen ? 'sidebar-closed' : ''}`}
      style={{ width: isOpen ? '350px' : '0px' }}
    >
      <div className="sidebar-toggle" onClick={toggleSidebar}>
        <span className="toggle-icon">{isOpen ? '◀' : '▶'}</span>
      </div>

      <div className="sidebar-content">
        <h2 className="app-title">공유 모빌리티 길찾기</h2>

        {/* 경로 (출발 - 경유 - 도착) */}
        <div className="route-section">
          <h3 className="section-title">경로</h3>
          
          <div className="route-box">
            {/* 출발지 */}
            <div className={`route-slot start-slot ${startNode ? 'active' : ''}`}>
                <div className="icon-wrapper"><span className="marker-icon start">출발</span></div>
                <div className="slot-content">
                    {startNode ? <span>ID {startNode.id}</span> : <span className="placeholder-text">출발지 입력</span>}
                </div>
                {startNode && <button className="btn-clear" onClick={() => setStartNode(null)}>✕</button>}
            </div>

            <div className="route-connector"><span className="dots">⋮</span></div>

            {/* 경유지 리스트 */}
            {viaNodes.map((via, idx) => (
                <React.Fragment key={idx}>
                    <div className="route-slot via-slot active">
                        <div className="icon-wrapper"><span className="marker-icon via">경유</span></div>
                        <div className="slot-content">ID {via.id}</div>
                        <button className="btn-clear" onClick={() => removeVia(idx)}>✕</button>
                    </div>
                    <div className="route-connector"><span className="dots">⋮</span></div>
                </React.Fragment>
            ))}

            {/* 도착지 */}
            <div className={`route-slot dest-slot ${destNode ? 'active' : ''}`}>
                <div className="icon-wrapper"><span className="marker-icon dest">도착</span></div>
                <div className="slot-content">
                    {destNode ? <span>ID {destNode.id}</span> : <span className="placeholder-text">도착지 입력</span>}
                </div>
                {destNode && <button className="btn-clear" onClick={() => setDestNode(null)}>✕</button>}
            </div>
          </div>
        </div>

        {/* 4. 즐겨찾기 섹션 */}
        <Favorites 
            favorites={favorites}
            onRemoveFavorite={onRemoveFavorite}
            onSetStart={setStartNode}
            onSetDest={setDestNode}
        />

        {/* 5. 경로 찾기 버튼 */}
        <div className="route-action">
          <button
            className="route-action-btn"
            onClick={onRequestRoutes}
            disabled={!startNode || !destNode}
          >
            경로 찾기
          </button>
          {!startNode || !destNode ? (
            <div className="route-hint">출발/도착을 먼저 선택하세요.</div>
          ) : null}
        </div>

        {/* 6. 모드별 경로 요약 (버튼 실행 후에만 표시) */}
        {routeRequested && routeModes && (
          <div className="route-section">
            <h3 className="section-title">경로 옵션</h3>
            <div className="mode-list">
              {renderModeCard("도보", "walk", routeModes?.walk, selectedMode, onSelectMode)}
              {renderModeCard("따릉이", "bike", routeModes?.bike, selectedMode, onSelectMode)}
              {renderModeCard("지쿠터", "ebike", routeModes?.ebike, selectedMode, onSelectMode)}
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

// 모드 카드 렌더러
function renderModeCard(
  label: string,
  modeKey: "walk" | "bike" | "ebike",
  data: any,
  selectedMode: "walk" | "bike" | "ebike" | null,
  onSelectMode: (mode: "walk" | "bike" | "ebike") => void
) {
  const timeMin = data?.time_min;
  const comp = data?.time_components;
  const walkTime = comp?.walk ?? 0;
  const rideTime = comp?.ride ?? 0;
  const rideType = comp?.ride_type;
  const timeSegments = data?.time_segments as { type: "walk" | "bike" | "ebike"; time_min: number }[] | undefined;
  const success = data?.success;
  const message = data?.message;
  const isSelected = selectedMode === modeKey;
  const isClickable = success;

  const total = (walkTime || 0) + (rideTime || 0);
  // time_segments 기반으로 퍼센트 계산 (있을 때만 사용, 순서 유지)
  let barBlocks: { type: "walk" | "bike" | "ebike"; pct: number; value: number }[] = [];
  let seqText = "";
  if (timeSegments && timeSegments.length > 0) {
    const segTotal = timeSegments.reduce((s, ts) => s + (ts.time_min || 0), 0);
    if (segTotal > 0) {
      barBlocks = timeSegments
        .filter((ts) => ts.time_min > 0)
        .map((ts) => ({
          type: ts.type,
          value: ts.time_min,
          pct: (ts.time_min / segTotal) * 100,
        }));
      seqText = barBlocks
        .map((b) => `${b.type === "walk" ? "도보" : b.type === "bike" ? "자전거" : "전기자전거"} ${b.value}분`)
        .join(" → ");
    }
  }
  // time_segments 없을 때 fallback
  if (barBlocks.length === 0 && total > 0) {
    const walkPct = (walkTime / total) * 100;
    const ridePct = (rideTime / total) * 100;
    if (walkPct > 0) barBlocks.push({ type: "walk", pct: walkPct, value: walkTime });
    if (ridePct > 0) barBlocks.push({ type: rideType === "ebike" ? "ebike" : "bike", pct: ridePct, value: rideTime });
    seqText = [
      walkPct > 0 ? `도보 ${walkTime}분` : null,
      ridePct > 0 ? `${rideType === "ebike" ? "전기자전거" : "자전거"} ${rideTime}분` : null,
    ]
      .filter(Boolean)
      .join(" → ");
  }

  return (
    <div
      className={`mode-card ${isSelected ? "selected" : ""} ${isClickable ? "clickable" : ""}`}
      onClick={() => { if (isClickable) onSelectMode(modeKey); }}
    >
      <div className="mode-title">{label}</div>
      {success ? (
        <div className="mode-info">
          <div>소요시간: {timeMin ?? 0} 분</div>
          <div style={{ marginTop: 6 }}>
            <div style={{ display: "flex", height: 10, borderRadius: 4, overflow: "hidden", background: "#eee" }}>
              {barBlocks.map((b, idx) => (
                <div
                  key={`bar-${idx}`}
                  style={{
                    width: `${b.pct}%`,
                    background:
                      b.type === "walk"
                        ? "#4CAF50"
                        : b.type === "bike"
                        ? "#FF9800"
                        : "#9C27B0",
                  }}
                />
              ))}
            </div>
            <div style={{ fontSize: 12, color: "#555", marginTop: 4 }}>{seqText}</div>
          </div>
        </div>
      ) : (
        <div className="mode-info fail">{message || "경로를 찾을 수 없습니다."}</div>
      )}
    </div>
  );
}

export default Sidebar;