# CCH (Contraction Hierarchies) 알고리즘 경로 탐색

## 📚 개요

서울시 교통 노드와 자전거 대여소 데이터를 기반으로 한 고속 경로 탐색 시스템입니다.
CCH(Contraction Hierarchies) 알고리즘을 사용하여 효율적인 최단 경로 탐색을 제공합니다.

## 🏗️ 시스템 구조

### 1. 데이터 구조
- **node_data**: 서울시 교통 노드 (약 10,178개)
- **bicycle_data**: 서울시 자전거 대여소 (약 2,800개)
- 모든 노드는 [위도, 경도] 형식으로 통일

### 2. 그래프 구성
- **노드**: 교통 노드 + 자전거 대여소
- **엣지**: K-NN 알고리즘으로 자동 생성 (각 노드당 8개의 최근접 이웃)
- **가중치**: Haversine 거리 (km)
- **최대 연결 거리**: 10km

### 3. 알고리즘

#### CCH (Contraction Hierarchies)
- **전처리 단계**: 노드를 중요도 순서로 contraction 수행
- **쿼리 단계**: Bidirectional Dijkstra로 고속 경로 탐색
- **시간 복잡도**: 
  - 전처리: O(n log n)
  - 쿼리: O(log n) ~ O(√n)

## 🚀 사용법

### 1. 의존성 설치

```bash
cd server
pip install -r requirements.txt
```

### 2. 서버 실행

```bash
python app.py
```

서버가 시작되면 그래프 구축과 CCH 전처리가 자동으로 수행됩니다:
```
그래프 구축 시작...
총 12978개 노드 추가 완료
엣지 추가 중...
총 51912개 엣지 추가 완료
그래프 구축 완료!
```

### 3. API 사용

#### 3.1 경로 탐색 - Socket.IO (권장)

**이벤트**: `find_path`

**클라이언트 코드 예시 (JavaScript)**:
```javascript
import io from 'socket.io-client';

const socket = io('http://localhost:5000');

// 연결 확인
socket.on('connection_response', (data) => {
  console.log('연결됨:', data);
});

// 경로 탐색 요청
socket.emit('find_path', {
  start_id: 1,
  goal_id: 100
});

// 결과 수신
socket.on('find_path_response', (result) => {
  console.log('결과:', result);
  // {
  //   success: true,
  //   path: [1, 45, 78, 92, 100],
  //   distance: 3.456,
  //   coordinates: [[37.57, 127.02], ...],
  //   message: "경로 탐색 성공: 5개 노드, 3.456km"
  // }
});
```

**React 컴포넌트**: `client/src/PathFinder.js` 참고

#### 3.2 경로 탐색 - REST API

**엔드포인트**: `POST /api/find-path`

**요청 예시**:
```bash
curl -X POST http://localhost:5000/api/find-path \
  -H "Content-Type: application/json" \
  -d '{
    "start_id": 1,
    "goal_id": 100
  }'
```

**응답 예시**:
```json
{
  "success": true,
  "path": [1, 45, 78, 92, 100],
  "distance": 3.456,
  "coordinates": [
    [37.5755809, 127.0232274],
    [37.5769821, 127.0245123],
    ...
  ],
  "message": "경로 탐색 성공: 5개 노드, 3.456km"
}
```

#### 3.3 그래프 정보 API

**엔드포인트**: `GET /api/graph-info`

**응답 예시**:
```json
{
  "success": true,
  "num_nodes": 12978,
  "num_edges": 51912,
  "node_types": {
    "traffic_node": 10178,
    "bicycle_station": 2800
  }
}
```

#### 3.4 노드 조회 API

**엔드포인트**: `GET /api/nodes?node_type=bicycle_station&limit=10`

**응답 예시**:
```json
{
  "success": true,
  "nodes": [
    {
      "id": 10179,
      "lat": 37.56999969,
      "lon": 126.9710999,
      "type": "bicycle_station"
    },
    ...
  ],
  "total": 10
}
```

## 💻 Python 코드에서 직접 사용

```python
import server.config as cfg
import server.graph_builder as graph_builder
import server.path_finder as path_finder

# 그래프 구축
graph = graph_builder.build_graph()

# 경로 탐색
result = path_finder.find_path(
    graph=graph,
    start_id=1,
    goal_id=100,
    use_cache=True  # CCH 전처리 결과 캐싱
)

print(f"경로: {result['path']}")
print(f"거리: {result['distance']} km")
print(f"좌표: {result['coordinates']}")
```

## 🔧 설정 및 최적화

### graph_builder.py 설정

```python
# K-NN 이웃 수 (기본값: 8)
_add_edges_knn(graph, node_positions, k=8)

# 최대 연결 거리 (기본값: 10km)
if distance_km > 10.0:
    continue
```

### path_finder.py 설정

CCH 알고리즘은 첫 실행 시 전처리를 수행하며, `use_cache=True`로 설정하면 
전처리 결과를 재사용합니다.

```python
result = path_finder.find_path(graph, start, goal, use_cache=True)
```

## 📊 성능

- **노드 수**: ~13,000개
- **엣지 수**: ~52,000개
- **전처리 시간**: 약 2-5분 (최초 1회만)
- **쿼리 시간**: 약 0.01-0.1초

## 🔍 알고리즘 상세

### 1. 그래프 구축 (graph_builder.py)

```python
def build_graph():
    # 1. 노드 추가 (교통 노드 + 자전거 대여소)
    # 2. K-NN으로 엣지 생성 (BallTree 사용)
    # 3. haversine 라이브러리로 거리 계산 및 가중치 설정
```

### 2. CCH 전처리 (path_finder.py)

```python
def preprocess():
    # 1. 노드 중요도 계산 (Edge Difference)
    # 2. 중요도가 낮은 노드부터 contract
    # 3. Shortcut 생성 및 계층 구조 생성
```

### 3. 경로 탐색 (path_finder.py)

```python
def query(start, goal):
    # 1. Bidirectional Dijkstra
    # 2. 상위 레벨 노드로만 이동
    # 3. 두 탐색이 만나는 지점에서 최단 경로 재구성
```

## 🎯 활용 예시

### 1. 최단 경로 찾기
```python
# 자전거 대여소 A에서 교통 노드 B까지 최단 경로
result = path_finder.find_path(graph, 10179, 5000)
```

### 2. 가까운 자전거 대여소 찾기
```python
# 특정 위치에서 가장 가까운 자전거 대여소
from haversine import haversine, Unit

my_location = (37.5665, 126.9780)  # 위도, 경도
min_distance = float('inf')
nearest_station = None

for node_id, data in graph.nodes(data=True):
    if data['type'] == 'bicycle_station':
        dist = haversine(my_location, (data['lat'], data['lon']), unit=Unit.KILOMETERS)
        if dist < min_distance:
            min_distance = dist
            nearest_station = node_id
```

## 📝 참고 자료

- [Contraction Hierarchies 논문](https://ad-publications.cs.uni-freiburg.de/ACM_ch_contracts_mfcs08.pdf)
- [NetworkX 문서](https://networkx.org/)
- [Haversine 라이브러리](https://github.com/mapado/haversine)
- [Haversine Formula](https://en.wikipedia.org/wiki/Haversine_formula)

## 🐛 문제 해결

### 메모리 부족
- K-NN의 k 값을 줄이세요 (8 → 6)
- 최대 연결 거리를 줄이세요 (10km → 5km)

### 전처리 시간이 너무 길 때
- 데이터를 샘플링하여 사용
- 또는 전처리 결과를 파일로 저장하여 재사용

### 경로를 찾지 못할 때
- 그래프가 연결되어 있는지 확인
- K 값이나 최대 연결 거리를 늘려보세요

