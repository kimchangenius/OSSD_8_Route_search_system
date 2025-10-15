"""
데이터 전처리 스크립트

seoul_node.json과 node_data(CSV)를 비교하여
중복되지 않는 교통 노드만 추출하여 node_seoul_traffic.json으로 저장
"""

import os
import json
import pandas as pd
import config as cfg


def compare_coordinates(lat1, lon1, lat2, lon2, tolerance=0.00001):
    """
    두 좌표가 같은지 비교 (오차 허용)
    
    Args:
        lat1, lon1: 첫 번째 좌표
        lat2, lon2: 두 번째 좌표
        tolerance: 허용 오차 (기본값: 약 1m)
    
    Returns:
        bool: 좌표가 같으면 True
    """
    return abs(lat1 - lat2) < tolerance and abs(lon1 - lon2) < tolerance


def filter_unique_nodes():
    """
    seoul_node.json과 node_data를 비교하여
    중복되지 않는 노드만 추출
    """
    print("="*60)
    print("데이터 전처리 시작")
    print("="*60)
    
    # seoul_node 로드
    print(f"\n1. seoul_node.json 로드 중...")
    seoul_node_count = len(cfg.seoul_node)
    print(f"   ✅ {seoul_node_count}개 노드 로드 완료")
    
    # node_data (CSV) 로드
    print(f"\n2. node_data (CSV) 로드 중...")
    node_data_count = len(cfg.node_data)
    print(f"   ✅ {node_data_count}개 노드 로드 완료")
    
    # node_data의 좌표를 set으로 변환 (빠른 검색)
    print(f"\n3. 좌표 비교를 위한 데이터 구조 생성 중...")
    csv_coordinates = set()
    for index, row in cfg.node_data.iterrows():
        lat = row['위도']
        lon = row['경도']
        if pd.notna(lat) and pd.notna(lon):
            # 소수점 5자리로 반올림하여 비교
            csv_coordinates.add((round(lat, 5), round(lon, 5)))
    
    print(f"   ✅ {len(csv_coordinates)}개의 고유 좌표 생성 완료")
    
    # seoul_node에서 중복되지 않는 노드 필터링
    print(f"\n4. 중복 노드 필터링 중...")
    unique_nodes = {}
    duplicate_count = 0
    
    for node_id, node_info in cfg.seoul_node.items():
        lat = node_info.get('a')  # latitude
        lon = node_info.get('o')  # longitude
        
        if lat is None or lon is None:
            continue
        
        # 반올림된 좌표로 비교
        rounded_coord = (round(lat, 5), round(lon, 5))
        
        # CSV에 없는 노드만 추가
        if rounded_coord not in csv_coordinates:
            unique_nodes[node_id] = {
                "id": node_info.get('i'),
                "lat": lat,
                "lon": lon,
                "type": "traffic"
            }
        else:
            duplicate_count += 1
    
    print(f"      - 고유 노드: {len(unique_nodes)}개")
    print(f"      - 중복 노드: {duplicate_count}개")
    
    # JSON 파일로 저장
    print(f"\n5. node.json 저장 중...")
    output_file = os.path.join(cfg.data_folder, "node.json")
    
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(unique_nodes, f, ensure_ascii=False, indent=2)
    
    print(f"   ✅ 파일 저장 완료: {output_file}")
    
    # 통계 출력
    print(f"\n{'='*60}")
    print(f"전처리 완료!")
    print(f"{'='*60}")
    print(f"📊 통계:")
    print(f"   - seoul_node.json:          {seoul_node_count:,}개")
    print(f"   - node_data (CSV):          {node_data_count:,}개")
    print(f"   - 중복 제거 후:              {len(unique_nodes):,}개")
    print(f"   - 중복된 노드:               {duplicate_count:,}개")
    print(f"   - 압축률:                   {(1 - len(unique_nodes)/seoul_node_count)*100:.1f}%")
    print(f"{'='*60}\n")
    
    return unique_nodes


def main():
    """메인 실행 함수"""
    try:
        unique_nodes = filter_unique_nodes()
        print(f"✅ 전처리 성공! {len(unique_nodes)}개의 고유 노드가 저장되었습니다.")
        
    except Exception as e:
        print(f"❌ 오류 발생: {e}")
        import traceback
        traceback.print_exc()


if __name__ == '__main__':
    main()

