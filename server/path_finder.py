import heapq
from typing import Dict, List, Tuple, Optional
import networkx as nx
from haversine import haversine, Unit


class ContractionHierarchies:
    """
    Contraction Hierarchies (CCH) 알고리즘 구현
    """
    
    def __init__(self, graph: nx.Graph):
        """
        Args:
            graph: NetworkX 그래프 객체
        """
        self.original_graph = graph
        self.contracted_graph = graph.copy()
        self.node_levels: Dict[int, int] = {}
        self.shortcuts: Dict[Tuple[int, int], float] = {}
        self.is_preprocessed = False
    
    def preprocess(self) -> None:
        """
        CCH 전처리 단계: 노드 contraction 수행
        """
        print("CCH 전처리 시작...")
        
        # 모든 노드의 초기 레벨을 0으로 설정
        remaining_nodes = set(self.contracted_graph.nodes())
        level = 0
        
        # Edge difference 기반으로 노드를 순차적으로 contract
        while remaining_nodes:
            # 현재 레벨에서 contract할 노드 선택 (degree가 가장 작은 노드)
            node_importance = {}
            for node in remaining_nodes:
                # Edge difference 계산
                neighbors = list(self.contracted_graph.neighbors(node))
                edge_diff = self.calculate_edge_difference(node, neighbors)
                node_importance[node] = edge_diff
            
            # 중요도가 낮은 노드부터 contract
            if not node_importance:
                break
                
            min_importance = min(node_importance.values())
            nodes_to_contract = [n for n, imp in node_importance.items() 
                                if imp == min_importance][:max(1, len(remaining_nodes) // 100)]
            
            for node in nodes_to_contract:
                self.contract_node(node, level)
                self.node_levels[node] = level
                remaining_nodes.remove(node)
            
            level += 1
            
            if level % 100 == 0:
                print(f"진행중... Level {level}, 남은 노드: {len(remaining_nodes)}")
        
        self.is_preprocessed = True
        print(f"CCH 전처리 완료! 총 {len(self.shortcuts)}개의 shortcut 생성됨")
    
    def calculate_edge_difference(self, node: int, neighbors: List[int]) -> int:
        """
        노드를 contract했을 때 추가되는 엣지 수 - 제거되는 엣지 수 계산
        """
        if len(neighbors) <= 1:
            return -len(neighbors)
        
        # 제거되는 엣지 수
        removed_edges = len(neighbors)
        
        # 추가될 수 있는 엣지 수 (shortcuts)
        added_edges = 0
        for i, u in enumerate(neighbors):
            for v in neighbors[i+1:]:
                if not self.contracted_graph.has_edge(u, v):
                    # u-v 직접 경로가 없고, node를 거쳐가는게 최단경로면 shortcut 필요
                    added_edges += 1
        
        return added_edges - removed_edges
    
    def contract_node(self, node: int, level: int) -> None:
        """
        노드를 contract하고 필요한 shortcut 추가
        """
        neighbors = list(self.contracted_graph.neighbors(node))
        
        # 모든 이웃 쌍에 대해 shortcut 확인
        for i, u in enumerate(neighbors):
            dist_u_node = self.contracted_graph[u][node].get('weight', 1.0)
            
            for v in neighbors[i+1:]:
                dist_node_v = self.contracted_graph[node][v].get('weight', 1.0)
                shortcut_dist = dist_u_node + dist_node_v
                
                # u-v 간 더 짧은 경로가 node를 거치지 않고 존재하는지 확인
                if self.contracted_graph.has_edge(u, v):
                    current_dist = self.contracted_graph[u][v].get('weight', float('inf'))
                    if shortcut_dist >= current_dist:
                        continue
                
                # Shortcut 추가
                self.contracted_graph.add_edge(u, v, weight=shortcut_dist)
                self.shortcuts[(u, v)] = shortcut_dist
                self.shortcuts[(v, u)] = shortcut_dist
        
        # 노드 제거
        self.contracted_graph.remove_node(node)
    
    def query(self, start: int, goal: int) -> Tuple[Optional[List[int]], float]:
        """
        CCH를 사용한 최단 경로 쿼리 (Bidirectional Dijkstra)
        
        Args:
            start: 시작 노드 ID
            goal: 목표 노드 ID
        
        Returns:
            (경로 노드 리스트, 총 거리) 또는 (None, inf)
        """
        if not self.is_preprocessed:
            raise RuntimeError("preprocess()를 먼저 호출해야 합니다.")
        
        if start not in self.original_graph or goal not in self.original_graph:
            return None, float('inf')
        
        if start == goal:
            return [start], 0.0
        
        # Forward search (start에서 상위 레벨로)
        forward_dist = {start: 0.0}
        forward_parent = {start: None}
        forward_heap = [(0.0, start)]
        forward_settled = set()
        
        # Backward search (goal에서 상위 레벨로)
        backward_dist = {goal: 0.0}
        backward_parent = {goal: None}
        backward_heap = [(0.0, goal)]
        backward_settled = set()
        
        best_dist = float('inf')
        meeting_node = None
        
        # Bidirectional search
        while forward_heap or backward_heap:
            # Forward step
            if forward_heap:
                dist, node = heapq.heappop(forward_heap)
                
                if node in forward_settled:
                    continue
                
                forward_settled.add(node)
                
                # 두 탐색이 만났는지 확인
                if node in backward_dist:
                    total_dist = forward_dist[node] + backward_dist[node]
                    if total_dist < best_dist:
                        best_dist = total_dist
                        meeting_node = node
                
                # 상위 레벨 노드로만 이동
                for neighbor in self.original_graph.neighbors(node):
                    if self.node_levels.get(neighbor, 0) > self.node_levels.get(node, 0):
                        edge_weight = self.original_graph[node][neighbor].get('weight', 1.0)
                        new_dist = forward_dist[node] + edge_weight
                        
                        if neighbor not in forward_dist or new_dist < forward_dist[neighbor]:
                            forward_dist[neighbor] = new_dist
                            forward_parent[neighbor] = node
                            heapq.heappush(forward_heap, (new_dist, neighbor))
            
            # Backward step
            if backward_heap:
                dist, node = heapq.heappop(backward_heap)
                
                if node in backward_settled:
                    continue
                
                backward_settled.add(node)
                
                # 두 탐색이 만났는지 확인
                if node in forward_dist:
                    total_dist = forward_dist[node] + backward_dist[node]
                    if total_dist < best_dist:
                        best_dist = total_dist
                        meeting_node = node
                
                # 상위 레벨 노드로만 이동
                for neighbor in self.original_graph.neighbors(node):
                    if self.node_levels.get(neighbor, 0) > self.node_levels.get(node, 0):
                        edge_weight = self.original_graph[node][neighbor].get('weight', 1.0)
                        new_dist = backward_dist[node] + edge_weight
                        
                        if neighbor not in backward_dist or new_dist < backward_dist[neighbor]:
                            backward_dist[neighbor] = new_dist
                            backward_parent[neighbor] = node
                            heapq.heappush(backward_heap, (new_dist, neighbor))
        
        # 경로가 없는 경우
        if meeting_node is None:
            return None, float('inf')
        
        # 경로 재구성
        path = self.reconstruct_path(start, goal, meeting_node, 
                                      forward_parent, backward_parent)
        
        return path, best_dist
    
    def reconstruct_path(self, start: int, goal: int, meeting_node: int,
                         forward_parent: Dict[int, Optional[int]],
                         backward_parent: Dict[int, Optional[int]]) -> List[int]:
        """
        양방향 탐색 결과로부터 경로 재구성
        """
        # Forward path (start -> meeting_node)
        forward_path = []
        node = meeting_node
        while node is not None:
            forward_path.append(node)
            node = forward_parent.get(node)
        forward_path.reverse()
        
        # Backward path (meeting_node -> goal)
        backward_path = []
        node = backward_parent.get(meeting_node)
        while node is not None:
            backward_path.append(node)
            node = backward_parent.get(node)
        
        # 결합
        path = forward_path + backward_path
        return path


def find_path(graph: nx.Graph, start_id: int, goal_id: int, 
              use_cache: bool = True) -> Dict:
    """
    CCH 알고리즘을 사용한 최단 경로 탐색
    
    Args:
        graph: NetworkX 그래프 객체
        start_id: 시작 노드 ID
        goal_id: 목표 노드 ID
        use_cache: CCH 전처리 캐시 사용 여부
    
    Returns:
        {
            'path': 경로 노드 ID 리스트,
            'distance': 총 거리 (km),
            'coordinates': 경로의 좌표 리스트 [(lat, lon), ...],
            'success': 성공 여부
        }
    """
    try:
        # CCH 객체 초기화
        if not hasattr(find_path, 'cch_cache') or not use_cache:
            print("CCH 초기화 및 전처리 중...")
            cch = ContractionHierarchies(graph)
            cch.preprocess()
            if use_cache:
                find_path.cch_cache = cch
        else:
            cch = find_path.cch_cache
        
        # 경로 탐색
        path, distance = cch.query(start_id, goal_id)
        
        if path is None:
            return {
                'path': [],
                'distance': float('inf'),
                'coordinates': [],
                'success': False,
                'message': '경로를 찾을 수 없습니다.'
            }
        
        # 좌표 정보 추출
        coordinates = []
        for node_id in path:
            node_data = graph.nodes[node_id]
            coordinates.append((node_data['lat'], node_data['lon']))
        
        return {
            'path': path,
            'distance': round(distance, 3),
            'coordinates': coordinates,
            'success': True,
            'message': f'경로 탐색 성공: {len(path)}개 노드, {round(distance, 3)}km'
        }
    
    except Exception as e:
        return {
            'path': [],
            'distance': float('inf'),
            'coordinates': [],
            'success': False,
            'message': f'오류 발생: {str(e)}'
        }

