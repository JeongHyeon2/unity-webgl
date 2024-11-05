import React, { useState, useEffect } from "react";
import { Unity, useUnityContext } from "react-unity-webgl";
import VoiceChat from "./WebRTCChat";

function ShowUnity({ roomCode }) {
  const { unityProvider, isLoaded, sendMessage } = useUnityContext({
    loaderUrl: "/Build/ws-test.loader.js",
    dataUrl: "/Build/ws-test.data",
    frameworkUrl: "/Build/ws-test.framework.js",
    codeUrl: "/Build/ws-test.wasm",
  });

  const [isUnityReady, setIsUnityReady] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState("");
  const [showRoomSelection, setShowRoomSelection] = useState(true);

  useEffect(() => {
    if (isLoaded) {
      setIsUnityReady(true);
    }
  }, [isLoaded]);

  useEffect(() => {
    if (isUnityReady && selectedRoom) {
      const message = `${roomCode}-${selectedRoom}`;
      sendMessage("Walking", "ReceiveCode", message);
    }
  }, [isUnityReady, selectedRoom, roomCode, sendMessage]);

  const handleRoomSelect = (room) => {
    setSelectedRoom(room);
    setShowRoomSelection(false);
  };

  return (
    <div style={{ width: "100%", display: "flex", justifyContent: "center" }}>
      {showRoomSelection ? (
        <div className="room-selection">
          <h3>Select a Room:</h3>
          <button onClick={() => handleRoomSelect("korea")}>Korea</button>
          <button onClick={() => handleRoomSelect("china")}>China</button>
          <button onClick={() => handleRoomSelect("japan")}>Japan</button>
          <button onClick={() => handleRoomSelect("usa")}>USA</button>
        </div>
      ) : (
        <div
          style={{
            width: "100%",
            maxWidth: "1600px", // 최대 너비 설정
            height: "80vh", // 전체 높이의 80% 정도를 차지하도록 설정
            marginTop: "20px",
          }}
        >
          <Unity
            unityProvider={unityProvider}
            style={{ width: "100%", height: "100%" }}
          />
          <VoiceChat roomId={roomCode} />
        </div>
      )}
      {!isUnityReady && !showRoomSelection && (
        <p>Loading Unity, please wait...</p>
      )}
    </div>
  );
}

export default ShowUnity;
