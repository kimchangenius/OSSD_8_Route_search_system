import heapq
import math
from typing import Dict, List, Tuple, Optional, Set
import networkx as nx

WALK_SPEED_MPS = 5_000 / 3600  # 시속 5km -> m/s
BIKE_SPEED_MPS = 15_000 / 3600  # 시속 15km -> m/s
EBIKE_SPEED_MPS = 20_000 / 3600  # 시속 20km -> m/s

# 서브그래프 반경 (미터): 출발/도착 주변만 잘라 탐색해 속도 개선
SUBGRAPH_RADIUS_M = 3000


# -----------------------------
# 기본 Dijkstra 최단 경로 유틸
# -----------------------------
def _haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371000.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return 2 * R * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _heuristic(graph: nx.Graph, u: int, v: int) -> float:
    nu = graph.nodes[u]
    nv = graph.nodes[v]
    return _haversine_m(nu["lat"], nu["lon"], nv["lat"], nv["lon"])


def _shortest_path_time(
    graph: nx.Graph, start: int, goal: int, speed_mps: float
) -> Tuple[Optional[List[int]], float, float]:
    """
    A*로 경로 탐색 (휴리스틱: 하버사인 직선거리).
    반환: path, 총거리(m), 시간(분)
    """
    try:
        path = nx.astar_path(graph, start, goal, heuristic=lambda u, v: _heuristic(graph, u, v), weight="weight")
        dist_km_opt = _path_distance(graph, path)
        if dist_km_opt is None:
            return None, float("inf"), float("inf")
        dist_km = dist_km_opt
        time_min = (dist_km * 1000.0) / speed_mps / 60.0
        return path, dist_km, time_min
    except (nx.NetworkXNoPath, nx.NodeNotFound):
        return None, float("inf"), float("inf")


def _path_distance(graph: nx.Graph, path: List[int]) -> Optional[float]:
    """주어진 경로의 총 거리(km). 간선이 없으면 None."""
    if not path or len(path) < 2:
        return 0.0
    dist = 0.0
    for u, v in zip(path[:-1], path[1:]):
        if not graph.has_edge(u, v):
            return None
        w = graph.edges[u, v].get("weight", 0.0)
        dist += float(w)
    return dist


def _round_time_min(val: float) -> float:
    """표시용 시간 반올림. 0 표시 방지를 위해 최소 0.1분."""
    if math.isinf(val) or math.isnan(val):
        return 0.0
    return max(0.1, round(val, 1))


def _coords(graph: nx.Graph, path: Optional[List[int]]) -> List[Tuple[float, float]]:
    if not path:
        return []
    return [(graph.nodes[n]["lat"], graph.nodes[n]["lon"]) for n in path]


# -----------------------------
# 모드별 경로 찾기 (도보 / 자전거대여소 경유 / 전기자전거)
# -----------------------------
def find_path_modes(graph: nx.Graph, start_id: int, goal_id: int) -> Dict:
    """
    세 가지 모드 경로를 한 번에 반환:
      - walk: 전체 그래프 도보
      - bike: 자전거 대여소 경유 (자전거 속도)
      - ebike: 전기자전거 대여소 1곳을 거쳐 전기자전거로 이동
    """
    sub_g = _build_subgraph(graph, start_id, goal_id, SUBGRAPH_RADIUS_M)
    walk_g = _filter_graph_types(sub_g, allowed_types={"traffic"})
    # 전기자전거는 e_bicycle_station을 포함해야 함
    ebike_g = _filter_graph_types(sub_g, allowed_types={"traffic", "e_bicycle_station"})
    return {
        "walk": _find_walk(walk_g, start_id, goal_id),
        "bike": _find_bike_station(
            sub_g, start_id, goal_id, station_types=["bicycle_station"], speed_mps=BIKE_SPEED_MPS
        ),
        "ebike": _find_ebike_station(ebike_g, start_id, goal_id, speed_mps=EBIKE_SPEED_MPS),
    }


def _find_walk(graph: nx.Graph, start: int, goal: int) -> Dict:
    path, dist_km, time_min = _shortest_path_time(graph, start, goal, WALK_SPEED_MPS)
    if path is None:
        return {"success": False, "path": [], "distance": 0.0, "coordinates": [], "message": "경로 없음"}
    coords = _coords(graph, path)
    return {
        "success": True,
        "path": path,
        "distance": round(dist_km, 3),  # km
        "time_min": _round_time_min(time_min),
        "time_components": {
            "walk": _round_time_min(time_min),
            "ride": 0.0,
            "ride_type": "walk",
        },
        "time_segments": [
            {"type": "walk", "time_min": _round_time_min(time_min)},
        ],
        "coordinates": coords,
        "segments": [
            {"type": "walk", "coordinates": coords}
        ],
        "message": "도보 경로",
    }


def _find_bike_station(
    graph: nx.Graph,
    start: int,
    goal: int,
    station_types: List[str],
    speed_mps: float,
) -> Dict:
    stations = [n for n, d in graph.nodes(data=True) if d.get("type") in station_types]
    if not stations:
        return {"success": False, "path": [], "distance": 0.0, "coordinates": [], "message": "대여소 없음"}

    # 1) 출발지→대여소: 도보 속도
    start_candidates_full = []
    for t in stations:
        p, d, tm = _shortest_path_time(graph, start, t, WALK_SPEED_MPS)
        if p is not None:
            start_candidates_full.append((t, p, d, tm))
    start_candidates_full.sort(key=lambda x: x[2])
    start_candidates = start_candidates_full[:2]  # k=2

    # 2) 도착지←대여소: 도보 속도
    goal_candidates_full = []
    for t in stations:
        p, d, tm = _shortest_path_time(graph, t, goal, WALK_SPEED_MPS)
        if p is not None:
            goal_candidates_full.append((t, p, d, tm))
    goal_candidates_full.sort(key=lambda x: x[2])
    goal_candidates = goal_candidates_full[:2]  # k=2

    best = (float("inf"), None, None, None, None)  # dist, path_s, path_bike, path_g, (s_station, g_station)

    for s_station, path_s, dist_s, time_s in start_candidates:
        for g_station, path_g, dist_g, time_g in goal_candidates:
            path_bike, dist_bike, time_bike = _shortest_path_time(graph, s_station, g_station, speed_mps)
            if path_bike is None:
                    continue
            total_time = time_s + time_bike + time_g
            total_dist = dist_s + dist_bike + dist_g
            if total_time < best[0]:
                best = (total_time, (path_s, dist_s, time_s), (path_bike, dist_bike, time_bike), (path_g, dist_g, time_g), (s_station, g_station))

    if best[1] is None:
        return {"success": False, "path": [], "distance": 0.0, "coordinates": [], "message": "대여소 경유 경로 없음"}

    _, (path_s, dist_s, time_s), (path_bike, dist_bike, time_bike), (path_g, dist_g, time_g), (s_station, g_station) = best
    merged = path_s[:-1] + path_bike[:-1] + path_g  # 구간 끝 노드 중복 제거
    dist_km_opt = _path_distance(graph, merged)
    if dist_km_opt is None:
        return {"success": False, "path": [], "distance": 0.0, "coordinates": [], "message": "경로 없음"}
    dist_km = dist_km_opt
    time_min = time_s + time_bike + time_g
    coords = _coords(graph, merged)
    coords_walk1 = _coords(graph, path_s)
    coords_bike = _coords(graph, path_bike)
    coords_walk2 = _coords(graph, path_g)
    return {
        "success": True,
        "path": merged,
        "distance": round(dist_km, 3),  # km
        "time_min": _round_time_min(time_min),
        "time_components": {
            "walk": _round_time_min(time_s + time_g),
            "ride": _round_time_min(time_bike),
            "ride_type": "bike",
        },
        "time_segments": [
            {"type": "walk", "time_min": _round_time_min(time_s)},
            {"type": "bike", "time_min": _round_time_min(time_bike)},
            {"type": "walk", "time_min": _round_time_min(time_g)},
        ],
        "coordinates": coords,
        "segments": [
            {"type": "walk", "coordinates": coords_walk1},
            {"type": "bike", "coordinates": coords_bike},
            {"type": "walk", "coordinates": coords_walk2},
        ],
        "stations": [s_station, g_station],
        "message": "대여소 경유 경로",
    }


def _find_ebike_direct(graph: nx.Graph, start: int, goal: int, speed_mps: float) -> Dict:
    """
    전기자전거: 대여소 경유 없이 직접 이동. 속도는 EBike 속도 적용.
    """
    path, dist_km, time_min = _shortest_path_time(graph, start, goal, speed_mps)
    if path is None:
        return {"success": False, "path": [], "distance": 0.0, "coordinates": [], "message": "경로 없음"}
    coords = [(graph.nodes[n]["lat"], graph.nodes[n]["lon"]) for n in path]
    return {
        "success": True,
        "path": path,
        "distance": round(dist_km, 3),
        "time_min": _round_time_min(time_min),
        "coordinates": coords,
        "message": "전기자전거 경로",
    }


def _find_ebike_station(graph: nx.Graph, start: int, goal: int, speed_mps: float) -> Dict:
    """
    전기자전거: 출발→가장 가까운 e_bicycle_station 도보, 이후 전기자전거로 도착까지 이동.
    """
    stations = [n for n, d in graph.nodes(data=True) if d.get("type") == "e_bicycle_station"]
    if not stations:
        return {"success": False, "path": [], "distance": 0.0, "coordinates": [], "message": "전기자전거 없음"}

    # 출발지에서 도보 거리가 가장 가까운 전기자전거 대여소 1곳 선택
    nearest_station = None
    nearest_walk = None
    nearest_walk_dist = float("inf")
    nearest_walk_time = float("inf")
    for s_station in stations:
        path_walk, dist_walk, time_walk = _shortest_path_time(graph, start, s_station, WALK_SPEED_MPS)
        if path_walk is None:
            continue
        if dist_walk < nearest_walk_dist:
            nearest_station = s_station
            nearest_walk = path_walk
            nearest_walk_dist = dist_walk
            nearest_walk_time = time_walk

    if nearest_station is None or nearest_walk is None:
        return {"success": False, "path": [], "distance": 0.0, "coordinates": [], "message": "전기자전거 대여소 경로 없음"}

    # 선택한 대여소에서 전기자전거로 목적지까지 이동
    path_ride, dist_ride, time_ride = _shortest_path_time(graph, nearest_station, goal, speed_mps)
    if path_ride is None:
        return {"success": False, "path": [], "distance": 0.0, "coordinates": [], "message": "전기자전거 경로 없음"}

    merged = nearest_walk[:-1] + path_ride  # 대여소 중복 제거 후 연결
    dist_km_opt = _path_distance(graph, merged)
    if dist_km_opt is None:
        return {"success": False, "path": [], "distance": 0.0, "coordinates": [], "message": "경로 없음"}
    time_min = nearest_walk_time + time_ride
    coords = _coords(graph, merged)
    coords_walk = _coords(graph, nearest_walk)
    coords_ride = _coords(graph, path_ride)
    return {
        "success": True,
        "path": merged,
        "distance": round(dist_km_opt, 3),
        "time_min": _round_time_min(time_min),
        "time_components": {
            "walk": _round_time_min(nearest_walk_time),
            "ride": _round_time_min(time_ride),
            "ride_type": "ebike",
        },
        "time_segments": [
            {"type": "walk", "time_min": _round_time_min(nearest_walk_time)},
            {"type": "ebike", "time_min": _round_time_min(time_ride)},
        ],
        "coordinates": coords,
        "segments": [
            {"type": "walk", "coordinates": coords_walk},
            {"type": "ebike", "coordinates": coords_ride},
        ],
        "stations": [nearest_station],
        "message": "전기자전거 경로",
    }


# -----------------------------
# 서브그래프 생성 (반경 내 노드만 포함)
# -----------------------------
def _build_subgraph(graph: nx.Graph, start: int, goal: int, radius_m: float) -> nx.Graph:
    if start not in graph or goal not in graph:
        return graph

    def collect(center: int, acc: Set[int]):
        cdata = graph.nodes[center]
        clat, clon = cdata["lat"], cdata["lon"]
        for n, d in graph.nodes(data=True):
            dist = _haversine_m(clat, clon, d["lat"], d["lon"])
            if dist <= radius_m:
                acc.add(n)

    keep: Set[int] = set()
    collect(start, keep)
    collect(goal, keep)

    # 최소한 start/goal은 포함
    keep.add(start)
    keep.add(goal)

    # 서브그래프 반환
    return graph.subgraph(keep).copy()


# -----------------------------
# 노드 타입 필터링 (start/goal은 항상 유지)
# -----------------------------
def _filter_graph_types(graph: nx.Graph, allowed_types: Set[str]) -> nx.Graph:
    nodes_to_keep = []
    for n, d in graph.nodes(data=True):
        if d.get("type") in allowed_types or d.get("forced_keep"):
            nodes_to_keep.append(n)
    return graph.subgraph(nodes_to_keep).copy()


def _nearest_k(graph: nx.Graph, src: int, targets: List[int], k: int = 3):
    heap = []
    for t in targets:
        path, dist = _shortest_path_distance(graph, src, t)
        if path is None:
            continue
        heapq.heappush(heap, (dist, t, path))
    heap.sort(key=lambda x: x[0])
    return [(t, p, d) for d, t, p in heap[:k]]


def _shortest_path_distance(graph: nx.Graph, start: int, goal: int) -> Tuple[Optional[List[int]], float]:
    """
    거리만 필요할 때(시간 계산 불필요): A* 휴리스틱을 그대로 사용.
    """
    try:
        path = nx.astar_path(graph, start, goal, heuristic=lambda u, v: _heuristic(graph, u, v), weight="weight")
        return path, _path_distance(graph, path)
    except (nx.NetworkXNoPath, nx.NodeNotFound):
        return None, float("inf")


# -----------------------------
# 단일 기본 경로 API (기존 인터페이스 호환)
# -----------------------------
def find_path(graph: nx.Graph, start_id: int, goal_id: int) -> Dict:
    """기본: 그래프 전체를 사용한 Dijkstra 기반 최단 경로."""
    return _find_walk(graph, start_id, goal_id)

