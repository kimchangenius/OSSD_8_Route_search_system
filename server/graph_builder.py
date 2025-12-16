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
    node_positions = {}  # {node_id: (lat, lon)}
    
    # 교통 노드 추가 (전처리된 JSON 데이터 사용)
    for node_key, node_info in cfg.node_data.items():
        # 원본 데이터의 ID를 그대로 사용 (neighbors 매칭을 위해 필수)
        node_id = int(node_key)
        lat = node_info['a']
        lon = node_info['o']
        # neighbors 정보 추가 (n 키가 없으면 빈 리스트)
        neighbors = node_info.get('n', [])
        
        graph.add_node(
            node_id,
            lat=lat,
            lon=lon,
            neighbors=neighbors,
            type="traffic"
        )
        node_positions[node_id] = (lat, lon)

    # 자전거 대여소 추가
    # 교통 노드 ID와 겹치지 않게 오프셋 적용 (예: 100억부터 시작)
    BICYCLE_OFFSET = 10000000000
    for index, row in cfg.bicycle_data.iterrows():
        node_id = BICYCLE_OFFSET + index
        lat = row['위도']
        lon = row['경도']
        
        if pd.isna(lat) or pd.isna(lon):
            continue

        graph.add_node(
            node_id,
            lat=lat,
            lon=lon,
            neighbors=[],
            type="bicycle_station"
        )
        node_positions[node_id] = (lat, lon)

    # 전기 자전거 대여소 추가 (무작위 50개)
    EBICYCLE_OFFSET = 11000000000
    for idx, item in enumerate(cfg.ebicycle_data):
        node_id = EBICYCLE_OFFSET + idx
        lat = item.get("lat")
        lon = item.get("lon")
        if lat is None or lon is None:
            continue
        graph.add_node(
            node_id,
            lat=lat,
            lon=lon,
            neighbors=[],
            type="e_bicycle_station"
        )
        node_positions[node_id] = (lat, lon)
    
    print(f"총 {len(graph.nodes)}개 노드 추가 완료")
    
    # 엣지 추가 (neighbors 정보 기반)
    print("Neighbors 기반 엣지 추가 중... (교통 노드)")
    add_edges_from_neighbors(graph)
    
    # 자전거/전기 자전거 대여소 등 neighbors가 없는 노드를 위해 KNN 사용
    print("KNN 기반 엣지 추가 중... (자전거/전기 자전거 대여소)")
    add_edges_knn(graph, node_positions, k=3) # K=3으로 설정
    
    print(f"총 {len(graph.edges)}개 엣지 추가 완료")
    print("그래프 구축 완료!")
    
    return graph


def add_edges_from_neighbors(graph: nx.Graph):
    """
    노드의 'neighbors' 속성을 사용하여 엣지 추가
    """
    edges_added = 0
    for node_id, node_data in graph.nodes(data=True):
        neighbors = node_data.get('neighbors', [])
        
        for neighbor_id in neighbors:
            # neighbors ID가 정수인지 문자열인지 확인 필요 (여기선 int로 가정)
            try:
                neighbor_id = int(neighbor_id)
            except ValueError:
                continue
                
            if graph.has_node(neighbor_id):
                # 거리 계산
                pos1 = (node_data['lat'], node_data['lon'])
                pos2 = (graph.nodes[neighbor_id]['lat'], graph.nodes[neighbor_id]['lon'])
                distance = haversine(pos1, pos2, unit=Unit.KILOMETERS)
                
                graph.add_edge(node_id, neighbor_id, weight=distance)
                edges_added += 1
    
    print(f"Neighbors 기반 {edges_added}개 엣지 추가됨")


def add_edges_knn(graph: nx.Graph, node_positions: dict, k: int = 8):
    """
    K-nearest neighbors를 사용하여 엣지 추가 (자전거 대여소 노드만 대상)
    
    Args:
        graph: NetworkX 그래프
        node_positions: {node_id: (lat, lon)} 딕셔너리
        k: 각 노드당 연결할 최근접 이웃 수
    """
    if len(node_positions) == 0:
        return
    
    # 전체 노드 좌표 (검색 대상)
    all_node_ids = list(node_positions.keys())
    all_coordinates = np.array([node_positions[nid] for nid in all_node_ids])
    
    # 자전거/전기자전거 대여소 노드만 필터링 (검색 쿼리)
    station_types = {"bicycle_station", "e_bicycle_station"}
    bicycle_node_ids = [nid for nid, data in graph.nodes(data=True) if data.get('type') in station_types]
    
    if not bicycle_node_ids:
        print("자전거/전기 자전거 대여소 노드가 없습니다.")
        return
        
    bicycle_coordinates = np.array([node_positions[nid] for nid in bicycle_node_ids])
    
    print(f"자전거 대여소 {len(bicycle_node_ids)}개에 대해 KNN 수행...")
    
    # BallTree 생성 (전체 노드 대상)
    all_coordinates_rad = np.radians(all_coordinates)
    tree = BallTree(all_coordinates_rad, metric='haversine')
    
    # 자전거 노드에 대해 k개의 최근접 이웃 찾기
    bicycle_coordinates_rad = np.radians(bicycle_coordinates)
    distances, indices = tree.query(bicycle_coordinates_rad, k=k+1)
    
    # 엣지 추가
    edges_added = 0
    for i, node_id in enumerate(bicycle_node_ids):
        # 자기 자신을 제외한 k개의 이웃
        for j in range(1, min(k+1, len(indices[i]))):
            neighbor_idx = indices[i][j]
            neighbor_id = all_node_ids[neighbor_idx]
            
            # 이미 엣지가 존재하면 스킵
            if graph.has_edge(node_id, neighbor_id):
                continue
            
            # Haversine 거리 계산 (km)
            distance_km = distances[i][j] * 6371.0
            
            # 너무 먼 거리는 연결하지 않음 (5km 이상)
            if distance_km > 5.0:
                continue
            
            # 엣지 추가 (양방향)
            graph.add_edge(node_id, neighbor_id, weight=distance_km)
            edges_added += 1
            
    print(f"KNN 기반 {edges_added}개 엣지 추가됨")
