import React, { useState, useEffect } from "react";
import { Unity, useUnityContext } from "react-unity-webgl";

function ShowUnity({ roomCode }) {
  const { unityProvider, isLoaded, sendMessage } = useUnityContext({
    loaderUrl: "/Build/ws-test.loader.js",
    dataUrl: "/Build/ws-test.data",
    frameworkUrl: "/Build/ws-test.framework.js",
    codeUrl: "/Build/ws-test.wasm",
  });

  const [isUnityReady, setIsUnityReady] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState(""); // 선택한 방
  const [showRoomSelection, setShowRoomSelection] = useState(true); // 방 선택 팝업

  useEffect(() => {
    if (isLoaded) {
      console.log("Unity is loaded");
      setIsUnityReady(true);
    } else {
      console.log("Unity is loading...");
    }
  }, [isLoaded]);

  // Unity 로딩 완료 후 선택된 방과 roomCode를 Unity에 전송
  useEffect(() => {
    if (isUnityReady && selectedRoom) {
      const message = `${roomCode}-${selectedRoom}`;
      sendMessage("Walking", "ReceiveCode", message);
      console.log(`Room code sent to Unity: ${message}`);
    }
  }, [isUnityReady, selectedRoom, roomCode, sendMessage]);

  const handleRoomSelect = (room) => {
    setSelectedRoom(room);
    setShowRoomSelection(false); // 팝업 닫기
  };

  return (
    <div>
      {showRoomSelection ? (
        <div>
          <h3>Select a Room:</h3>
          <button onClick={() => handleRoomSelect("korea")}>Korea</button>
          <button onClick={() => handleRoomSelect("china")}>China</button>
          <button onClick={() => handleRoomSelect("japan")}>Japan</button>
          <button onClick={() => handleRoomSelect("usa")}>USA</button>
        </div>
      ) : (
        <div style={{ width: "960px", height: "600px", marginTop: "20px" }}>
          <Unity
            unityProvider={unityProvider}
            style={{ width: "100%", height: "100%" }}
          />
        </div>
      )}
      {!isUnityReady && !showRoomSelection && (
        <p>Loading Unity, please wait...</p>
      )}
    </div>
  );
}

export default ShowUnity;
