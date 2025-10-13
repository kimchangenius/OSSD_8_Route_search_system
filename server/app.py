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
    session_dict[sid] = {}
    print("connect", f"(sid : {sid})")
    await sio.emit("connection_response", "handshake success", room=sid)


@sio.on("disconnect")
async def disconnect(sid):
    if sid in session_dict:
        del session_dict[sid]
    print("disconnect", f"(sid : {sid})")

# Node 조회
@sio.on("get_nodes")
async def get_nodes(sid, data):
    """
    그래프의 모든 노드 정보를 반환
    
    Response (emit):
    [
        {"id": node_id, "lat": lat, "lon": lon},
        ...
    ]
    """
    try:
        nodes = []
        
        # 그래프의 모든 노드 정보를 가져옴
        for node_id, node_data in graph.nodes(data=True):
            nodes.append({
                "id": node_id,
                "lat": node_data["lat"],
                "lon": node_data["lon"]
            })
        
        # 클라이언트에 노드 정보 전송
        await sio.emit("nodes_response", nodes, room=sid)
        print(f"nodes_response sent (sid: {sid}): {len(nodes)} nodes")
    
    except Exception as e:
        logger.error(f"노드 조회 오류 (sid: {sid}): {str(e)}")
        await sio.emit("nodes_response", [], room=sid)


# 경로 찾기
@sio.on("find_path")
async def find_path_handler(sid, data):
    """
    경로 탐색 이벤트 처리
    
    Request Data:
    {
        "start_id": int,  # 시작 노드 ID
        "goal_id": int    # 목표 노드 ID
    }
    
    Response (emit):
    {
        "path": List[int],           # 경로 노드 ID 리스트
        "distance": float,           # 총 거리 (km)
        "coordinates": List[tuple]   # 좌표 리스트
    }
    """
    try:
        start_id = data.get("start_id")
        goal_id = data.get("goal_id")
        
        print(f"find_path request (sid: {sid}): start={start_id}, goal={goal_id}")
        
        # path_finder.find_path 함수 실행
        result = path_finder.find_path(graph, start_id, goal_id)
        
        # success와 message 제외한 나머지만 추출
        response = {
            "path": result.get("path", []),
            "distance": result.get("distance", 0),
            "coordinates": result.get("coordinates", [])
        }
        
        # 클라이언트에 결과 전송
        await sio.emit("find_path_response", response, room=sid)
        print(f"find_path_response sent (sid: {sid}): {len(response['path'])} nodes, {response['distance']}km")
    
    except Exception as e:
        logger.error(f"경로 탐색 오류 (sid: {sid}): {str(e)}")
        await sio.emit("find_path_response", {
            "path": [],
            "distance": 0,
            "coordinates": []
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