import os
import pandas as pd
import json

PORT = 5001

# 현재 파일의 디렉토리를 기준으로 절대 경로 생성
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
data_folder = os.path.join(BASE_DIR, "data")
node_json_file = os.path.join(data_folder, "node.json")
bicycle_file = os.path.join(data_folder, "bicycle_rental_position.csv")

# 서울 노드 데이터 로드
with open(node_json_file, "r", encoding="utf-8") as f:
    node_data = json.load(f)

# 자전거 대여소 데이터 로드
bicycle = pd.read_csv(bicycle_file, skiprows=9, encoding='utf-8')
bicycle_data = bicycle.iloc[:, [4, 5]]
bicycle_data.columns = ['위도', '경도']
