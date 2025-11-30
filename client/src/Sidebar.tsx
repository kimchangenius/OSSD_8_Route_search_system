import React, { useState, useEffect } from 'react';
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
  clickedNode
}) => {
  const [searchId, setSearchId] = useState<string>("");
  const [searchType, setSearchType] = useState<string>("traffic");
  const [searchResult, setSearchResult] = useState<AppNode | null>(null);
  const [searchError, setSearchError] = useState<string>("");

  useEffect(() => {
    if (clickedNode) {
        setSearchResult(clickedNode);
        setSearchError("");
        setSearchId(clickedNode.id.toString());
        setSearchType(clickedNode.type);
    }
  }, [clickedNode]);

  const toggleSidebar = () => {
    setIsOpen(!isOpen); 
  };

  const handleSearch = () => {
    setSearchError("");
    setSearchResult(null);

    const idNum = Number(searchId);
    if (isNaN(idNum)) {
      setSearchError("숫자 ID를 입력해주세요.");
      return;
    }

    const found = allNodes.find(
      (node) => node.id === idNum && node.type === searchType
    );

    if (found) {
      setSearchResult(found);
      if (onLocateNode) onLocateNode(found);
    } else {
      setSearchError("해당 장소를 찾을 수 없습니다.");
    }
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

        {/* 1. 검색 영역 */}
        <div className="search-section">
          <div className="search-input-wrapper">
            <label htmlFor="search-node-id" className="a11y-hidden">장소 입력</label>
            <input 
              id="search-node-id"
              type="text" 
              className="sidebar-input search-text"
              placeholder="장소를 입력하세요 (ID)"
              value={searchId}
              onChange={(e) => setSearchId(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
            <button className="search-btn" onClick={handleSearch}>검색</button>
          </div>
          <div className="search-options">
            <label htmlFor="search-node-type" className="option-label">유형</label>
            <select 
              id="search-node-type"
              className="sidebar-select"
              value={searchType}
              onChange={(e) => setSearchType(e.target.value)}
            >
              {/* [수정] 교차로 -> 장소 */}
              <option value="traffic">일반 장소</option>
              <option value="bicycle_station">자전거 대여소</option>
            </select>
          </div>
        </div>

        {/* 2. 검색 결과 */}
        {searchError && <div className="error-msg">{searchError}</div>}
        {searchResult && (
          <div className="result-card">
            <div className="card-header">
              <span className="badge">검색 결과</span>
              <span className="node-id">ID: {searchResult.id}</span>
            </div>
            {/* [수정] 교차로 -> 장소 */}
            <div className="node-desc" style={{fontSize: '12px', color:'#666', marginBottom:'8px'}}>
                 {searchResult.type === 'traffic' ? '📍 일반 장소' : '🚲 자전거 대여소'}
            </div>

            <div className="card-body">
                <div className="card-actions">
                    <button className="action-btn btn-start" onClick={() => setStartNode(searchResult)}>출발</button>
                    <button className="action-btn" style={{borderColor:'#aaa', color:'#555'}} onClick={() => setViaNodes([...viaNodes, searchResult])}>경유</button>
                    <button className="action-btn btn-dest" onClick={() => setDestNode(searchResult)}>도착</button>
                </div>
            </div>
          </div>
        )}

        <hr className="divider" />

        {/* 3. 경로 (출발 - 경유 - 도착) */}
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

      </div>
    </div>
  );
};

export default Sidebar;