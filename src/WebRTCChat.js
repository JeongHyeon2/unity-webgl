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
  const [selectedLanguage, setSelectedLanguage] = useState("ko-KR");
  const [callState, setCallState] = useState("idle");
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
    {
      code: "ko-KR",
      label: "한국어",
      sttConfig: {
        continuous: true,
        interimResults: true,
      },
    },
    {
      code: "en-US",
      label: "English",
      sttConfig: {
        continuous: true,
        interimResults: true,
      },
    },
    {
      code: "zh-CN",
      label: "中文",
      sttConfig: {
        continuous: true,
        interimResults: true,
        maxAlternatives: 1,
      },
    },
    {
      code: "ja-JP",
      label: "日本語",
      sttConfig: {
        continuous: true,
        interimResults: true,
      },
    },
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

    webSocket.onerror = (error) => {
      console.error("WebSocket error:", error);
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
        echoCancellationType: "system",
        suppressLocalAudioPlayback: true,
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
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    if (localAudioRef.current) {
      localAudioRef.current.srcObject = null;
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }

    if (localAudioContextRef.current?.audioContext) {
      localAudioContextRef.current.audioContext.close();
    }
    if (remoteAudioContextRef.current?.audioContext) {
      remoteAudioContextRef.current.audioContext.close();
    }

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

    // 노이즈 게이트 추가
    const gainNode = audioContext.createGain();
    gainNode.gain.value = 0.8;

    // 필터 추가
    const filter = audioContext.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 2000;

    source.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(analyser);

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

    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }

    const recognition = new window.webkitSpeechRecognition();
    const selectedLang = languages.find(
      (lang) => lang.code === selectedLanguage
    );

    recognition.lang = selectedLang.code;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;
    recognition.interimResults = false;

    recognition.onstart = () => {
      console.log(`STT started for ${selectedLang.label}`);
    };

    recognition.onresult = (event) => {
      const result = event.results[0][0].transcript;
      setTranscript((prev) => prev + result + "\n");
    };

    recognition.onerror = (event) => {
      console.error("Speech Recognition Error:", event.error);
      if (event.error === "no-speech" || event.error === "network") {
        setTimeout(() => {
          if (isAudioOn && recognitionRef.current) {
            recognition.start();
          }
        }, 1000);
      }
    };

    recognition.onend = () => {
      if (isAudioOn) {
        setTimeout(() => {
          try {
            recognition.start();
          } catch (e) {
            console.error("Failed to restart STT:", e);
            setTimeout(() => {
              if (isAudioOn) {
                startSpeechRecognition();
              }
            }, 1000);
          }
        }, 1000); // 1초 딜레이 추가
      }
    };

    try {
      recognition.start();
      recognitionRef.current = recognition;
    } catch (e) {
      console.error("Failed to start STT:", e);
    }
  };

  const stopSpeechRecognition = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setTranscript("");
  };

  const handleLanguageChange = (e) => {
    const newLanguage = e.target.value;
    setSelectedLanguage(newLanguage);

    if (isAudioOn) {
      stopSpeechRecognition();
      setTimeout(() => {
        startSpeechRecognition();
      }, 100);
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
              <button onClick={acceptCall} className="chat-button accept">
                Accept
              </button>
              <button
                onClick={() => {
                  setCallState("idle");
                  cleanupCall();
                }}
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
            <div className="active-call-controls">
              <button onClick={endCall} className="chat-button end-call">
                End Call
              </button>
              <button onClick={toggleMute} className="chat-button">
                {isMuted ? "Unmute" : "Mute"}
              </button>
            </div>
          )}

          {isAudioOn && (
            <>
              <div className="volume-display">
                <div className="volume-meter">
                  <h3>Your Voice Volume:</h3>
                  <div
                    className="volume-bar"
                    style={{
                      width: `${Math.min(100, localVolume)}%`,
                      backgroundColor: `hsl(${120 - localVolume}, 80%, 50%)`,
                    }}
                  />
                  <span>{Math.round(localVolume)}%</span>
                </div>
                <div className="volume-meter">
                  <h3>Remote Voice Volume:</h3>
                  <div
                    className="volume-bar"
                    style={{
                      width: `${Math.min(100, remoteVolume)}%`,
                      backgroundColor: `hsl(${120 - remoteVolume}, 80%, 50%)`,
                    }}
                  />
                  <span>{Math.round(remoteVolume)}%</span>
                </div>
              </div>

              <div className="language-select">
                <h3>음성 인식 언어:</h3>
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

              <div className="transcript-display">
                <h3>음성 인식 결과:</h3>
                <div
                  className="transcript-text"
                  style={{
                    whiteSpace: "pre-wrap",
                    maxHeight: "200px",
                    overflowY: "auto",
                  }}
                >
                  {transcript}
                </div>
                <button
                  onClick={() => setTranscript("")}
                  className="chat-button clear-transcript"
                >
                  Clear Text
                </button>
              </div>
            </>
          )}
        </div>
      )}

      <div className="audio-elements" style={{ display: "none" }}>
        <audio ref={localAudioRef} autoPlay muted></audio>
        <audio ref={remoteAudioRef} autoPlay></audio>
      </div>
    </div>
  );
};

export default VoiceChat;
