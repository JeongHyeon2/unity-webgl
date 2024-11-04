import React from "react";
import ReactDOM from "react-dom/client";
import WebSocketUnityComponent from "./WebSocketUnityComponent";

// DOM이 완전히 로드된 후에 React 렌더링
document.addEventListener("DOMContentLoaded", function () {
  const root = ReactDOM.createRoot(document.getElementById("root"));
  root.render(<WebSocketUnityComponent></WebSocketUnityComponent>);
});
