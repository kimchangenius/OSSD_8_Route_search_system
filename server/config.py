import os
import pandas as pd

PORT = 5001

# 현재 파일의 디렉토리를 기준으로 절대 경로 생성
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
data_folder = os.path.join(BASE_DIR, "data")
node_file = os.path.join(data_folder, "seoul_traffic_node.csv")
bicycle_file = os.path.join(data_folder, "bicycle_rental_position.csv")

node = pd.read_csv(node_file, encoding='utf-8')
node_data = node[["Y좌표", "X좌표"]]
node_data.columns = ['위도', '경도']

bicycle = pd.read_csv(bicycle_file, skiprows=9, encoding='utf-8')
bicycle_data = bicycle.iloc[:, [4, 5]]
bicycle_data.columns = ['위도', '경도']
