import React, { useEffect, useState, useRef } from "react";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import { Map as LeafletMap, LatLngExpression } from "leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

import LCanvasLayer from "./L.CanvasLayer";

import './App.css';

const API_URL = "http://localhost:5001/api";

const Maptiler_Key = "DFFxHHmQRoAl3CPIlnBb";

const mapTilerStyles: Record<string, string> = {
  black: `http://223.194.46.216:8665/api/maps/positron/{z}/{x}/{y}.png`,
  osm: `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`,
  basic: `https://api.maptiler.com/maps/basic/{z}/{x}/{y}.png?key=${Maptiler_Key}`,
  streets: `https://api.maptiler.com/maps/streets/{z}/{x}/{y}.png?key=${Maptiler_Key}`,
  satellite: `https://api.maptiler.com/maps/hybrid/{z}/{x}/{y}.jpg?key=${Maptiler_Key}`
};

// 노드 타입 정의
interface Node {
  lat: number;
  lon: number;
  id: number;
  type: string;
}

// MapViewUpdater 컴포넌트
interface MapViewUpdaterProps {
  center: LatLngExpression;
  zoom: number;
}

function MapViewUpdater({ center, zoom }: MapViewUpdaterProps) {
  const map = useMap();
  useEffect(() => {
    if (center) {
      map.setView(center, zoom);
    }
  }, [center, zoom, map]);
  return null;
}

// API 응답 타입 정의
interface NodesResponse {
  nodes: {
    id: number;
    lat: number;
    lon: number;
    type: string;
  }[];
  count: number;
}

function App() {
  // API 상태
  const [isConnected, setIsConnected] = useState<boolean>(false);

  // Road Map
  const [useCanvasLayer, setUseCanvasLayer] = useState<boolean>(false);
  const roadRef = useRef<LeafletMap | null>(null);
  const canvasLayerRef = useRef<any>(null);
  const [mapStyle, setMapStyle] = useState<string>("black");
  const [mapCenter] = useState<LatLngExpression>([37.65146111, 127.0583889]);
  const [mapZoom] = useState<number>(15);
  
  // Node
  const [seoulNode, setSeoulNode] = useState<Node[]>([]);
  const [bicycleNode, setBicycleNode] = useState<Node[]>([]);

  // API로 노드 데이터 가져오기
  useEffect(() => {
    const fetchNodes = async () => {
      try {
        const response = await fetch(`${API_URL}/nodes`);
        const data: NodesResponse = await response.json();
        
        console.log("Nodes received:", data);
        
        if (data.nodes && data.nodes.length > 0) {
          // type에 따라 노드 분류
          const trafficNodes: Node[] = data.nodes
            .filter((node) => node.type === "traffic")
            .map((node) => ({
              lat: node.lat,
              lon: node.lon,
              id: Number(node.id),
              type: node.type
            }));
          
          const bicycleNodes: Node[] = data.nodes
            .filter((node) => node.type === "bicycle_station")
            .map((node) => ({
              lat: node.lat,
              lon: node.lon,
              id: Number(node.id),
              type: node.type
            }));
          
          setSeoulNode(trafficNodes);
          setBicycleNode(bicycleNodes);
          setIsConnected(true);
          
          console.log(`Traffic nodes: ${trafficNodes.length}, Bicycle nodes: ${bicycleNodes.length}`);
        }
      } catch (error) {
        console.error("Failed to fetch nodes:", error);
        setIsConnected(false);
      }
    };

    fetchNodes();
  }, []);

  // Canvas Layer 렌더링을 위한 별도 useEffect
  useEffect(() => {
    if (!roadRef.current) return;

    if (useCanvasLayer) {
      if (canvasLayerRef.current) {
        roadRef.current.removeLayer(canvasLayerRef.current);
      }
      canvasLayerRef.current = LCanvasLayer();
      canvasLayerRef.current.delegate({
        onDrawLayer: ({ canvas, bounds, size, zoom, center, corner }: any) => {
          const ctx = canvas.getContext("2d");
          if (!ctx) return;
          
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          
          // Seoul Traffic Nodes 렌더링 (파란색)
          if (seoulNode && seoulNode.length > 0) {
            seoulNode.forEach((node) => {
              const latLng = L.latLng(node.lat, node.lon);
              const point = roadRef.current!.latLngToContainerPoint(latLng);
              ctx.beginPath();
              ctx.arc(point.x, point.y, 1, 0, Math.PI * 2, true);
              ctx.fillStyle = "blue";
              ctx.fill();
            });
            console.log("Traffic nodes drawn:", seoulNode.length);
          }
          
          // Bicycle Station Nodes 렌더링 (빨간색)
          if (bicycleNode && bicycleNode.length > 0) {
            bicycleNode.forEach((node) => {
              const latLng = L.latLng(node.lat, node.lon);
              const point = roadRef.current!.latLngToContainerPoint(latLng);
              ctx.beginPath();
              ctx.arc(point.x, point.y, 2, 0, Math.PI * 2, true);
              ctx.fillStyle = "red";
              ctx.fill();
            });
            console.log("Bicycle nodes drawn:", bicycleNode.length);
          }
        },
      });
      roadRef.current.addLayer(canvasLayerRef.current);
      canvasLayerRef.current.needRedraw();
      console.log("CanvasLayer added to map");
    }
    else {
      if (canvasLayerRef.current) {
        roadRef.current.removeLayer(canvasLayerRef.current);
        canvasLayerRef.current = null;
        console.log("CanvasLayer removed from map");
      }
    }
  }, [useCanvasLayer, seoulNode, bicycleNode]);

  const handleStyleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMapStyle(e.target.value);
  };
  
  return (
    <div className="container">
      {!isConnected ? (
        <div>
          <h1 className="error-message">Not connected to server</h1>
        </div>
      ) : (
        <div className="map-container">
          <MapContainer
            center={mapCenter}
            zoom={mapZoom}
            style={{ width: "100%", height: "100%" }}
            zoomControl={false}
            attributionControl={false}
            ref={roadRef}
          >
            <MapViewUpdater center={mapCenter} zoom={mapZoom} />
            <TileLayer url={mapTilerStyles[mapStyle]} />
          </MapContainer>
          
          <div className="road-network">
            <h3>Road Network</h3>
            <label>
              <input
                type="radio"
                name="seoulNode"
                checked={useCanvasLayer}
                onChange={() => setUseCanvasLayer(!useCanvasLayer)}
              />
              On
            </label>
            <label>
              <input
                type="radio"
                name="seoulNode"
                checked={!useCanvasLayer}
                onChange={() => setUseCanvasLayer(!useCanvasLayer)}
              />
              Off
            </label>
          </div>
          <div className="map-style">
            <h3>Map Style</h3>
              <label>
                <input
                  type="radio"
                  name="mapStyle"
                  value="black"
                  checked={mapStyle === "black"}
                  onChange={handleStyleChange}
              />
                Black
              </label>
              <label>
                <input
                  type="radio"
                  name="mapStyle"
                  value="osm"
                  checked={mapStyle === "osm"}
                  onChange={handleStyleChange}
              />
                Osm
              </label>
              <label>
                <input
                  type="radio"
                  name="mapStyle"
                  value="basic"
                  checked={mapStyle === "basic"}
                  onChange={handleStyleChange}
                />  
                  Basic
              </label>
              <label>
                <input
                  type="radio"
                  name="mapStyle"
                  value="streets"
                  checked={mapStyle === "streets"}
                  onChange={handleStyleChange}
              />
                Streets
              </label>
              <label>
                <input
                  type="radio"
                  name="mapStyle"
                  value="satellite"
                  checked={mapStyle === "satellite"}
                  onChange={handleStyleChange}
              />
                Satellite
              </label>
            </div>
        </div>
      )}
    </div>
  );
}

export default App;

