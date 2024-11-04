import React, { useState, useEffect, useRef } from "react";

const VoiceChat = ({ roomId: initialRoomId }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [isAudioOn, setIsAudioOn] = useState(false);
  const [roomId, setRoomId] = useState(initialRoomId || ""); // 초기 roomId를 설정
  const [hasJoinedRoom, setHasJoinedRoom] = useState(!!initialRoomId); // roomId가 있을 경우 자동으로 참가된 상태로 설정
  const [localVolume, setLocalVolume] = useState(0);
  const [remoteVolume, setRemoteVolume] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [selectedLanguage, setSelectedLanguage] = useState("en-US");

  const localAudioRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const webSocketRef = useRef(null);
  const localAudioContextRef = useRef(null);
  const remoteAudioContextRef = useRef(null);
  const recognitionRef = useRef(null);
  const [isInitiator, setIsInitiator] = useState(false);

  const languages = [
    { code: "en-US", label: "English" },
    { code: "ko-KR", label: "Korean" },
    { code: "es-ES", label: "Spanish" },
    { code: "fr-FR", label: "French" },
    { code: "ja-JP", label: "Japanese" },
    { code: "zh-CN", label: "Chinese (Simplified)" },
  ];

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
      setIsInitiator(true);
    };

    webSocket.onmessage = (message) => {
      const data = JSON.parse(message.data);
      if (data.type === "offer") {
        handleOffer(data.offer);
      } else if (data.type === "answer") {
        handleAnswer(data.answer);
      } else if (data.type === "ice-candidate") {
        handleNewICECandidateMsg(data.candidate);
      }
    };

    webSocket.onclose = () => {
      setIsConnected(false);
      console.log("WebSocket disconnected");
    };

    setHasJoinedRoom(true);
  };

  useEffect(() => {
    if (initialRoomId) {
      joinRoom();
    }

    return () => {
      if (webSocketRef.current) {
        webSocketRef.current.close();
      }
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, [initialRoomId]);

  const handleOffer = async (offer) => {
    const peerConnection = createPeerConnection();
    peerConnectionRef.current = peerConnection;
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

    // 상대방도 로컬 오디오 트랙을 추가
    const localStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true, // 에코 제거
        noiseSuppression: true, // 소음 감소
        autoGainControl: true, // 자동 게인 조절
      },
    });

    localStream
      .getTracks()
      .forEach((track) => peerConnection.addTrack(track, localStream));

    if (localAudioRef.current) {
      localAudioRef.current.srcObject = localStream;
    }

    setupLocalAudioAnalyser(localStream); // 내 목소리 분석기 설정

    // answer 생성 및 전송
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    webSocketRef.current.send(
      JSON.stringify({
        type: "answer",
        answer: answer,
      })
    );

    // 상대방의 트랙 처리
    peerConnection.ontrack = (event) => {
      console.log("Remote track received:", event.streams[0]);
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = event.streams[0];
        setupRemoteAudioAnalyser(event.streams[0]); // 상대방 음성 분석기 설정
      }
    };
  };

  const handleAnswer = async (answer) => {
    const peerConnection = peerConnectionRef.current;
    await peerConnection.setRemoteDescription(
      new RTCSessionDescription(answer)
    );
  };

  const handleNewICECandidateMsg = async (candidate) => {
    const peerConnection = peerConnectionRef.current;
    try {
      await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (e) {
      console.error("Error adding received ICE candidate", e);
    }
  };

  const createPeerConnection = () => {
    const peerConnection = new RTCPeerConnection({
      iceServers: [
        {
          urls: "stun:stun.l.google.com:19302",
        },
      ],
    });

    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        webSocketRef.current.send(
          JSON.stringify({
            type: "ice-candidate",
            candidate: event.candidate,
          })
        );
      }
    };

    peerConnection.ontrack = (event) => {
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = event.streams[0];
        setupRemoteAudioAnalyser(event.streams[0]); // 상대방 음성 분석기 설정
      }
    };

    return peerConnection;
  };

  const setupLocalAudioAnalyser = (stream) => {
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
      requestAnimationFrame(updateVolume);
    };

    updateVolume();
  };

  const setupRemoteAudioAnalyser = (stream) => {
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
      requestAnimationFrame(updateVolume);
    };

    updateVolume();
  };

  // STT 기능을 위한 함수
  const startSpeechRecognition = () => {
    if (!("webkitSpeechRecognition" in window)) {
      alert("이 브라우저는 Speech Recognition을 지원하지 않습니다.");
      return;
    }

    const SpeechRecognition = window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();

    recognition.continuous = true; // 연속 인식
    recognition.interimResults = true; // 중간 결과 제공
    recognition.lang = selectedLanguage; // 선택된 언어 설정

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
      // 음성 인식이 종료되면 다시 시작
      recognition.start();
    };

    recognition.start();
    recognitionRef.current = recognition;
  };

  const stopSpeechRecognition = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
  };

  // 언어 변경 시 STT를 중지하고 새로운 언어로 재시작
  const handleLanguageChange = (e) => {
    setSelectedLanguage(e.target.value);

    // 음성 인식 중지 후 재시작
    if (isAudioOn) {
      stopSpeechRecognition();
      startSpeechRecognition();
    }
  };

  // startCall 함수에 STT 시작 코드 추가
  const startCall = async () => {
    const peerConnection = createPeerConnection();
    peerConnectionRef.current = peerConnection;

    // 에코 제거 및 소음 감소 설정
    const localStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true, // 에코 제거
        noiseSuppression: true, // 소음 감소
        autoGainControl: true, // 자동 게인 조절
      },
    });

    localStream
      .getTracks()
      .forEach((track) => peerConnection.addTrack(track, localStream));

    if (localAudioRef.current) {
      localAudioRef.current.srcObject = localStream;
    }

    setupLocalAudioAnalyser(localStream); // 내 목소리 분석기 설정

    // 음성 인식 시작
    startSpeechRecognition();

    if (isInitiator) {
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);

      webSocketRef.current.send(
        JSON.stringify({
          type: "offer",
          offer: offer,
        })
      );
    } else {
      webSocketRef.current.send(
        JSON.stringify({
          type: "ready",
        })
      );
    }

    setIsAudioOn(true); // 통화 상태 업데이트
  };

  // endCall 함수에 STT 중지 코드 추가
  const endCall = () => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    setIsAudioOn(false);

    // 음성 인식 중지
    stopSpeechRecognition();
  };

  const toggleMute = () => {
    if (localAudioRef.current && localAudioRef.current.srcObject) {
      localAudioRef.current.srcObject.getAudioTracks().forEach((track) => {
        track.enabled = !track.enabled;
      });
      setIsMuted(!isMuted);
    }
  };

  return (
    <div>
      <h1>1:1 Voice Chat</h1>
      {!hasJoinedRoom ? (
        <div>
          <input
            type="text"
            placeholder="Enter Room ID"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
          />
          <button onClick={joinRoom}>Join Room</button>
        </div>
      ) : (
        <div>
          <p>Connection status: {isConnected ? "Connected" : "Disconnected"}</p>
          <button onClick={startCall} disabled={isAudioOn || !isConnected}>
            Start Call
          </button>
          <button onClick={endCall} disabled={!isAudioOn}>
            End Call
          </button>
          <button onClick={toggleMute}>{isMuted ? "Unmute" : "Mute"}</button>
          <div>
            <h3>Your Voice Volume: {Math.round(localVolume)}</h3>
            <h3>Remote Voice Volume: {Math.round(remoteVolume)}</h3>
          </div>
          <div>
            <h3>Transcript (STT 결과):</h3>
            <p>{transcript}</p>
          </div>
          <div>
            <h3>Select Language:</h3>
            <select value={selectedLanguage} onChange={handleLanguageChange}>
              {languages.map((language) => (
                <option key={language.code} value={language.code}>
                  {language.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
      <div>
        <h2>Your Audio</h2>
        <audio ref={localAudioRef} autoPlay muted></audio>
      </div>
      <div>
        <h2>Remote Audio</h2>
        <audio ref={remoteAudioRef} autoPlay></audio>
      </div>
    </div>
  );
};

export default VoiceChat;
