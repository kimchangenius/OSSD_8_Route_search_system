import React from 'react';
import './App.css';
import { AppNode } from './types';

interface FavoritesProps {
  favorites: AppNode[];
  onRemoveFavorite: (id: number) => void;
  onSetStart: (node: AppNode) => void;
  onSetDest: (node: AppNode) => void;
}

const Favorites: React.FC<FavoritesProps> = ({ favorites, onRemoveFavorite, onSetStart, onSetDest }) => {
  if (favorites.length === 0) return null;

  return (
    <div className="favorites-section">
      <h3 className="favorites-title">⭐ 자주 가는 곳</h3>
      <div className="favorites-list">
        {favorites.map((node) => (
          <div key={node.id} className="favorite-item">
            
            <div className="fav-info-row">
              <span className="fav-icon-box">
                {/* [수정 3] 신호등(🚦) -> 핀(📍) 아이콘으로 변경 */}
                {node.type === 'traffic' ? '📍' : '🚲'}
              </span>
              <span className="fav-id">ID {node.id}</span>
              <span className="fav-type">
                {node.type === 'traffic' ? '장소' : '대여소'}
              </span>
            </div>

            <div className="fav-actions-row">
              <button className="fav-btn start" onClick={() => onSetStart(node)}>출발</button>
              <button className="fav-btn dest" onClick={() => onSetDest(node)}>도착</button>
              <button className="fav-btn del" onClick={() => onRemoveFavorite(node.id)} title="목록에서 삭제">✕</button>
            </div>

          </div>
        ))}
      </div>
    </div>
  );
};

export default Favorites;