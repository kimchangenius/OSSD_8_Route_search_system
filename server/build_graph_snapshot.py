import os
import networkx as nx
import pickle
import config as cfg
import graph_builder


def main():
    print("그래프 스냅샷 생성 시작...")
    graph = graph_builder.build_graph()
    os.makedirs(os.path.dirname(cfg.graph_pickle_file), exist_ok=True)
    with open(cfg.graph_pickle_file, "wb") as f:
        pickle.dump(graph, f, protocol=pickle.HIGHEST_PROTOCOL)
    print(
        f"그래프 스냅샷 저장 완료: {cfg.graph_pickle_file} "
        f"({graph.number_of_nodes()} 노드, {graph.number_of_edges()} 엣지)"
    )


if __name__ == "__main__":
    main()

