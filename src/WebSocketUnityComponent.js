import React, { useEffect, useState } from "react";
import ShowUnity from "./ShowUnity"; // ShowUnity 컴포넌트 임포트
import "./WebSocketUnityComponent.css"; // Import the CSS file

// 로그인 화면 컴포넌트
const LoginComponent = ({ userId, setUserId, handleLogin }) => (
  <div className="login-container">
    <h2>Login with your ID</h2>
    <input
      type="text"
      placeholder="Your ID"
      value={userId}
      onChange={(e) => setUserId(e.target.value)}
      className="login-input"
    />
    <button onClick={handleLogin} className="login-button">
      Login
    </button>
  </div>
);

// 알림 관리 컴포넌트
const NotificationComponent = ({
  userId,
  toUserId,
  setToUserId,
  sendNotification,
  notifications,
  currentNotification,
  handleResponse,
}) => (
  <div className="notification-container">
    <h2>Logged in as {userId}</h2>
    <input
      type="text"
      placeholder="Recipient ID"
      value={toUserId}
      onChange={(e) => setToUserId(e.target.value)}
      className="notification-input"
    />
    <button onClick={sendNotification} className="notification-button">
      Send Notification
    </button>

    <h3>Notifications:</h3>
    <div className="notification-list">
      {notifications.map((notification, index) => (
        <p key={index}>{notification}</p>
      ))}
    </div>

    {currentNotification && (
      <div className="current-notification">
        <h3>New Notification: {currentNotification}</h3>
        <button
          onClick={() => handleResponse("Accepted")}
          className="response-button"
        >
          Accept
        </button>
        <button
          onClick={() => handleResponse("Rejected")}
          className="response-button reject"
        >
          Reject
        </button>
      </div>
    )}
  </div>
);

const WebSocketUnityComponent = () => {
  const [userId, setUserId] = useState(""); // 내 ID
  const [toUserId, setToUserId] = useState(""); // 상대방 ID
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [notifications, setNotifications] = useState([]); // 알림 저장
  const [currentNotification, setCurrentNotification] = useState(null); // 현재 알림
  const [roomCode, setRoomCode] = useState(""); // 방 코드 저장
  const [accepted, setAccepted] = useState(false); // 요청 수락 여부
  const [showUnity, setShowUnity] = useState(false); // ShowUnity 화면으로 이동 여부

  // WebSocket 연결 설정
  useEffect(() => {
    let pingInterval;

    if (connected && userId) {
      const ws = new WebSocket(
        `wss://unbiased-evenly-worm.ngrok-free.app/join?userId=${userId}`
      );

      ws.onopen = () => {
        console.log(`WebSocket connection established for user ${userId}`);

        // 주기적으로 서버에 ping 메시지를 전송 (30초마다)
        pingInterval = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send("ping");
          }
        }, 30000);
      };

      ws.onmessage = (event) => {
        const data = event.data;
        console.log("Received data:", data);

        if (data.startsWith("ALERT:")) {
          const notification = data.replace("ALERT: ", "");
          setCurrentNotification(notification);

          const senderId = data.split("from ")[1].replace(")", "");
          setToUserId(senderId);
        } else if (data.startsWith("RESPONSE: Accepted")) {
          setAccepted(true);
        } else if (data.startsWith("Room code:")) {
          const receivedRoomCode = data.replace("Room code: ", "");
          setRoomCode(receivedRoomCode);
          setShowUnity(true); // 방 코드를 받은 후 ShowUnity 화면으로 이동
          console.log("Room code received:", receivedRoomCode);
        }
      };

      ws.onclose = () => {
        console.log(`WebSocket connection closed for user ${userId}`);
        clearInterval(pingInterval);
      };

      setSocket(ws);

      return () => {
        if (ws) ws.close();
        clearInterval(pingInterval);
      };
    }
  }, [connected, userId]);

  // 로그인 처리
  const handleLogin = () => {
    if (userId) {
      setConnected(true);
    } else {
      alert("Please enter your ID to log in.");
    }
  };

  // 요청 전송
  const sendNotification = () => {
    if (socket && toUserId) {
      socket.send(`ALERT:TO:${toUserId}|MESSAGE:New notification`);
      setToUserId(""); // 전송 후 Recipient ID 초기화
    }
  };

  // 요청 수락 시 응답 전송
  const handleResponse = (response) => {
    if (socket && currentNotification && toUserId) {
      socket.send(`RESPONSE:TO:${toUserId}|MESSAGE:${response}`);
      setCurrentNotification(null);
      if (response === "Accepted") {
        setAccepted(true);
      }
    } else {
      console.error("No toUserId or current notification found.");
    }
  };

  return (
    <div className="websocket-unity-container">
      {!connected ? (
        <LoginComponent
          userId={userId}
          setUserId={setUserId}
          handleLogin={handleLogin}
        />
      ) : !showUnity ? (
        <NotificationComponent
          userId={userId}
          toUserId={toUserId}
          setToUserId={setToUserId}
          sendNotification={sendNotification}
          notifications={notifications}
          currentNotification={currentNotification}
          handleResponse={handleResponse}
        />
      ) : (
        <div className="show-unity-fullscreen">
          <ShowUnity roomCode={roomCode} />{" "}
          {/* ShowUnity 컴포넌트로 roomCode 전달 */}
        </div>
      )}
    </div>
  );
};

export default WebSocketUnityComponent;
