import React, { useEffect, useState, useRef } from "react";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

import LCanvasLayer from "./L.CanvasLayer";

import './App.css';

const API_URL = "http://localhost:5001/api";

const Maptiler_Key = "DFFxHHmQRoAl3CPIlnBb";

const mapTilerStyles = {
  black: `http://223.194.46.216:8665/api/maps/positron/{z}/{x}/{y}.png`,
  osm: `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`,
  basic: `https://api.maptiler.com/maps/basic/{z}/{x}/{y}.png?key=${Maptiler_Key}`,
  streets: `https://api.maptiler.com/maps/streets/{z}/{x}/{y}.png?key=${Maptiler_Key}`,
  satellite: `https://api.maptiler.com/maps/hybrid/{z}/{x}/{y}.jpg?key=${Maptiler_Key}`
};

function App() {
  // API 상태
  const [isConnected, setIsConnected] = useState(false);

  // Road Map
  const [useCanvasLayer, setUseCanvasLayer] = useState(false);
  const roadRef = useRef(null);
  const canvasLayerRef = useRef(null);
  const [mapStyle, setMapStyle] = useState("black");
  const [mapCenter, setMapCenter] = useState([37.65146111, 127.0583889]);
  const [mapZoom, setMapZoom] = useState(15);
  // Node
  const [seoulNode, setSeoulNode] = useState([]);
  const [bicycleNode, setBicycleNode] = useState([]);

  // API로 노드 데이터 가져오기
  useEffect(() => {
    const fetchNodes = async () => {
      try {
        const response = await fetch(`${API_URL}/nodes`);
        const data = await response.json();
        
        console.log("Nodes received:", data);
        
        if (data.nodes && data.nodes.length > 0) {
          // type에 따라 노드 분류
          const trafficNodes = data.nodes
            .filter((node) => node.type === "traffic")
            .map((node) => ({
              lat: node.lat,
              lon: node.lon,
              id: Number(node.id),
              type: node.type
            }));
          
          const bicycleNodes = data.nodes
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
        onDrawLayer: ({ canvas, bounds, size, zoom, center, corner }) => {
          const ctx = canvas.getContext("2d");
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          if (seoulNode && seoulNode.length > 0) {
            seoulNode.forEach((node) => {
              const latLng = L.latLng(node.lat, node.lon);
              const point = roadRef.current.latLngToContainerPoint(latLng);
              ctx.beginPath();
              ctx.arc(point.x, point.y, 1, 0, Math.PI * 2, true);
              ctx.fillStyle = "blue";
              ctx.fill();
            });
            console.log("Nodes drawn:", seoulNode);
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
  }, [useCanvasLayer, seoulNode]);

  const handleStyleChange = (e) => {
    setMapStyle(e.target.value);
  };

  function MapViewUpdater({ center, zoom }) {
    const map = useMap();
    useEffect(() => {
      if (center) {
        map.setView(center, zoom);
      }
    }, [center, zoom, map]);
    return null;
  }
  
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
                  name="roadNetwork"
                  value="on"
                  checked={useCanvasLayer}
                  onChange={() => setUseCanvasLayer(true)}
                />
                  On
              </label>
              <label>
                <input
                  type="radio"
                  name="roadNetwork"
                  value="off"
                  checked={!useCanvasLayer}
                  onChange={() => setUseCanvasLayer(false)}
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
