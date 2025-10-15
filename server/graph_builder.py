import networkx as nx
import pandas as pd
from sklearn.neighbors import BallTree
import numpy as np
from haversine import haversine, Unit
import config as cfg


def build_graph():
    """
    노드와 엣지를 포함한 그래프 생성
    """
    print("그래프 구축 시작...")
    graph = nx.Graph()
    
    # 노드 추가
    node_id = 0
    node_positions = {}  # {node_id: (lat, lon)}
    
    # 교통 노드 추가 (전처리된 JSON 데이터 사용)
    for node_key, node_info in cfg.node_data.items():
        node_id += 1
        lat = node_info['lat']
        lon = node_info['lon']
        
        graph.add_node(
            node_id,
            lat=lat,
            lon=lon,
            type="traffic"
        )
        node_positions[node_id] = (lat, lon)

    # 자전거 대여소 추가
    for index, row in cfg.bicycle_data.iterrows():
        node_id += 1
        lat = row['위도']
        lon = row['경도']
        
        if pd.isna(lat) or pd.isna(lon):
            continue

        graph.add_node(
            node_id,
            lat=lat,
            lon=lon,
            type="bicycle_station"
        )
        node_positions[node_id] = (lat, lon)
    
    print(f"총 {len(graph.nodes)}개 노드 추가 완료")
    
    # 엣지 추가 (K-nearest neighbors 기반)
    print("엣지 추가 중...")
    add_edges_knn(graph, node_positions, k=8)
    
    print(f"총 {len(graph.edges)}개 엣지 추가 완료")
    print("그래프 구축 완료!")
    
    return graph


def add_edges_knn(graph: nx.Graph, node_positions: dict, k: int = 8):
    """
    K-nearest neighbors를 사용하여 엣지 추가
    
    Args:
        graph: NetworkX 그래프
        node_positions: {node_id: (lat, lon)} 딕셔너리
        k: 각 노드당 연결할 최근접 이웃 수
    """
    if len(node_positions) == 0:
        return
    
    # 노드 ID와 좌표 리스트 생성
    node_ids = list(node_positions.keys())
    coordinates = np.array([node_positions[nid] for nid in node_ids])
    
    # BallTree를 사용한 효율적인 최근접 이웃 검색
    # 좌표를 라디안으로 변환
    coordinates_rad = np.radians(coordinates)
    tree = BallTree(coordinates_rad, metric='haversine')
    
    # 각 노드에 대해 k개의 최근접 이웃 찾기
    distances, indices = tree.query(coordinates_rad, k=k+1)  # +1은 자기 자신 포함
    
    # 엣지 추가
    edges_added = 0
    for i, node_id in enumerate(node_ids):
        # 자기 자신을 제외한 k개의 이웃
        for j in range(1, min(k+1, len(indices[i]))):
            neighbor_idx = indices[i][j]
            neighbor_id = node_ids[neighbor_idx]
            
            # 이미 엣지가 존재하면 스킵
            if graph.has_edge(node_id, neighbor_id):
                continue
            
            # Haversine 거리 계산 (km)
            distance_km = distances[i][j] * 6371.0  # 라디안 * 지구 반지름
            
            # 너무 먼 거리는 연결하지 않음 (10km 이상)
            if distance_km > 10.0:
                continue
            
            # 엣지 추가
            graph.add_edge(node_id, neighbor_id, weight=distance_km)
            edges_added += 1
        
        # 진행상황 출력
        if (i + 1) % 1000 == 0:
            print(f"  진행중... {i + 1}/{len(node_ids)} 노드 처리 완료")
    
    print(f"  {edges_added}개의 엣지 추가됨")