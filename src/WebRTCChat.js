import React, { useState, useEffect, useRef } from "react";
import "./WebRTCChat.css";

const VoiceChat = ({ roomId: initialRoomId }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [isAudioOn, setIsAudioOn] = useState(false);
  const [roomId, setRoomId] = useState(initialRoomId || "");
  const [hasJoinedRoom, setHasJoinedRoom] = useState(!!initialRoomId);
  const [localVolume, setLocalVolume] = useState(0);
  const [remoteVolume, setRemoteVolume] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [selectedLanguage, setSelectedLanguage] = useState("en-US");
  const [callState, setCallState] = useState("idle"); // idle, calling, receiving, connected
  const [remoteReady, setRemoteReady] = useState(false);

  const localAudioRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const webSocketRef = useRef(null);
  const localAudioContextRef = useRef(null);
  const remoteAudioContextRef = useRef(null);
  const recognitionRef = useRef(null);
  const localStreamRef = useRef(null);

  const languages = [
    { code: "en-US", label: "English" },
    { code: "ko-KR", label: "Korean" },
    { code: "es-ES", label: "Spanish" },
    { code: "fr-FR", label: "French" },
    { code: "ja-JP", label: "Japanese" },
    { code: "zh-CN", label: "Chinese (Simplified)" },
  ];

  const createPeerConnection = () => {
    const peerConnection = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:stun2.l.google.com:19302" },
        { urls: "stun:stun3.l.google.com:19302" },
        { urls: "stun:stun4.l.google.com:19302" },
      ],
      iceTransportPolicy: "all",
      iceCandidatePoolSize: 10,
      bundlePolicy: "max-bundle",
      rtcpMuxPolicy: "require",
    });

    peerConnection.onicecandidate = (event) => {
      if (event.candidate && webSocketRef.current) {
        webSocketRef.current.send(
          JSON.stringify({
            type: "ice-candidate",
            candidate: event.candidate,
          })
        );
      }
    };

    peerConnection.oniceconnectionstatechange = () => {
      console.log("ICE Connection State:", peerConnection.iceConnectionState);
      if (peerConnection.iceConnectionState === "failed") {
        peerConnection.restartIce();
      }
    };

    peerConnection.ontrack = (event) => {
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = event.streams[0];
        setupRemoteAudioAnalyser(event.streams[0]);
      }
    };

    return peerConnection;
  };

  const joinRoom = () => {
    if (roomId.trim() === "") {
      alert("Please enter a valid room ID.");
      return;
    }

    const webSocket = new WebSocket(
      `wss://unbiased-evenly-worm.ngrok-free.app/voice-chat?roomId=${roomId}`
    );
    webSocketRef.current = webSocket;

    webSocket.onopen = () => {
      setIsConnected(true);
      console.log("WebSocket connected");
    };

    webSocket.onmessage = async (message) => {
      const data = JSON.parse(message.data);

      switch (data.type) {
        case "call-request":
          setCallState("receiving");
          break;

        case "call-accept":
          setRemoteReady(true);
          if (callState === "calling") {
            await startCall();
          }
          break;

        case "offer":
          await handleOffer(data.offer);
          break;

        case "answer":
          await handleAnswer(data.answer);
          break;

        case "ice-candidate":
          await handleNewICECandidateMsg(data.candidate);
          break;

        case "call-end":
          handleCallEnd();
          break;
      }
    };

    webSocket.onclose = () => {
      setIsConnected(false);
      console.log("WebSocket disconnected");
      handleCallEnd();
    };

    setHasJoinedRoom(true);
  };

  const requestCall = async () => {
    if (!webSocketRef.current) return;

    setCallState("calling");
    webSocketRef.current.send(
      JSON.stringify({
        type: "call-request",
        roomId: roomId,
      })
    );
  };

  const acceptCall = async () => {
    if (!webSocketRef.current) return;

    setCallState("connected");
    webSocketRef.current.send(
      JSON.stringify({
        type: "call-accept",
        roomId: roomId,
      })
    );

    await startCall();
  };

  const handleOffer = async (offer) => {
    const peerConnection = createPeerConnection();
    peerConnectionRef.current = peerConnection;
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

    const localStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    localStreamRef.current = localStream;
    localStream
      .getTracks()
      .forEach((track) => peerConnection.addTrack(track, localStream));

    if (localAudioRef.current) {
      localAudioRef.current.srcObject = localStream;
    }

    setupLocalAudioAnalyser(localStream);

    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    webSocketRef.current.send(
      JSON.stringify({
        type: "answer",
        answer: answer,
      })
    );
  };

  const handleAnswer = async (answer) => {
    const peerConnection = peerConnectionRef.current;
    if (peerConnection) {
      await peerConnection.setRemoteDescription(
        new RTCSessionDescription(answer)
      );
    }
  };

  const handleNewICECandidateMsg = async (candidate) => {
    const peerConnection = peerConnectionRef.current;
    if (peerConnection) {
      try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        console.error("Error adding received ICE candidate", e);
      }
    }
  };

  const startCall = async () => {
    const peerConnection = createPeerConnection();
    peerConnectionRef.current = peerConnection;

    try {
      const localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      localStreamRef.current = localStream;
      localStream
        .getTracks()
        .forEach((track) => peerConnection.addTrack(track, localStream));

      if (localAudioRef.current) {
        localAudioRef.current.srcObject = localStream;
      }

      setupLocalAudioAnalyser(localStream);
      startSpeechRecognition();

      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);

      webSocketRef.current.send(
        JSON.stringify({
          type: "offer",
          offer: offer,
        })
      );

      setIsAudioOn(true);
    } catch (error) {
      console.error("Error starting call:", error);
      handleCallEnd();
    }
  };

  const handleCallEnd = () => {
    cleanupCall();
    setCallState("idle");
    setRemoteReady(false);
  };

  const cleanupCall = () => {
    // 오디오 트랙 정리
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    // 피어 커넥션 정리
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    // 오디오 엘리먼트 정리
    if (localAudioRef.current) {
      localAudioRef.current.srcObject = null;
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }

    // 오디오 컨텍스트 정리
    if (localAudioContextRef.current?.audioContext) {
      localAudioContextRef.current.audioContext.close();
    }
    if (remoteAudioContextRef.current?.audioContext) {
      remoteAudioContextRef.current.audioContext.close();
    }

    // 음성 인식 정리
    stopSpeechRecognition();

    setIsAudioOn(false);
  };

  const endCall = () => {
    if (webSocketRef.current) {
      webSocketRef.current.send(
        JSON.stringify({
          type: "call-end",
          roomId: roomId,
        })
      );
    }
    handleCallEnd();
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = !track.enabled;
      });
      setIsMuted(!isMuted);
    }
  };

  const setupLocalAudioAnalyser = (stream) => {
    if (localAudioContextRef.current?.audioContext) {
      localAudioContextRef.current.audioContext.close();
    }

    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);

    localAudioContextRef.current = { audioContext, analyser };

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    const updateVolume = () => {
      analyser.getByteFrequencyData(dataArray);
      const volume = dataArray.reduce((a, b) => a + b) / dataArray.length;
      setLocalVolume(volume);
      if (isAudioOn) {
        requestAnimationFrame(updateVolume);
      }
    };

    updateVolume();
  };

  const setupRemoteAudioAnalyser = (stream) => {
    if (remoteAudioContextRef.current?.audioContext) {
      remoteAudioContextRef.current.audioContext.close();
    }

    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);

    remoteAudioContextRef.current = { audioContext, analyser };

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    const updateVolume = () => {
      analyser.getByteFrequencyData(dataArray);
      const volume = dataArray.reduce((a, b) => a + b) / dataArray.length;
      setRemoteVolume(volume);
      if (isAudioOn) {
        requestAnimationFrame(updateVolume);
      }
    };

    updateVolume();
  };

  const startSpeechRecognition = () => {
    if (!("webkitSpeechRecognition" in window)) {
      alert("This browser doesn't support Speech Recognition.");
      return;
    }

    const recognition = new window.webkitSpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = selectedLanguage;

    recognition.onresult = (event) => {
      let interimTranscript = "";
      let finalTranscript = "";

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }

      setTranscript(finalTranscript + interimTranscript);
    };

    recognition.onerror = (event) => {
      console.error("Speech Recognition Error:", event.error);
    };

    recognition.onend = () => {
      if (isAudioOn) {
        recognition.start();
      }
    };

    recognition.start();
    recognitionRef.current = recognition;
  };

  const stopSpeechRecognition = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setTranscript("");
  };

  const handleLanguageChange = (e) => {
    setSelectedLanguage(e.target.value);
    if (isAudioOn) {
      stopSpeechRecognition();
      startSpeechRecognition();
    }
  };

  useEffect(() => {
    if (initialRoomId) {
      joinRoom();
    }

    return () => {
      cleanupCall();
      if (webSocketRef.current) {
        webSocketRef.current.close();
      }
    };
  }, [initialRoomId]);

  return (
    <div className="voice-chat-container">
      <h1 className="voice-chat-title">1:1 Voice Chat</h1>
      {!hasJoinedRoom ? (
        <div className="join-room-container">
          <input
            type="text"
            placeholder="Enter Room ID"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            className="room-input"
          />
          <button onClick={joinRoom} className="chat-button">
            Join Room
          </button>
        </div>
      ) : (
        <div className="chat-controls">
          <p className="connection-status">
            Connection status: {isConnected ? "Connected" : "Disconnected"}
          </p>

          {callState === "idle" && (
            <button
              onClick={requestCall}
              disabled={!isConnected}
              className="chat-button"
            >
              Start Call
            </button>
          )}
          {callState === "receiving" && (
            <div className="call-request">
              <p>Incoming call...</p>
              <button onClick={acceptCall} className="chat-button">
                Accept
              </button>
              <button
                onClick={() => setCallState("idle")}
                className="chat-button reject"
              >
                Decline
              </button>
            </div>
          )}

          {callState === "calling" && (
            <div className="call-status">
              <p>Waiting for answer...</p>
              <button
                onClick={() => {
                  setCallState("idle");
                  cleanupCall();
                }}
                className="chat-button"
              >
                Cancel
              </button>
            </div>
          )}

          {callState === "connected" && (
            <>
              <button onClick={endCall} className="chat-button">
                End Call
              </button>
              <button onClick={toggleMute} className="chat-button">
                {isMuted ? "Unmute" : "Mute"}
              </button>
            </>
          )}

          <div className="volume-display">
            <h3>Your Voice Volume: {Math.round(localVolume)}</h3>
            <h3>Remote Voice Volume: {Math.round(remoteVolume)}</h3>
          </div>

          <div className="transcript-display">
            <h3>Transcript:</h3>
            <p>{transcript}</p>
          </div>

          <div className="language-select">
            <h3>Select Language:</h3>
            <select
              value={selectedLanguage}
              onChange={handleLanguageChange}
              className="language-dropdown"
            >
              {languages.map((language) => (
                <option key={language.code} value={language.code}>
                  {language.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      <div className="audio-section" style={{ display: "none" }}>
        <audio ref={localAudioRef} autoPlay muted></audio>
        <audio ref={remoteAudioRef} autoPlay></audio>
      </div>
    </div>
  );
};

export default VoiceChat;
