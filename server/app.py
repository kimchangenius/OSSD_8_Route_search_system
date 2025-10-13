from sanic import Sanic, json
from sanic.response import json as json_response
import logging
import subprocess
import signal
import time
import config as cfg
import graph_builder
import path_finder

# 로깅 설정
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# 포트 설정
port = cfg.PORT

# 앱 설정
app = Sanic(name='server')
app.config['CORS_SUPPORTS_CREDENTIALS'] = True

# 그래프 설정 (전역 변수로 선언, main에서 초기화)
graph = None

# CORS 설정
@app.middleware("response")
async def add_cors_headers(request, response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"

# OPTIONS 요청 처리 (CORS preflight)
@app.options("/<path:path>")
async def options_handler(request, path):
    return json_response({}, status=200)

# 헬스 체크
@app.get("/api/health")
async def health_check(request):
    """서버 상태 확인"""
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
        
        # path_finder.find_path 함수 실행
        result = path_finder.find_path(graph, start_id, goal_id)
        
        # 응답 구성
        response = {
            "path": result.get("path", []),
            "distance": result.get("distance", 0),
            "coordinates": result.get("coordinates", [])
        }
        
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

# 서버 시작 전 그래프 초기화
@app.listener("before_server_start")
async def setup_graph(app, loop):
    global graph
    graph = graph_builder.build_graph()
    print(f"그래프 초기화 완료: {graph.number_of_nodes()} 노드, {graph.number_of_edges()} 엣지")

# main 문 실행
if __name__ == '__main__':
    # 포트 확인 및 정리
    kill_process_on_port(port)
    
    print(f"{'='*60}")
    print(f"🚀 REST API 서버 시작")
    print(f"{'='*60}")
    print(f"📍 URL: http://localhost:{port}")
    print(f"\n📡 API 엔드포인트:")
    print(f"   GET  /api/health      - 서버 상태 확인")
    print(f"   GET  /api/nodes       - 노드 목록 조회")
    print(f"   POST /api/find-path   - 경로 탐색")
    print(f"{'='*60}\n")
    
    app.run(
        host='0.0.0.0', 
        port=port,
        access_log=True
    )
