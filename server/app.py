import resource
from sanic import Sanic, json
from sanic.response import json as json_response, empty
import logging
import subprocess
import signal
import time
import os
import networkx as nx
import pickle
import config as cfg
import path_finder

# 로깅 설정
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# 포트 설정
port = cfg.PORT

# 앱 설정
app = Sanic(name='server')
# CORS(app, resources={r"/api/*": {"origins": ["http://localhost:3000"]}})
app.config['CORS_SUPPORTS_CREDENTIALS'] = True

# 그래프 및 CCH는 app.ctx에 저장 (워커 프로세스 간 공유)

# CORS 설정
@app.middleware("response")
async def add_cors_headers(request, response):
    origin = request.headers.get("origin", "*")
    response.headers["Access-Control-Allow-Origin"] = origin
    response.headers["Access-Control-Allow-Headers"] = \
        request.headers.get("Access-Control-Request-Headers", "Content-Type, Authorization")
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    response.headers["Access-Control-Allow-Credentials"] = "true"


@app.route("/api/find-path", methods=["OPTIONS"])
async def find_path_preflight(request):
    return empty(status=204)


@app.route("/api/nodes", methods=["OPTIONS"])
async def nodes_preflight(request):
    return empty(status=204)

@app.route("/api/find-path-modes", methods=["OPTIONS"])
async def find_path_modes_preflight(request):
    return empty(status=204)

# 헬스 체크
@app.get("/api/health")
async def health_check(request):
    """서버 상태 확인"""
    graph = app.ctx.graph
    return json_response({
        "status": "ok",
        "nodes_count": graph.number_of_nodes() if graph else 0,
        "edges_count": graph.number_of_edges() if graph else 0
    })

# 노드 조회 API
@app.get("/api/nodes")
async def get_nodes(request):
    """
    그래프의 모든 노드 정보를 반환
    
    Response:
    {
        "nodes": [
            {"id": node_id, "lat": lat, "lon": lon, "type": type},
        ...
    ]
    }
    """
    try:
        graph = app.ctx.graph
        nodes = []
        
        # 그래프의 모든 노드 정보를 가져옴
        for node_id, node_data in graph.nodes(data=True):
            nodes.append({
                "id": node_id,
                "lat": node_data["lat"],
                "lon": node_data["lon"],
                "type": node_data.get("type", "traffic")
            })
        
        logger.info(f"노드 조회 성공: {len(nodes)}개")
        return json_response({
            "nodes": nodes,
            "count": len(nodes)
        })
    
    except Exception as e:
        logger.error(f"노드 조회 오류: {str(e)}")
        return json_response({
            "error": str(e),
            "nodes": []
        }, status=500)

# 경로 찾기 API
@app.post("/api/find-path")
async def find_path_api(request):
    """
    경로 탐색 API
    
    Request Body:
    {
        "start_id": int,  # 시작 노드 ID
        "goal_id": int    # 목표 노드 ID
    }
    
    Response:
    {
        "path": List[int],           # 경로 노드 ID 리스트
        "distance": float,           # 총 거리 (km)
        "coordinates": List[tuple]   # 좌표 리스트
    }
    """
    try:
        data = request.json
        start_id = data.get("start_id")
        goal_id = data.get("goal_id")
        
        if start_id is None or goal_id is None:
            return json_response({
                "error": "start_id and goal_id are required"
            }, status=400)
        
        logger.info(f"경로 탐색 요청: start={start_id}, goal={goal_id}")
        
        # path_finder.find_path 함수 실행 (Dijkstra 기반)
        graph = app.ctx.graph
        result = path_finder.find_path(graph, start_id, goal_id)
        
        # 응답 구성
        response = {
            "path": result.get("path", []),
            "distance": result.get("distance", 0),
            "coordinates": result.get("coordinates", []),
            "success": result.get("success", False),
            "message": result.get("message", "")
        }
        
        # 경로가 없거나 실패한 경우에도 200 OK 반환 (프론트엔드에서 처리)
        if not result.get("success", False) or len(result.get("path", [])) == 0:
            logger.warning(f"경로 탐색 실패: {result.get('message', 'Unknown error')} (start={start_id}, goal={goal_id})")
            # 노드가 그래프에 있는지 확인
            if start_id not in graph:
                logger.warning(f"시작 노드 {start_id}가 그래프에 없습니다.")
            if goal_id not in graph:
                logger.warning(f"목표 노드 {goal_id}가 그래프에 없습니다.")
            return json_response(response)  # 200 OK 반환
        
        logger.info(f"경로 탐색 성공: {len(response['path'])} nodes, {response['distance']}km")
        return json_response(response)
    
    except Exception as e:
        logger.error(f"경로 탐색 오류: {str(e)}")
        return json_response({
            "error": str(e),
            "path": [],
            "distance": 0,
            "coordinates": []
        }, status=500)


# 모드별 경로 조회 (도보/자전거/전기자전거)
@app.post("/api/find-path-modes")
async def find_path_modes_api(request):
    try:
        data = request.json or {}
        start_id = data.get("start_id")
        goal_id = data.get("goal_id")

        if start_id is None or goal_id is None:
            logger.warning(f"모드별 경로 요청 실패: start_id/goal_id 누락. payload={data}")
            return json_response({"error": "start_id and goal_id are required"}, status=400)

        # 정수 변환 시도 (문자열로 들어오는 경우 대비)
        try:
            start_id = int(start_id)
            goal_id = int(goal_id)
        except Exception:
            logger.warning(f"모드별 경로 요청 실패: ID 타입 오류. payload={data}")
            return json_response({"error": "start_id and goal_id must be integers"}, status=400)

        logger.info(f"모드별 경로 요청: start={start_id}, goal={goal_id}")
        graph = app.ctx.graph
        result_raw = path_finder.find_path_modes(graph, start_id, goal_id)

        def ensure_time_segments(mode_res):
            if not isinstance(mode_res, dict):
                return mode_res
            if mode_res.get("time_segments"):
                return mode_res
            comp = mode_res.get("time_components") or {}
            walk = comp.get("walk")
            ride = comp.get("ride")
            ride_type = comp.get("ride_type")
            segments = []
            if walk:
                segments.append({"type": "walk", "time_min": walk})
            if ride and ride_type in ("bike", "ebike"):
                segments.append({"type": "bike" if ride_type == "bike" else "ebike", "time_min": ride})
            if segments:
                new_res = dict(mode_res)
                new_res["time_segments"] = segments
                return new_res
            return mode_res

        result = {
            "walk": ensure_time_segments(result_raw.get("walk")),
            "bike": ensure_time_segments(result_raw.get("bike")),
            "ebike": ensure_time_segments(result_raw.get("ebike")),
        }

        logger.info(
            "모드별 경로 응답: walk=%s(segments:%s), bike=%s(segments:%s), ebike=%s(segments:%s)",
            bool(result.get("walk", {}).get("success")),
            len(result.get("walk", {}).get("time_segments") or []),
            bool(result.get("bike", {}).get("success")),
            len(result.get("bike", {}).get("time_segments") or []),
            bool(result.get("ebike", {}).get("success")),
            len(result.get("ebike", {}).get("time_segments") or []),
        )
        return json_response(result)
    except Exception as e:
        logger.error(f"모드별 경로 탐색 오류: {str(e)}")
        return json_response({"error": str(e)}, status=500)

def kill_process_on_port(port):
    """
    지정된 포트를 사용하는 프로세스를 강제 종료
    
    Args:
        port (int): 확인할 포트 번호
    """
    try:
        # lsof 명령으로 포트를 사용하는 프로세스 찾기
        result = subprocess.run(
            ['lsof', '-ti', f':{port}'],
            capture_output=True,
            text=True
        )
        
        if result.stdout.strip():
            # 프로세스 ID 목록 가져오기
            pids = result.stdout.strip().split('\n')
            print(f"⚠️  포트 {port}이(가) 사용 중입니다. 프로세스 종료 중...")
            
            for pid in pids:
                try:
                    pid = int(pid)
                    # SIGKILL 시그널로 강제 종료
                    subprocess.run(['kill', '-9', str(pid)], check=True)
                    print(f"   ✅ 프로세스 {pid} 종료됨")
                except Exception as e:
                    print(f"   ⚠️  프로세스 {pid} 종료 실패: {e}")
            
            # 프로세스 종료 대기
            time.sleep(2)
            print(f"✅ 포트 {port} 정리 완료\n")
            
    except FileNotFoundError:
        # lsof 명령이 없는 경우 (Windows 등)
        print(f"⚠️  lsof 명령을 찾을 수 없습니다. 포트 확인을 건너뜁니다.\n")
    except Exception as e:
        print(f"⚠️  포트 확인 중 오류 발생: {e}\n")

# 서버 시작 전 그래프 초기화 (Dijkstra 기반)
@app.listener("before_server_start")
async def setup_graph(app, loop):
    print("워커 프로세스 시작: 그래프 스냅샷 로드 중...")
    graph_pickle = cfg.graph_pickle_file

    if not graph_pickle or not os.path.exists(graph_pickle):
        msg = f"그래프 스냅샷을 찾을 수 없습니다: {graph_pickle}. 먼저 스냅샷을 생성하세요."
        print(msg)
        raise RuntimeError(msg)

    try:
        with open(graph_pickle, "rb") as f:
            graph = pickle.load(f)
        print(f"그래프 스냅샷 로드 완료: {graph.number_of_nodes()} 노드, {graph.number_of_edges()} 엣지")
    except Exception as e:
        msg = f"그래프 스냅샷 로드 실패: {e}"
        print(msg)
        raise

    app.ctx.graph = graph

# main 문 실행
if __name__ == '__main__':
    # 포트 확인 및 정리
    kill_process_on_port(port)
    
    print(f"{'='*60}")
    print(f"🚀 REST API 서버 시작")
    print(f"{'='*60}")
    print(f"📍 URL: http://localhost:{port}")
    print(f"{'='*60}\n")
    
    print("서버 시작 중... (그래프는 워커 프로세스에서 로드됩니다)\n")
    
    # 단일 프로세스 모드로 실행하여 타임아웃 문제 해결
    app.run(
        host='0.0.0.0', 
        port=port,
        debug=False,
        auto_reload=False,
        single_process=True  # 멀티프로세싱 비활성화
    )
