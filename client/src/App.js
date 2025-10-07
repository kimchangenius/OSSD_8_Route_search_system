import React, { useCallback, useEffect, useState, useRef } from "react";
import * as io from "socket.io-client";
import { MapContainer, TileLayer, Polyline, useMap, CircleMarker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";


import logo from './logo.svg';
import './App.css';

const SOCKET_URL = "http://localhost:5000";

function App() {
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    const new_socket = io.connect(SOCKET_URL, {transports: ["websocket"]});
    setSocket(new_socket);

    new_socket.on("connect", () => {
      console.log("Connected to server");
    });

    new_socket.on("disconnect", () => {
      console.log("Disconnected from server");
    });

    return () => {
      new_socket.disconnect();
    };
  }, []);

  return (
    <div className="App">
      <header className="App-header">
        <img src={logo} className="App-logo" alt="logo" />
        <p>
          Edit <code>src/App.js</code> and save to reload.
        </p>
        <a
          className="App-link"
          href="https://reactjs.org"
          target="_blank"
          rel="noopener noreferrer"
        >
          Learn React
        </a>
      </header>
    </div>
  );
}

export default App;
