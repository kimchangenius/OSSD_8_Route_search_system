# export_graph.py
import pandas as pd
import networkx as nx
from graph_builder import build_graph

def export_graph():
    G = build_graph()  # 기존 코드 그대로 사용

    # 1) node label -> 0 ~ N-1 정수 ID 부여
    nodes = list(G.nodes())
    id_map = {node: idx for idx, node in enumerate(nodes)}

    # 2) 노드 파일 만들기 (예: id, lat, lon)
    node_rows = []
    for node in nodes:
        data = G.nodes[node]
        node_rows.append({
            "id": id_map[node],
            "lat": data["lat"],   # 실제 속성 이름에 맞게 수정
            "lon": data["lon"],
        })
    nodes_df = pd.DataFrame(node_rows)
    nodes_df.to_csv("nodes.csv", index=False)

    # 3) 엣지 파일 만들기 (예: u, v, weight)
    edge_rows = []
    for u, v, data in G.edges(data=True):
        edge_rows.append({
            "u": id_map[u],
            "v": id_map[v],
            "weight": data.get("weight", 1.0),
        })
    edges_df = pd.DataFrame(edge_rows)
    edges_df.to_csv("edges.csv", index=False)

    # 4) (선택) 원래 node label ↔ int ID 매핑도 저장해두면 좋음
    map_df = pd.DataFrame([
        {"orig": node, "id": id_map[node]} for node in nodes
    ])
    map_df.to_csv("node_id_map.csv", index=False)

    print("nodes.csv / edges.csv / node_id_map.csv 생성 완료")

if __name__ == "__main__":
    export_graph()
