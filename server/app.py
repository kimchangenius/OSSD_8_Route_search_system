import socketio
from sanic import Sanic
import asyncio
import logging
import server.config as cfg
import server.graph_builder as graph_builder
import server.path_finder as path_finder

# 로깅 설정
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# 포트 설정
port = cfg.PORT
sio = socketio.AsyncServer(async_mode='sanic')
# 앱 설정
app = Sanic(name='server')
app.enable_websocket(True)
app.config['CORS_SUPPORTS_CREDENTIALS'] = True

# 소켓 연결
sio.attach(app)

# 그래프 설정
graph = graph_builder.build_graph()

# 세션 관리
session_dict = {}

# CORS 설정
@app.middleware("response")
async def add_cors_headers(request, response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"


@sio.on("connect")
async def connect(sid, environ):
    global session_dict
    session_dict[sid] = {}
    print("connect", f"(sid : {sid})")
    await sio.emit("connection_response", "handshake success", room=sid)


@sio.on("disconnect")
async def disconnect(sid):
    if sid in session_dict:
        del session_dict[sid]
    print("disconnect", f"(sid : {sid})")


@sio.on("find_path")
async def find_path_socket(sid, data):
    """
    Socket.IO를 통한 경로 탐색
    
    Request Data:
    {
        "start_id": int,  # 시작 노드 ID
        "goal_id": int    # 목표 노드 ID
    }
    
    Response (emit):
    {
        "success": bool,
        "path": List[int],           # 경로 노드 ID 리스트
        "distance": float,           # 총 거리 (km)
        "coordinates": List[tuple],  # 좌표 리스트
        "message": str
    }
    """
    try:
        start_id = data.get("start_id")
        goal_id = data.get("goal_id")
        
        print(f"find_path request (sid: {sid}): start={start_id}, goal={goal_id}")
        
        # 입력 검증
        if start_id is None or goal_id is None:
            await sio.emit("find_path_response", {
                "success": False,
                "message": "start_id와 goal_id가 필요합니다."
            }, room=sid)
            return
        
        # 경로 탐색
        result = path_finder.find_path(graph, start_id, goal_id)
        
        # 결과 전송
        await sio.emit("find_path_response", result, room=sid)
        print(f"find_path response sent (sid: {sid}): {result['message']}")
    
    except Exception as e:
        logger.error(f"경로 탐색 오류 (sid: {sid}): {str(e)}")
        await sio.emit("find_path_response", {
            "success": False,
            "message": f"서버 오류: {str(e)}"
        }, room=sid)


@sio.on("get_graph_info")
async def get_graph_info_socket(sid, data):
    """
    Socket.IO를 통한 그래프 정보 조회
    
    Response (emit):
    {
        "success": bool,
        "num_nodes": int,
        "num_edges": int,
        "node_types": dict
    }
    """
    try:
        # 노드 타입별 개수 계산
        node_types = {}
        for node_id, data in graph.nodes(data=True):
            node_type = data.get('type', 'unknown')
            node_types[node_type] = node_types.get(node_type, 0) + 1
        
        result = {
            "success": True,
            "num_nodes": graph.number_of_nodes(),
            "num_edges": graph.number_of_edges(),
            "node_types": node_types
        }
        
        await sio.emit("graph_info_response", result, room=sid)
        print(f"graph_info response sent (sid: {sid}): {graph.number_of_nodes()} nodes, {graph.number_of_edges()} edges")
    
    except Exception as e:
        logger.error(f"그래프 정보 조회 오류 (sid: {sid}): {str(e)}")
        await sio.emit("graph_info_response", {
            "success": False,
            "message": f"서버 오류: {str(e)}"
        }, room=sid)


@sio.on("get_nodes")
async def get_nodes_socket(sid, data):
    """
    Socket.IO를 통한 노드 목록 조회
    
    Request Data:
    {
        "node_type": str,  # 'traffic_node' 또는 'bicycle_station' (선택)
        "limit": int       # 반환할 최대 노드 수 (기본값: 100)
    }
    
    Response (emit):
    {
        "success": bool,
        "nodes": [
            {
                "id": int,
                "lat": float,
                "lon": float,
                "type": str
            },
            ...
        ],
        "total": int
    }
    """
    try:
        node_type_filter = data.get("node_type")
        limit = data.get("limit", 100)
        
        nodes = []
        for node_id, node_data in graph.nodes(data=True):
            if node_type_filter and node_data.get('type') != node_type_filter:
                continue
            
            nodes.append({
                "id": node_id,
                "lat": node_data.get('lat'),
                "lon": node_data.get('lon'),
                "type": node_data.get('type')
            })
            
            if len(nodes) >= limit:
                break
        
        result = {
            "success": True,
            "nodes": nodes,
            "total": len(nodes)
        }
        
        await sio.emit("nodes_response", result, room=sid)
        print(f"nodes response sent (sid: {sid}): {len(nodes)} nodes")
    
    except Exception as e:
        logger.error(f"노드 조회 오류 (sid: {sid}): {str(e)}")
        await sio.emit("nodes_response", {
            "success": False,
            "message": f"서버 오류: {str(e)}"
        }, room=sid)


# 서버 정리
@app.listener("before_server_stop")
async def cleanup_tasks(app, loop):
    pending = asyncio.all_tasks(loop=loop)
    for task in pending:
        print(f"Cancelling task: {task}")
        task.cancel()
    await asyncio.gather(*pending, return_exceptions=True)


@app.listener("after_server_stop")
async def after_stop(app, loop):
    print("Server stopped. Cleaning up...")
    await sio.close()

# main 문 실행
if __name__ == '__main__':
    app.run(host='0.0.0.0', port=port)