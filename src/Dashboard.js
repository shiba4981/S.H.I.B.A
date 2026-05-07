import React, { useState, useEffect, useRef } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { MapContainer, TileLayer, Marker, Popup, useMap, LayersControl, Circle } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { db, auth } from './firebase';
import { ref, onValue, remove, set, update, push, onChildAdded, off } from 'firebase/database';
import { signOut } from 'firebase/auth';


const getMarkerIcon = (heading, speed) => {
  const speedNum = parseFloat(speed || 0);
  
  // If stationary (speed < 2.5 km/h matches the dashboard UI logic for 0)
  if (speedNum < 2.5) {
    return L.divIcon({
      className: 'custom-stationary-dot',
      html: `<div style="filter: drop-shadow(0px 4px 6px rgba(0,0,0,0.4)); width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;">
               <svg viewBox="0 0 24 24" width="24" height="24">
                 <circle cx="12" cy="12" r="10" fill="#ffffff" />
                 <circle cx="12" cy="12" r="7" fill="#3b82f6" />
               </svg>
             </div>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
      popupAnchor: [0, -12]
    });
  }

  // If heading is available, show a rotating navigation arrow
  if (heading !== null && heading !== undefined && !isNaN(heading) && heading >= 0) {
    return L.divIcon({
      className: 'custom-navigation-arrow',
      html: `<div style="filter: drop-shadow(0px 8px 12px rgba(0,0,0,0.4)); width: 48px; height: 48px; display: flex; align-items: center; justify-content: center;">
               <svg style="transform: rotate(${heading}deg); transform-origin: center;" viewBox="0 0 40 40" width="48" height="48">
                 <defs>
                   <linearGradient id="apple-left" x1="0%" y1="0%" x2="100%" y2="100%">
                     <stop offset="0%" stop-color="#60A5FA" />
                     <stop offset="100%" stop-color="#2563EB" />
                   </linearGradient>
                   <linearGradient id="apple-right" x1="0%" y1="0%" x2="100%" y2="100%">
                     <stop offset="0%" stop-color="#2563EB" />
                     <stop offset="100%" stop-color="#1E3A8A" />
                   </linearGradient>
                 </defs>
                 <g>
                   <!-- White outer border with rounded corners -->
                   <path d="M20 2 L 4 36 L 20 26 L 36 36 Z" fill="#ffffff" stroke="#ffffff" stroke-width="3" stroke-linejoin="round" />
                   <!-- Left 3D Face (Light source) -->
                   <path d="M20 3 L 5.5 34.5 L 20 25.5 Z" fill="url(#apple-left)" />
                   <!-- Right 3D Face (Shadowed) -->
                   <path d="M20 3 L 34.5 34.5 L 20 25.5 Z" fill="url(#apple-right)" />
                 </g>
               </svg>
             </div>`,
      iconSize: [48, 48],
      iconAnchor: [24, 24],
      popupAnchor: [0, -20]
    });
  }
  // Ultra-reliable fallback pin using an SVG/Emoji (bypasses missing image link errors)
  return L.divIcon({
    className: 'custom-fallback-pin',
    html: `<div style="font-size: 32px; filter: drop-shadow(0px 6px 8px rgba(0,0,0,0.4)); text-align: center; margin-top: -8px;">📍</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32]
  });
};

const calculateHeading = (lat1, lon1, lat2, lon2) => {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const toDeg = (rad) => (rad * 180) / Math.PI;
  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
            Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
};

const getDeviceLocation = (device) => {
  if (!device) return null;
  const rawLat = device.latitude ?? device.lat ?? device.location?.latitude ?? device.location?.lat;
  const rawLng = device.longitude ?? device.lng ?? device.location?.longitude ?? device.location?.lng;
  if (rawLat == null || rawLng == null) return null;
  
  const lat = parseFloat(rawLat);
  const lng = parseFloat(rawLng);
  if (isNaN(lat) || isNaN(lng)) return null;

  return {
    lat,
    lng,
      alt: device.altitude ?? device.alt ?? device.location?.altitude ?? device.location?.alt,
    speed: device.speed ?? device.location?.speed,
    acc: device.accuracy ?? device.acc ?? device.location?.accuracy,
    heading: device.heading ?? device.location?.heading,
  };
};

export default function Dashboard({ user }) {
  const [devices, setDevices] = useState({});
  const [activeDevice, setActiveDevice] = useState(null);
  // const [showQR, setShowQR] = useState(false); // unused
  const [showLinkQR, setShowLinkQR] = useState(false);
  const [showGlobalMap, setShowGlobalMap] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');

  const selectedDevice = activeDevice ? devices[activeDevice] : null;
  
  // Safely grab coordinates whether they are saved as latitude/longitude OR lat/lng OR inside a location object
  const rawLat = selectedDevice?.latitude ?? selectedDevice?.lat ?? selectedDevice?.location?.latitude ?? selectedDevice?.location?.lat;
  const rawLng = selectedDevice?.longitude ?? selectedDevice?.lng ?? selectedDevice?.location?.longitude ?? selectedDevice?.location?.lng;
  const rawAlt = selectedDevice?.altitude ?? selectedDevice?.alt ?? selectedDevice?.location?.altitude ?? selectedDevice?.location?.alt;
  const rawSpeed = selectedDevice?.speed ?? selectedDevice?.location?.speed;
  const rawAcc = selectedDevice?.accuracy ?? selectedDevice?.acc ?? selectedDevice?.location?.accuracy;
  const rawHeading = selectedDevice?.computedHeading ?? selectedDevice?.heading ?? selectedDevice?.location?.heading;
  const hasValidCoords = rawLat != null && rawLng != null;
  const parsedLat = hasValidCoords ? parseFloat(rawLat) : 20.2961;
  const parsedLng = hasValidCoords ? parseFloat(rawLng) : 85.8245;
  const lat = isNaN(parsedLat) ? 20.2961 : parsedLat;
  const lng = isNaN(parsedLng) ? 85.8245 : parsedLng;
  const position = [lat, lng];
  const [mapInstance, setMapInstance] = useState(null);
  const markerIcon = React.useMemo(() => getMarkerIcon(rawHeading, rawSpeed), [rawHeading, rawSpeed]);

  const [peerConnection, setPeerConnection] = useState(null);
  const [dataChannel, setDataChannel] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const videoRef = useRef(null);
  const dragStart = useRef(null);
  const prevLocationsRef = useRef({});
  const [playError, setPlayError] = useState(false);

  const [logs, setLogs] = useState([]);
  const [latency] = useState(0);
  
  const [clips, setClips] = useState([]);
  const [isRecording, setIsRecording] = useState(false);
  const [activeStreamMode, setActiveStreamMode] = useState(null);
  
  const [iceState, setIceState] = useState('disconnected');
  const [connState, setConnState] = useState('disconnected');
  const [sigState, setSigState] = useState('disconnected');

  // Helper to add timestamped logs
  const addLog = (msg) => {
    setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 10));
  };

  const handleRecordClip = () => {
    if (!remoteStream || isRecording) return;
    
    setIsRecording(true);
    addLog("Started 10-second video recording...");

    try {
      let mimeType = 'video/webm;codecs=vp8,opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/webm';
      }
      
      const mediaRecorder = new MediaRecorder(remoteStream, { mimeType });
      const chunks = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: mimeType });
        const url = URL.createObjectURL(blob);
        const newClip = {
          id: Date.now(),
          url,
          timestamp: Date.now(),
        };
        setClips(prev => [newClip, ...prev]);
        setIsRecording(false);
        addLog("Recording saved to local folder.");
      };

      mediaRecorder.start();

      // Stop after 10 seconds
      setTimeout(() => {
        if (mediaRecorder.state === 'recording') {
          mediaRecorder.stop();
        }
      }, 10000);
    } catch (err) {
      addLog(`❌ Recording Error: ${err.message}`);
      setIsRecording(false);
    }
  };

  const deleteLocalClip = (id, url) => {
    if (!window.confirm("Delete this local clip?")) return;
    URL.revokeObjectURL(url);
    setClips(prev => prev.filter(clip => clip.id !== id));
    addLog("Deleted local recording.");
  };

  // Ping/Pong Latency check
  useEffect(() => {
    const interval = setInterval(() => {
      if (dataChannel?.readyState === 'open') {
        const pingTime = Date.now();
        dataChannel.send(JSON.stringify({ type: 'PING', time: pingTime }));
      }
    }, 2000); // Check latency every 2 seconds

    return () => clearInterval(interval);
  }, [dataChannel]);

  const sendScroll = (direction) => {
    if (!dataChannel || dataChannel.readyState !== 'open') return;
    const midX = 360; // Center for a 720p width
    const startY = direction === 'up' ? 1000 : 300;
    const endY = direction === 'up' ? 300 : 1000;
    dataChannel.send(JSON.stringify({ 
      type: 'SWIPE', xStart: midX, yStart: startY, xEnd: midX, yEnd: endY 
    }));
    addLog(`Command: Scroll ${direction}`);
  };

  const sendText = (text) => {
    if (dataChannel?.readyState === 'open') {
      dataChannel.send(JSON.stringify({ type: 'TYPE_TEXT', text }));
      addLog(`Command: Typed text`);
    }
  };

  const sendZoom = (direction) => {
    if (dataChannel?.readyState === 'open') {
      dataChannel.send(JSON.stringify({ type: 'ZOOM', direction }));
      addLog(`Command: Zoom ${direction}`);
    }
  };

  const handleWheel = (e) => {
    if (activeStreamMode !== 'screen' || !dataChannel || dataChannel.readyState !== 'open') return;
    e.preventDefault(); // Prevents the whole page from scrolling while controlling the device screen
    const midX = 360;
    const startY = e.deltaY > 0 ? 1000 : 300;
    const endY = e.deltaY > 0 ? 300 : 1000;
    dataChannel.send(JSON.stringify({ 
      type: 'SWIPE', xStart: midX, yStart: startY, xEnd: midX, yEnd: endY 
    }));
  };

  const handleKeyDown = (e) => {
    if (activeStreamMode !== 'screen' || !dataChannel || dataChannel.readyState !== 'open') return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return; // Ignore if typing in an actual input field

    if (e.key.length === 1) {
      sendText(e.key);
    } else if (e.key === 'Enter') {
      sendText('\n');
    }
  };

  const handlePointerDown = (e) => {
    if (videoRef.current && videoRef.current.paused) {
      videoRef.current.play().catch(() => {});
    }
    if (activeStreamMode !== 'screen') return;

    const rect = videoRef.current.getBoundingClientRect();
    const xPercent = (e.clientX - rect.left) / rect.width;
    const yPercent = (e.clientY - rect.top) / rect.height;
    
    dragStart.current = { x: xPercent, y: yPercent, time: Date.now() };
  };

  const handlePointerUp = (e) => {
    if (!dragStart.current || activeStreamMode !== 'screen') return;
    if (!dataChannel || dataChannel.readyState !== 'open') {
      dragStart.current = null;
      return;
    }

    const rect = videoRef.current.getBoundingClientRect();
    const xPercent = (e.clientX - rect.left) / rect.width;
    const yPercent = (e.clientY - rect.top) / rect.height;

    const dx = xPercent - dragStart.current.x;
    const dy = yPercent - dragStart.current.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    const phoneXStart = Math.round(dragStart.current.x * 720);
    const phoneYStart = Math.round(dragStart.current.y * 1520);
    const phoneXEnd = Math.round(xPercent * 720);
    const phoneYEnd = Math.round(yPercent * 1520);

    // If distance moved is > 2% of screen, count it as a swipe
    if (dist > 0.02) {
      const command = JSON.stringify({ type: 'SWIPE', xStart: phoneXStart, yStart: phoneYStart, xEnd: phoneXEnd, yEnd: phoneYEnd });
      dataChannel.send(command);
      addLog(`Sent Swipe: to (${phoneXEnd}, ${phoneYEnd})`);
    } else {
      // Short click without moving much counts as a Tap
      const timeDiff = Date.now() - dragStart.current.time;
      if (timeDiff < 500) {
        const command = JSON.stringify({ type: 'TAP', x: phoneXEnd, y: phoneYEnd });
        dataChannel.send(command);
        addLog(`Sent Tap: ${phoneXEnd}, ${phoneYEnd}`);
      }
    }
    dragStart.current = null;
  };

  const handleResync = async (pcToUse = peerConnection) => {
    const pc = pcToUse;
    if (!pc || !activeDevice) return;
    addLog("🔄 Re-syncing connection...");
    
    try {
      // 1. Tell WebRTC to clear the old ICE state
      if (typeof pc.restartIce === 'function') pc.restartIce(); 
      
      // 2. Create a new "Restart Offer"
      const offer = await pc.createOffer({ iceRestart: true, offerToReceiveVideo: true, offerToReceiveAudio: true });
      await pc.setLocalDescription(offer);
      
      // 3. Write the new offer to Firebase
      const devicePath = `users/${user.uid}/devices/${activeDevice}`;
      await set(ref(db, `${devicePath}/webrtc/offer`), { type: offer.type, sdp: offer.sdp });
      addLog("✅ Re-sync offer sent via Firebase.");
    } catch (err) {
      addLog(`❌ Re-sync failed: ${err.message}`);
    }
  };

  useEffect(() => {
    // Only assign if it's a new stream to prevent interrupting playback
    if (remoteStream && videoRef.current && videoRef.current.srcObject !== remoteStream) {
      videoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  const startLiveStream = async (mode = 'back') => {
    if (!activeDevice) return;
    setActiveStreamMode(mode);
    addLog(`Preparing ${mode} camera...`);
    setPlayError(false);
    
    // 1. Path alignment: Fixed path to include 'users/' prefix
    const devicePath = `users/${user.uid}/devices/${activeDevice}`;

    // 2. Cleanup old signaling data
    const webrtcRef = ref(db, `${devicePath}/webrtc`);
    await remove(ref(db, `${devicePath}/commands`));
    await remove(webrtcRef); // Clear out old offers and answers

    // 3. Use hardcoded STUN/TURN Server Credentials to match Android exactly
    const iceServers = [
      // Google STUN Fallbacks
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      // Metered.ca TURN/STUN Servers
      { urls: "stun:stun.relay.metered.ca:80" },
      {
        urls: "turn:global.relay.metered.ca:80",
        username: "224c962be80f2e28e7c83594",
        credential: "ilp3UEd/KvtGxw+v",
      },
      {
        urls: "turn:global.relay.metered.ca:80?transport=tcp",
        username: "224c962be80f2e28e7c83594",
        credential: "ilp3UEd/KvtGxw+v",
      },
      {
        urls: "turn:global.relay.metered.ca:443",
        username: "224c962be80f2e28e7c83594",
        credential: "ilp3UEd/KvtGxw+v",
      },
      {
        urls: "turns:global.relay.metered.ca:443?transport=tcp",
        username: "224c962be80f2e28e7c83594",
        credential: "ilp3UEd/KvtGxw+v",
      }
    ];

    // 4. Initialize PeerConnection
    const pc = new RTCPeerConnection({
      iceServers: iceServers
    });

    // Add this right after you initialize your RTCPeerConnection
    pc.ontrack = (event) => {
      console.log("TRACK RECEIVED FROM ANDROID:", event.streams[0]);
      const stream = event.streams && event.streams[0] ? event.streams[0] : new MediaStream([event.track]);
      addLog("Success: Video stream received!");
      setRemoteStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    };

    // 4. Setup Firebase for Signaling
    setSigState('connected');
    addLog("✅ Signaling Connected (Firebase).");

    // Listen for Answer from Phone
    const answerRef = ref(db, `${devicePath}/webrtc/answer`);
    onValue(answerRef, async (snapshot) => {
      const data = snapshot.val();
      if (data && !pc.currentRemoteDescription) {
        try {
          const sdpInit = typeof data === 'string' ? { type: 'answer', sdp: data } : data;
          await pc.setRemoteDescription(new RTCSessionDescription(sdpInit));
          addLog("Handshake: Finalized.");
        } catch (err) {
          console.error("Answer parsing error:", err, data);
          addLog(`❌ Handshake Error: ${err.message}`);
        }
      }
    });

    // Listen for Candidates from Phone
    const deviceIceRef = ref(db, `${devicePath}/webrtc/ice_candidates_device`);
    onChildAdded(deviceIceRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        try {
          const parsedData = typeof data === 'string' ? JSON.parse(data) : data;
          const candidate = new RTCIceCandidate({
            candidate: parsedData.candidate,
            sdpMLineIndex: parsedData.sdpMLineIndex,
            sdpMid: parsedData.sdpMid
          });
          // Add the Android phone's network paths to the browser
          pc.addIceCandidate(candidate).catch(e => console.error("Error adding device ICE candidate", e));
        } catch (err) {
          console.error("ICE parsing error:", err, data);
        }
      }
    });

    // Step A: Notify the Phone via Firebase
    await set(ref(db, `${devicePath}/commands`), {
      action: mode === 'screen' ? 'START_SCREEN' : 'START_STREAM',
      status: 'pending',
      cameraMode: mode,
      timestamp: Date.now()
    });

    // Step B: Send the WebRTC Offer via Firebase
    setTimeout(async () => {
      try {
        // --- SET offerToReceiveAudio to FALSE ---
        const offer = await pc.createOffer({ offerToReceiveVideo: true, offerToReceiveAudio: false });
        await pc.setLocalDescription(offer);
        
        await set(ref(db, `${devicePath}/webrtc/offer`), { type: offer.type, sdp: offer.sdp });
        addLog("Signaling: Video-Only Offer sent to phone.");
      } catch (err) {
        addLog(`❌ Create Offer Error: ${err.message}`);
      }
    }, 1500);

    // 6. Handle Outgoing ICE Candidates
    pc.onicecandidate = (e) => {
      if (e.candidate) {
        const browserIceRef = ref(db, `${devicePath}/webrtc/ice_candidates_browser`);
        push(browserIceRef, e.candidate.toJSON());
      }
    };

    pc.oniceconnectionstatechange = () => setIceState(pc.iceConnectionState);
    pc.onconnectionstatechange = () => setConnState(pc.connectionState);

    setPeerConnection(pc);
  };

  const stopLiveStream = () => {
    if (!activeDevice) return;
    const devicePath = `users/${user.uid}/devices/${activeDevice}`;

    // Cleanup Firebase Listeners
    off(ref(db, `${devicePath}/webrtc/answer`));
    off(ref(db, `${devicePath}/webrtc/ice_candidates_device`));

    if (peerConnection) {
      if (peerConnection.signalingState !== 'closed') {
        peerConnection.getSenders().forEach(sender => peerConnection.removeTrack(sender));
      }
      peerConnection.close();
      setPeerConnection(null);
    }
    setRemoteStream(null);
    setDataChannel(null);
    setActiveStreamMode(null);
    setPlayError(false);
    setIceState('disconnected');
    setConnState('disconnected');
    setSigState('disconnected');
    set(ref(db, `${devicePath}/commands`), { action: 'STOP_STREAM' });
    
    remove(ref(db, `${devicePath}/webrtc`)).catch(() => {});
  };

  const handleHardReset = async () => {
    if (!activeDevice) return;
    addLog("⚠️ Initializing Hard Reset...");

    const devicePath = `users/${user.uid}/devices/${activeDevice}`;

    // 1. Close existing peer connection
    if (peerConnection) {
        peerConnection.close();
        setPeerConnection(null);
    }

    // 2. Clear command node in Firebase
    const nodesToClear = [
        'commands'
    ];

    try {
        const promises = nodesToClear.map(node => remove(ref(db, `${devicePath}/${node}`)));
        await Promise.all(promises);
        
        addLog("✅ Firebase Cleaned. Reloading...");
        
        // 3. Reload the browser to clear memory/state
        setTimeout(() => {
            window.location.reload();
        }, 1000);
    } catch (err) {
        addLog("❌ Reset Failed: " + err.message);
    }
  };

  function ChangeView({ center, activeDevice }) {
    const map = useMap();
    const currentLat = center ? center[0] : null;
    const currentLng = center ? center[1] : null;

    useEffect(() => {
      if (currentLat != null && currentLng != null && !isNaN(currentLat) && !isNaN(currentLng)) {
        map.setView([currentLat, currentLng], map.getZoom(), { animate: true });
      }
    }, [currentLat, currentLng, activeDevice, map]); // Re-center live as the device moves
    return null;
  }

  function GlobalMapBounds({ devices }) {
    const map = useMap();
    useEffect(() => {
      const bounds = [];
      Object.values(devices).forEach(d => {
        const loc = getDeviceLocation(d);
        if (loc) bounds.push([loc.lat, loc.lng]);
      });
      if (bounds.length > 0) {
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [map, Object.keys(devices).length]); // Only snap on device count changes
    return null;
  }

  useEffect(() => {
    const devicesRef = ref(db, `users/${user.uid}/devices`);
    const unsubscribe = onValue(devicesRef, (snapshot) => {
      const data = snapshot.val();
      
      if (data) {
        Object.keys(data).forEach(id => {
          const device = data[id];
          const currentLoc = getDeviceLocation(device);
          const prevLoc = prevLocationsRef.current[id];
          
          let heading = currentLoc?.heading;
          
          if (currentLoc && prevLoc) {
            // Calculate bearing if the device moved significantly
            if (Math.abs(currentLoc.lat - prevLoc.lat) > 0.00001 || Math.abs(currentLoc.lng - prevLoc.lng) > 0.00001) {
              heading = calculateHeading(prevLoc.lat, prevLoc.lng, currentLoc.lat, currentLoc.lng);
            } else if (prevLoc.computedHeading !== undefined) {
              heading = prevLoc.computedHeading;
            }
          }
          
          if (currentLoc) {
            prevLocationsRef.current[id] = { lat: currentLoc.lat, lng: currentLoc.lng, computedHeading: heading };
            device.computedHeading = heading;
          }
        });
      }

      console.log("Realtime Data:", data); // Check your F12 console for this!
      setDevices(data || {});
      
      // Automatically select the first online device if none is currently selected
      if (data) {
        setActiveDevice(currentActive => {
          if (!currentActive || !data[currentActive]) {
            const onlineDevice = Object.keys(data).find(id => data[id].status === 'online');
            return onlineDevice || Object.keys(data)[0] || null;
          }
          return currentActive;
        });
      } else {
        setActiveDevice(null);
      }
    });
    return () => unsubscribe();
  }, [user.uid]);

  const addTestDevice = () => {
    if (!("geolocation" in navigator)) {
      alert("Geolocation is not supported by your browser");
      return;
    }

    alert("Requesting continuous location tracking... Please click 'Allow' in your browser popup.");

    navigator.geolocation.watchPosition(
      (pos) => {
        const deviceRef = ref(db, `users/${user.uid}/devices/test-browser`);
        set(deviceRef, {
          name: "My Web Browser",
          battery: 100,
          location: {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            altitude: pos.coords.altitude != null ? pos.coords.altitude : 15.2, // Provide mock altitude if browser omits it
            speed: pos.coords.speed && pos.coords.speed > 0.5 ? (pos.coords.speed * 3.6).toFixed(1) : 0,
            accuracy: pos.coords.accuracy || 0,
            heading: pos.coords.heading || null,
          },
          status: 'online',
          lastSeen: Date.now()
        }).catch(err => console.error("Firebase location update failed:", err));
      },
      (err) => {
        console.warn("Location error: ", err);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  const saveDeviceName = async (deviceId) => {
    if (!editName.trim()) {
      setEditingId(null);
      setEditName('');
      return;
    }
    const nameRef = ref(db, `users/${user.uid}/devices/${deviceId}/name`);
    try {
      await set(nameRef, editName);
      setEditingId(null);
      setEditName('');
    } catch (err) {
      alert("Error saving name: " + err.message);
    }
  };

  const startEdit = (deviceId, currentName) => {
    setEditingId(deviceId);
    setEditName(currentName || '');
  };

  const removeDevice = async (deviceId) => {
    const confirmDelete = window.confirm("Are you sure you want to remove this device?");
    if (!confirmDelete) return;

    if (activeDevice === deviceId) {
      stopLiveStream();
      setActiveDevice(null);
    }

    const deviceRef = ref(db, `users/${user.uid}/devices/${deviceId}`);
    try {
      await remove(deviceRef);
      // Note: We don't need a manual setDevices() here because the Firebase onValue listener 
      // will instantly detect the deletion and update the UI automatically.
    } catch (err) {
      alert("Error removing device: " + err.message);
    }
  };

  const deleteOfflineVideo = async (videoId) => {
    if (!window.confirm("Are you sure you want to delete this recording?")) return;
    try {
      await remove(ref(db, `users/${user.uid}/devices/${activeDevice}/offlineVideos/${videoId}`));
      addLog("Deleted emergency recording.");
    } catch (err) {
      alert("Error deleting recording: " + err.message);
    }
  };

  // Temporary debug trick to expose videoRef to the console
  window.myVideo = videoRef;

  return (
    <>
    <style>{`
      .app-bg { background-color: #030305; background-image: radial-gradient(circle at 0% 0%, rgba(59, 130, 246, 0.15), transparent 40%), radial-gradient(circle at 100% 100%, rgba(16, 185, 129, 0.1), transparent 40%); }
      .glass-panel { background: rgba(15, 15, 17, 0.6); backdrop-filter: blur(32px); -webkit-backdrop-filter: blur(32px); border: 1px solid rgba(255, 255, 255, 0.06); box-shadow: 0 25px 50px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255,255,255,0.08); }
      .device-card { transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1); border-left: 4px solid transparent !important; }
      .device-card:hover { transform: translateX(8px); border-color: rgba(59, 130, 246, 0.3) !important; box-shadow: 0 15px 35px rgba(59, 130, 246, 0.15) !important; background: rgba(39, 39, 42, 0.5) !important; }
      .device-card.active { border-left-color: #3b82f6 !important; background: linear-gradient(90deg, rgba(59, 130, 246, 0.15) 0%, rgba(39, 39, 42, 0.6) 100%) !important; border-color: rgba(59, 130, 246, 0.5) !important; box-shadow: 0 10px 30px rgba(59, 130, 246, 0.2) !important; transform: translateX(6px); }
      .btn-hover { transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1); outline: none; border-top: 1px solid rgba(255,255,255,0.2) !important; }
      .btn-hover:hover { transform: translateY(-4px) scale(1.03); filter: brightness(1.2); box-shadow: 0 15px 30px rgba(0,0,0,0.5) !important; }
      .btn-hover:active { transform: translateY(1px) scale(0.98); box-shadow: 0 4px 10px rgba(0,0,0,0.3) !important; }
      .log-scroll::-webkit-scrollbar { width: 8px; height: 8px; }
      .log-scroll::-webkit-scrollbar-track { background: rgba(0,0,0,0.3); border-radius: 10px; margin: 10px; }
      .log-scroll::-webkit-scrollbar-thumb { background: rgba(100, 100, 110, 0.8); border-radius: 10px; border: 1px solid rgba(255,255,255,0.1); }
      .log-scroll::-webkit-scrollbar-thumb:hover { background: #52525b; }
      .status-dot { height: 10px; width: 10px; background-color: #10b981; border-radius: 50%; display: inline-block; box-shadow: 0 0 12px #10b981, 0 0 24px #10b981; margin-right: 6px; }
      .recording-dot { animation: pulseRed 1.5s infinite; height: 12px; width: 12px; background-color: #ef4444; border-radius: 50%; display: inline-block; }
      @keyframes pulseRed { 0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.9); } 70% { box-shadow: 0 0 0 12px rgba(239, 68, 68, 0); } 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); } }
      .gradient-text { background: linear-gradient(to right, #60a5fa, #a78bfa); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
      .float-anim { animation: float 5s ease-in-out infinite; }
      @keyframes float { 0% { transform: translateY(0px); } 50% { transform: translateY(-15px); } 100% { transform: translateY(0px); } }
      .empty-glow { position: relative; width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; }
      .empty-glow::before { content: ''; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 250px; height: 250px; background: radial-gradient(circle, rgba(59, 130, 246, 0.3) 0%, transparent 70%); z-index: -1; animation: pulseGlow 4s ease-in-out infinite alternate; }
      @keyframes pulseGlow { 0% { opacity: 0.4; transform: translate(-50%, -50%) scale(0.8); } 100% { opacity: 1; transform: translate(-50%, -50%) scale(1.2); } }
      .animate-slide-up { animation: slideUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards; opacity: 0; transform: translateY(30px); }
      .delay-1 { animation-delay: 0.1s; } .delay-2 { animation-delay: 0.2s; } .delay-3 { animation-delay: 0.3s; } .delay-4 { animation-delay: 0.4s; }
      @keyframes slideUp { to { opacity: 1; transform: translateY(0); } }
      .stylish-input { transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1); box-shadow: inset 0 2px 6px rgba(0,0,0,0.5); font-family: "Fira Code", monospace; }
      .stylish-input:focus { border-color: #3b82f6 !important; box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.25), inset 0 2px 6px rgba(0,0,0,0.5) !important; background: rgba(0,0,0,0.8) !important; }
      .tech-grid { background-size: 60px 60px; background-image: linear-gradient(to right, rgba(255, 255, 255, 0.015) 1px, transparent 1px), linear-gradient(to bottom, rgba(255, 255, 255, 0.015) 1px, transparent 1px); }
      .segmented-control { background: rgba(0,0,0,0.5); padding: 8px; border-radius: 24px; border: 1px solid rgba(255,255,255,0.03); box-shadow: inset 0 4px 20px rgba(0,0,0,0.5); display: flex; gap: 6px; }
      .segment-btn { padding: 12px 24px; border-radius: 16px; border: 1px solid transparent; background: transparent; color: #a1a1aa; font-weight: 700; font-size: 0.95rem; cursor: pointer; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); display: flex; align-items: center; gap: 10px; letter-spacing: 0.5px; }
      .segment-btn:hover:not([data-active="true"]) { background: rgba(255,255,255,0.08); color: #f4f4f5; transform: translateY(-2px); border: 1px solid rgba(255,255,255,0.1); }
      .segment-btn[data-active="true"] { transform: scale(1.02); color: #fff; border: 1px solid rgba(255,255,255,0.15); text-shadow: 0 2px 4px rgba(0,0,0,0.3); }
      .tool-panel { background: rgba(0,0,0,0.4); padding: 8px; border-radius: 24px; border: 1px solid rgba(255,255,255,0.03); box-shadow: inset 0 4px 20px rgba(0,0,0,0.5); display: flex; gap: 8px; }
      .card-watermark { position: absolute; right: -15px; bottom: -25px; font-size: 7rem; opacity: 0.04; transform: rotate(-15deg); pointer-events: none; user-select: none; }
      .scanline { width: 100%; height: 150px; background: linear-gradient(0deg, rgba(0,0,0,0) 0%, rgba(59,130,246,0.15) 50%, rgba(0,0,0,0) 100%); position: absolute; bottom: 100%; animation: scanline 7s linear infinite; pointer-events: none; z-index: 5; }
      @keyframes scanline { 0% { bottom: 100%; } 100% { bottom: -150px; } }
      .blink-cursor { animation: blink 1s step-end infinite; }
      @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
    `}</style>
    <div className="app-bg" style={{ display: 'flex', height: '100vh', color: '#f4f4f5', fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', overflow: 'hidden' }}>
      {/* Sidebar: Device List */}
      <div className="glass-panel log-scroll" style={{ width: '360px', margin: '24px 0 24px 24px', borderRadius: '32px', padding: '32px 28px', display: 'flex', flexDirection: 'column', overflowY: 'auto', zIndex: 10 }}>
        
        {/* Admin Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px', paddingBottom: '24px', borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem', border: '2px solid rgba(255,255,255,0.2)', boxShadow: '0 4px 15px rgba(59, 130, 246, 0.3)' }}>
              🛡️
            </div>
            <div style={{ color: '#a1a1aa', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ color: '#fff', fontWeight: '800', fontSize: '1.1rem', letterSpacing: '-0.3px' }}>{user.email.split('@')[0]}</span>
                <span style={{ display: 'flex', alignItems: 'center', fontSize: '0.75rem', marginTop: '2px' }}><span className="status-dot" style={{height: '6px', width: '6px'}}></span> S.H.I.B.A Active</span>
              </div>
            </div>
          </div>
          <button onClick={() => signOut(auth)} className="btn-hover" style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#fca5a5', border: '1px solid rgba(239, 68, 68, 0.3)', padding: '8px', borderRadius: '10px', cursor: 'pointer', fontSize: '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Logout">⏏️</button>
        </div>
        
        {/* Link Device Section */}
        <div style={{ marginBottom: '32px' }}>
          <h3 style={{ color: '#a1a1aa', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '16px', marginTop: 0, fontWeight: '700' }}>🔗 Link Device</h3>
          <button 
            onClick={() => setShowLinkQR(!showLinkQR)}
            style={{ 
              width: '100%', 
              padding: '12px', 
              background: showLinkQR ? 'linear-gradient(135deg, #3b82f6, #2563eb)' : 'transparent', 
              color: showLinkQR ? '#fff' : '#3b82f6', 
              border: showLinkQR ? 'none' : '1px dashed #3b82f6', 
              borderRadius: '14px',
              marginBottom: '12px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
          >
            {showLinkQR ? 'Hide QR' : 'Show QR Code'}
          </button>
          {showLinkQR && (
            <div style={{ 
              padding: '24px', 
              backgroundColor: '#fff', 
              borderRadius: '16px', 
              textAlign: 'center',
              boxShadow: '0 15px 30px rgba(0,0,0,0.4)',
              animation: 'fadeIn 0.3s ease'
            }}>
              <QRCodeCanvas value={`register:${user.uid}`} size={180} />
              <p style={{ marginTop: '15px', fontSize: '0.85rem', color: '#52525b', fontWeight: '500', margin: '15px 0 0 0' }}>
                Scan with app to link<br/>
                <small style={{ color: '#a1a1aa' }}>ID: {user.uid.slice(0,8)}...</small>
              </p>
            </div>
          )}
        </div>

        {/* Global Map Section */}
        <div style={{ marginBottom: '32px' }}>
          <h3 style={{ color: '#a1a1aa', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '16px', marginTop: 0, fontWeight: '700' }}>🗺️ Fleet Tracking</h3>
          <button 
            onClick={() => { setShowGlobalMap(true); setActiveDevice(null); }}
            style={{ 
              width: '100%', 
              padding: '12px', 
              background: showGlobalMap ? 'linear-gradient(135deg, #10b981, #059669)' : 'rgba(16, 185, 129, 0.1)', 
              color: showGlobalMap ? '#fff' : '#34d399', 
              border: showGlobalMap ? 'none' : '1px dashed rgba(16, 185, 129, 0.4)', 
              borderRadius: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <span style={{ fontSize: '1.1rem' }}>🌍</span> Locate All Devices
          </button>
        </div>

        {/* My Devices List */}
        <h3 style={{ color: '#a1a1aa', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '16px', marginTop: 0, fontWeight: '800' }}>💻 Connected Nodes</h3>
        <button onClick={addTestDevice} className="btn-hover" style={{ marginBottom: '24px', width: '100%', background: 'rgba(16, 185, 129, 0.1)', color: '#34d399', border: '1px dashed rgba(16, 185, 129, 0.4)', padding: '14px', borderRadius: '16px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}><span>+</span> Add Test Node</button>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {Object.keys(devices).map(id => {
            const device = devices[id];
            const isSelected = activeDevice === id;
            const batLevel = Number(device.battery) || 0;
            const batColor = batLevel > 50 ? '#10b981' : batLevel > 20 ? '#fbbf24' : '#ef4444';
            
            // --- THE FIX: Ghost Device Protection ---
            // If the phone hasn't updated Firebase in the last 60 seconds, it's dead.
            const isActuallyOnline = device.status === 'online' && (Date.now() - device.lastSeen < 60000); 
            const nodeStatusColor = isActuallyOnline ? '#10b981' : '#ef4444';
            const nodeStatusText = isActuallyOnline ? 'Online' : 'Offline';
            
            return (
            <div key={id} className={`device-card ${isSelected ? 'active' : ''}`} style={{
              padding: '20px', borderRadius: '20px', cursor: 'pointer',
              backgroundColor: 'rgba(0, 0, 0, 0.2)',
              border: '1px solid rgba(255, 255, 255, 0.03)',
              opacity: isActuallyOnline ? 1 : 0.6 // Dim offline devices
            }}>
              <div onClick={() => { setActiveDevice(id); setShowGlobalMap(false); }}>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '12px' }}>
                  <span style={{ fontSize: '1.2rem', marginRight: '10px' }}>📱</span>
                  {editingId === id ? (
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onBlur={() => saveDeviceName(id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveDeviceName(id);
                        if (e.key === 'Escape') { setEditingId(null); setEditName(''); }
                      }}
                      autoFocus
                      style={{ color: '#fff', background: '#09090b', border: '1px solid #3b82f6', padding: '6px 10px', borderRadius: '6px', fontSize: '0.9rem', width: '100%', outline: 'none' }}
                    />
                  ) : (
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
                    <span style={{ fontWeight: '600', fontSize: '1rem', color: isSelected ? '#fff' : '#e4e4e7', letterSpacing: '0.3px' }} onDoubleClick={() => startEdit(id, device?.name || id)}>
                      {device?.name || id}
                    </span>
                    <span 
                      onClick={(e) => { e.stopPropagation(); startEdit(id, device?.name || id); }}
                      style={{ marginLeft: 'auto', cursor: 'pointer', fontSize: '0.85rem', opacity: 0.5 }}
                      title="Edit Device Name"
                    >✏️</span>
                  </div>
                  )}
                </div>
                <div style={{ paddingLeft: '34px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#a1a1aa', fontSize: '0.8rem', fontWeight: '600', marginBottom: '6px' }}>
                    <span style={{ color: batColor }}>{device.battery}%</span>
                    {/* Updated to use our new Ghost Device filter */}
                    <span style={{ display: 'flex', alignItems: 'center', color: nodeStatusColor }}>
                        <span className="status-dot" style={{height: '6px', width: '6px', backgroundColor: nodeStatusColor, boxShadow: `0 0 12px ${nodeStatusColor}`}}></span> 
                        {nodeStatusText}
                    </span>
                    
                  </div>
                  <div className="battery-bar" style={{ width: '100%', height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', overflow: 'hidden' }}><div className="battery-fill" style={{ width: `${batLevel}%`, height: '100%', background: batColor, borderRadius: '2px', transition: 'width 1s ease-in-out' }}></div></div>
                </div>
              </div>
              {isSelected && (
                <button className="btn-hover" onClick={(e) => { e.stopPropagation(); removeDevice(id); }} style={{ marginTop: '20px', width: '100%', background: 'rgba(239, 68, 68, 0.1)', color: '#fca5a5', border: '1px solid rgba(239, 68, 68, 0.2)', padding: '10px', borderRadius: '12px', fontSize: '0.85rem', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>🗑️ Disconnect Node</button>
              )}
            </div>
            );
          })}
        </div>
      </div>

      {/* Main Content */}
      <div className="log-scroll tech-grid" style={{ flex: 1, padding: '32px 48px', overflowY: 'auto' }}>
        {showGlobalMap ? (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div className="animate-slide-up" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h1 style={{ color: '#f4f4f5', margin: 0, fontSize: '2.8rem', display: 'flex', alignItems: 'center', gap: '16px', fontWeight: '900', letterSpacing: '-1px' }}>
                🌍 <span className="gradient-text">Fleet Map</span>
              </h1>
              <div style={{ background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)', padding: '8px 16px', borderRadius: '20px', display: 'flex', alignItems: 'center', gap: '10px', color: '#34d399', fontWeight: '800', letterSpacing: '1px', fontSize: '0.85rem' }}>
                <span className="status-dot" style={{ margin: 0 }}></span> {Object.keys(devices).length} NODES ONLINE
              </div>
            </div>
            <div className="glass-panel animate-slide-up delay-1" style={{ flex: 1, borderRadius: '32px', padding: '12px', position: 'relative', zIndex: 0, minHeight: '500px' }}>
              <div style={{ height: '100%', width: '100%', borderRadius: '20px', overflow: 'hidden', position: 'relative' }}>
                <MapContainer center={[20.2961, 85.8245]} zoom={2} maxZoom={30} style={{ height: '100%', width: '100%' }}>
                  <GlobalMapBounds devices={devices} />
                  <LayersControl position="topright">
                    <LayersControl.BaseLayer checked name="Google Maps">
                      <TileLayer url="https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}" attribution="&copy; Google" maxZoom={30} maxNativeZoom={20} />
                    </LayersControl.BaseLayer>
                    <LayersControl.BaseLayer name="Google Satellite">
                      <TileLayer url="https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}" attribution="&copy; Google" maxZoom={30} maxNativeZoom={20} />
                    </LayersControl.BaseLayer>
                  </LayersControl>
                  
                  {Object.keys(devices).map(id => {
                    const dev = devices[id];
                    const loc = getDeviceLocation(dev);
                    if (!loc) return null;
                    const markerHeading = dev.computedHeading ?? loc.heading;
                    return (
                      <Marker key={id} position={[loc.lat, loc.lng]} icon={getMarkerIcon(markerHeading, loc.speed)}>
                        <Popup>
                          <b>{dev.name || id}</b><br/>
                          Battery: {dev.battery}%<br/>
                          Speed: {(parseFloat(loc.speed || 0) < 2.5 ? 0 : parseFloat(loc.speed || 0)).toFixed(1)} km/h<br/>
                          Alt: {loc.alt != null ? `${parseFloat(loc.alt).toFixed(1)}m` : 'N/A'}
                        </Popup>
                      </Marker>
                    );
                  })}
                </MapContainer>
              </div>
            </div>
          </div>
        ) : selectedDevice ? (
          <div style={{ maxWidth: '1400px', margin: '0 auto', paddingBottom: '40px' }}>
            <div className="animate-slide-up" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '36px' }}>
              <h1 style={{ color: '#f4f4f5', margin: 0, fontSize: '2.8rem', display: 'flex', alignItems: 'center', gap: '16px', fontWeight: '900', letterSpacing: '-1px' }}>
                📡 <span className="gradient-text">{activeDevice ? (devices[activeDevice]?.name || activeDevice) : 'No Device'}</span>
              </h1>
              <div style={{ background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)', padding: '8px 16px', borderRadius: '20px', display: 'flex', alignItems: 'center', gap: '10px', color: '#34d399', fontWeight: '800', letterSpacing: '1px', fontSize: '0.85rem', boxShadow: '0 0 20px rgba(16,185,129,0.2)' }}>
                <span className="status-dot" style={{ margin: 0 }}></span> LIVE TRACKING
              </div>
            </div>

            {/* Status Cards */}
            <div className="animate-slide-up delay-1" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '24px', marginBottom: '36px' }}>
              <div className="glass-panel" style={cardStyle}>
                <div className="card-watermark">🔋</div>
                <div style={{ color: '#a1a1aa', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '12px', fontWeight: '800' }}>Battery Level</div>
                <div style={{ fontSize: '2.4rem', color: Number(selectedDevice.battery) > 20 ? '#34d399' : '#f87171', fontWeight: '900', letterSpacing: '-1px' }}>{selectedDevice.battery !== undefined ? Math.round(Number(selectedDevice.battery)) : 'N/A'}%</div>
              </div>
              
              <div className="glass-panel" style={cardStyle}>
                <div className="card-watermark">🚀</div>
                <div style={{ color: '#a1a1aa', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '12px', fontWeight: '800' }}>Current Speed</div>
                <div style={{ fontSize: '2.4rem', color: '#fbbf24', fontWeight: '900', letterSpacing: '-1px' }}>
                  {(() => {
                    const speedNum = parseFloat(rawSpeed || 0);
                    return (speedNum < 2.5 ? 0 : speedNum).toFixed(1); // Hide stationary drift noise under 2.5 km/h
                  })()} <span style={{ fontSize: '1.2rem', color: '#a1a1aa', fontWeight: '700', letterSpacing: '0' }}>km/h</span>
                </div>
              </div>
              
              <div className="glass-panel" style={cardStyle}>
                <div className="card-watermark">📍</div>
                <div style={{ color: '#a1a1aa', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '12px', fontWeight: '800' }}>Coordinates & Altitude</div>
                <div style={{ fontSize: '1.4rem', color: '#f4f4f5', display: 'block', marginBottom: '12px', fontWeight: '800', letterSpacing: '-0.5px' }}>{rawLat != null ? parseFloat(rawLat).toFixed(6) : 'N/A'}, {rawLng != null ? parseFloat(rawLng).toFixed(6) : 'N/A'}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                  <span style={{ fontSize: '0.9rem', color: '#9ca3af', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>Alt: {rawAlt != null ? `${parseFloat(rawAlt).toFixed(1)}m` : 'N/A'}</span>
                    <span style={{ opacity: 0.5 }}>•</span>
                    <span>Acc: {rawAcc != null ? `±${parseFloat(rawAcc).toFixed(1)}m` : 'N/A'}</span>
                  </span>
                  <button 
                    className="btn-hover"
                    onClick={() => mapInstance && mapInstance.setView(position, mapInstance.getZoom(), { animate: true })} 
                    style={{ padding: '8px 14px', background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: '10px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: '700' }}
                  >
                    🎯 Recenter
                  </button>
                </div>
              </div>
            </div>

            {/* Leaflet Map */}
            <div className="glass-panel animate-slide-up delay-3" style={{ height: '520px', width: '100%', borderRadius: '32px', padding: '12px', marginBottom: '40px', position: 'relative', zIndex: 0 }}>
              <div style={{ position: 'absolute', top: '24px', left: '24px', zIndex: 400, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.1)', padding: '10px 16px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '10px', pointerEvents: 'none', boxShadow: '0 10px 25px rgba(0,0,0,0.5)' }}>
                <span className="status-dot"></span> <span style={{ color: '#fff', fontSize: '0.8rem', fontWeight: '800', letterSpacing: '1px' }}>GPS ACTIVE</span>
              </div>
              <div style={{ height: '100%', width: '100%', borderRadius: '20px', overflow: 'hidden', position: 'relative' }}>
                <MapContainer center={position} zoom={18} maxZoom={30} style={{ height: '100%', width: '100%' }} ref={setMapInstance}>
                <ChangeView center={position} activeDevice={activeDevice} />
                <LayersControl position="topright">
                  <LayersControl.BaseLayer checked name="Google Maps">
                    <TileLayer
                      url="https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}"
                      attribution="&copy; Google"
                      maxZoom={30}
                      maxNativeZoom={20}
                    />
                  </LayersControl.BaseLayer>
                  <LayersControl.BaseLayer name="Google Satellite">
                    <TileLayer
                      url="https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}"
                      attribution="&copy; Google"
                      maxZoom={30}
                      maxNativeZoom={20}
                    />
                  </LayersControl.BaseLayer>
                  <LayersControl.BaseLayer name="OpenStreetMap">
                    <TileLayer
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                      maxZoom={30}
                      maxNativeZoom={19}
                    />
                  </LayersControl.BaseLayer>
                  <LayersControl.BaseLayer name="Satellite Map">
                    <TileLayer
                      url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                      attribution='Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
                      maxZoom={30}
                      maxNativeZoom={19}
                    />
                  </LayersControl.BaseLayer>
                  <LayersControl.BaseLayer name="Terrain Map">
                    <TileLayer
                      url="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png"
                      attribution='Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a>'
                      maxZoom={30}
                      maxNativeZoom={17}
                    />
                  </LayersControl.BaseLayer>
                </LayersControl>
                
                {rawAcc > 0 && (
                  <Circle 
                    center={position} 
                    radius={Math.max(5, parseFloat(rawAcc))} 
                    pathOptions={{ color: '#4285F4', fillColor: '#4285F4', fillOpacity: 0.15, weight: 1 }} 
                  />
                )}
                <Marker 
                  position={position}
                  icon={markerIcon}
                  draggable={true}
                  eventHandlers={{
                    dragend: (e) => {
                      if (!activeDevice) return;
                      const marker = e.target;
                      const newPos = marker.getLatLng();
                      const locationRef = ref(db, `users/${user.uid}/devices/${activeDevice}/location`);
                      
                      update(locationRef, {
                        latitude: newPos.lat,
                        longitude: newPos.lng
                      });
                    }
                  }}
                >
                  <Popup>
                    <b>{activeDevice ? (devices[activeDevice]?.name || activeDevice) : 'Unknown'}</b> <br/>
                    Speed: {(parseFloat(rawSpeed || 0) < 2.5 ? 0 : parseFloat(rawSpeed || 0)).toFixed(1)} km/h<br/>
                    Alt: {rawAlt != null ? `${parseFloat(rawAlt).toFixed(1)}m` : 'N/A'}
                  </Popup>
                </Marker>
              </MapContainer>
              </div>
            </div>

            {/* Command Center */}
            <div className="glass-panel animate-slide-up delay-2" style={{ padding: '28px 36px', borderRadius: '36px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '24px', marginBottom: '40px', position: 'relative', overflow: 'hidden' }}>
               {/* Ambient Glow Bar at the top of the command center */}
               <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '4px', background: 'linear-gradient(90deg, transparent, #3b82f6, #10b981, #8b5cf6, transparent)' }}></div>
               
               {/* Stream Mode Selector */}
               <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
                 <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                   <span style={{ color: '#a1a1aa', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '2px', fontWeight: '800' }}>Target</span>
                   <span style={{ color: '#f4f4f5', fontSize: '1.2rem', fontWeight: '800', letterSpacing: '-0.5px' }}>MODE</span>
                 </div>
                 <div className="segmented-control">
                   <button onClick={() => startLiveStream('back')} className="segment-btn" data-active={activeStreamMode === 'back'} style={activeStreamMode === 'back' ? { background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)', boxShadow: '0 8px 25px rgba(59, 130, 246, 0.4)' } : {}}>
                     <span style={{ fontSize: '1.2rem', filter: activeStreamMode === 'back' ? 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))' : 'grayscale(100%) opacity(0.7)' }}>📸</span> Back Cam
                   </button>
                   <button onClick={() => startLiveStream('front')} className="segment-btn" data-active={activeStreamMode === 'front'} style={activeStreamMode === 'front' ? { background: 'linear-gradient(135deg, #10b981, #047857)', boxShadow: '0 8px 25px rgba(16, 185, 129, 0.4)' } : {}}>
                     <span style={{ fontSize: '1.2rem', filter: activeStreamMode === 'front' ? 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))' : 'grayscale(100%) opacity(0.7)' }}>🤳</span> Front Cam
                   </button>
                   <button onClick={() => startLiveStream('screen')} className="segment-btn" data-active={activeStreamMode === 'screen'} style={activeStreamMode === 'screen' ? { background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)', boxShadow: '0 8px 25px rgba(139, 92, 246, 0.4)' } : {}}>
                     <span style={{ fontSize: '1.2rem', filter: activeStreamMode === 'screen' ? 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))' : 'grayscale(100%) opacity(0.7)' }}>🖥️</span> Screen
                   </button>
                 </div>
               </div>

               {/* Quick Tools */}
               <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
                 <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', textAlign: 'right' }}>
                   <span style={{ color: '#a1a1aa', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '2px', fontWeight: '800' }}>Quick</span>
                   <span style={{ color: '#f4f4f5', fontSize: '1.2rem', fontWeight: '800', letterSpacing: '-0.5px' }}>TOOLS</span>
                 </div>
                 <div className="tool-panel">
                   <button style={{...actionBtn, padding: '10px 20px', background: 'rgba(245, 158, 11, 0.1)', color: '#fbbf24', border: '1px solid rgba(245, 158, 11, 0.2)', boxShadow: 'none'}} className="btn-hover" onClick={() => alert("Listening...")}>
                     <span style={{ fontSize: '1.1rem' }}>🎙️</span> Mic
                   </button>
                   <button 
                     onClick={handleRecordClip} 
                     disabled={isRecording || !remoteStream}
                     className="btn-hover" 
                     style={{...actionBtn, padding: '10px 20px', background: isRecording ? 'linear-gradient(135deg, #ef4444, #b91c1c)' : 'rgba(20, 184, 166, 0.1)', color: isRecording ? '#fff' : '#2dd4bf', border: isRecording ? 'none' : '1px solid rgba(20, 184, 166, 0.2)', boxShadow: isRecording ? '0 8px 20px rgba(239, 68, 68, 0.4)' : 'none', opacity: (!remoteStream) ? 0.4 : 1, cursor: (!remoteStream) ? 'not-allowed' : 'pointer'}}
                   >
                     {isRecording ? <><span className="recording-dot" style={{width: '10px', height: '10px', boxShadow: 'none'}}></span> 10s...</> : <><span style={{ fontSize: '1.1rem' }}>📹</span> Clip</>}
                   </button>
                   <button onClick={handleHardReset} className="btn-hover" style={{...actionBtn, padding: '10px 20px', background: 'rgba(239, 68, 68, 0.1)', color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.2)', boxShadow: 'none'}}>
                     <span style={{ fontSize: '1.1rem' }}>🔄</span> Reset
                   </button>
                 </div>
               </div>
            </div>

            {/* Stream & Logs Grid Layout */}
            <div className="animate-slide-up delay-4" style={{ display: 'flex', flexDirection: peerConnection && activeStreamMode === 'screen' ? 'row' : 'column', gap: '24px', alignItems: 'stretch' }}>
              
              {/* Video Feed Overlay or Section */}
              {peerConnection && (
                <div className="glass-panel" style={{ flex: activeStreamMode === 'screen' ? '0 0 auto' : '1 1 auto', minWidth: activeStreamMode === 'screen' ? '380px' : '100%', borderRadius: '32px', overflow: 'hidden', border: '1px solid rgba(239, 68, 68, 0.4)', boxShadow: '0 20px 50px rgba(239, 68, 68, 0.15)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(0, 0, 0, 0.4)', padding: '20px 32px', borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                    <h3 style={{ color: '#fca5a5', margin: 0, fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span className="recording-dot" style={{boxShadow: '0 0 15px rgba(239, 68, 68, 0.8)'}}></span>
                      LIVE CCTV <span style={{ opacity: 0.7, fontSize: '0.9rem', fontWeight: 'normal' }}>({remoteStream ? 'Connected' : 'Connecting...'})</span>
                    </h3>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button 
                  className="btn-hover"
                  onClick={() => handleResync(peerConnection)}
                  style={{ padding: '10px 20px', background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: '10px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 'bold' }}
                >
                  🔄 Re-Sync
                </button>
                <button 
                  className="btn-hover"
                  onClick={stopLiveStream}
                  style={{ padding: '10px 20px', background: 'linear-gradient(135deg, #ef4444, #b91c1c)', color: '#fff', border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 'bold', boxShadow: '0 4px 12px rgba(239, 68, 68, 0.4)' }}
                >
                  🛑 Stop
                </button>
              </div>
                  </div>
            <div style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)', padding: '8px 32px', display: 'flex', gap: '24px', fontSize: '0.8rem', borderBottom: '1px solid rgba(255, 255, 255, 0.05)', color: '#a1a1aa' }}>
                <span>Signaling: <strong style={{ color: sigState === 'connected' ? '#10b981' : '#fbbf24' }}>{sigState.toUpperCase()}</strong></span>
                <span>ICE State: <strong style={{ color: iceState === 'connected' || iceState === 'completed' ? '#10b981' : iceState === 'failed' ? '#ef4444' : '#fbbf24' }}>{iceState.toUpperCase()}</strong></span>
                <span>Connection: <strong style={{ color: connState === 'connected' ? '#10b981' : connState === 'failed' ? '#ef4444' : '#fbbf24' }}>{connState.toUpperCase()}</strong></span>
            </div>
                  <div style={{ position: 'relative', width: '100%', minHeight: '600px', backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
                    {/* Live Performance Diagnostics Overlay */}
                    <div style={{
                      position: 'absolute', top: '10px', right: '10px',
                      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)', padding: '10px 14px',
                      borderRadius: '8px', fontSize: '0.75rem', color: '#34d399',
                      border: '1px solid #059669', zIndex: 10, fontFamily: 'monospace',
                      pointerEvents: 'none' /* Let clicks pass through to video */
                    }}>
                      <div>📡 LATENCY: {latency}ms</div>
                      <div>📺 {videoRef.current?.videoWidth || 0}x{videoRef.current?.videoHeight || 0}</div>
                      <div style={{ color: latency < 100 ? '#34d399' : '#f87171' }}>
                        ● {latency < 100 ? 'OPTIMAL' : 'LAGGING'}
                      </div>
                    </div>

                    <div 
                      tabIndex={0}
                      onWheel={handleWheel}
                      onKeyDown={handleKeyDown}
                      style={{ 
                        height: activeStreamMode === 'screen' ? '70vh' : 'auto', 
                        width: activeStreamMode === 'screen' ? 'auto' : '100%',
                        aspectRatio: activeStreamMode === 'screen' ? '9/19' : '16/9',
                        position: 'relative',
                        backgroundColor: '#09090b',
                        borderRadius: activeStreamMode === 'screen' ? '36px' : '16px',
                        border: '12px solid #18181b',
                        boxShadow: '0 0 0 2px #3f3f46, 0 30px 60px rgba(0,0,0,0.7)',
                        overflow: 'hidden',
                        zIndex: 1,
                        margin: '0 auto',
                        outline: 'none'
                      }}
                    >
                      {/* Fake Phone Notch - Only shown in screen mode */}
                      {activeStreamMode === 'screen' && <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: '120px', height: '28px', backgroundColor: '#18181b', borderBottomLeftRadius: '16px', borderBottomRightRadius: '16px', zIndex: 10 }}></div>}
                      
                      {/* Camera HUD & Viewfinder - Only shown in TV/Camera mode */}
                      {activeStreamMode !== 'screen' && (
                        <>
                          <div className="scanline"></div>
                          <div style={{ position: 'absolute', top: '24px', left: '24px', zIndex: 10, display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(0,0,0,0.6)', padding: '8px 16px', borderRadius: '10px', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.1)' }}>
                            <span className="recording-dot" style={{width: '8px', height: '8px'}}></span>
                            <span style={{ color: '#fff', fontSize: '0.8rem', fontWeight: '800', letterSpacing: '2px' }}>{activeStreamMode === 'front' ? 'FRONT CAM' : 'REAR CAM'}</span>
                          </div>
                          <div style={{ position: 'absolute', top: '24px', right: '24px', width: '30px', height: '30px', borderTop: '3px solid rgba(255,255,255,0.4)', borderRight: '3px solid rgba(255,255,255,0.4)', zIndex: 10, borderRadius: '0 4px 0 0' }}></div>
                          <div style={{ position: 'absolute', bottom: '24px', left: '24px', width: '30px', height: '30px', borderBottom: '3px solid rgba(255,255,255,0.4)', borderLeft: '3px solid rgba(255,255,255,0.4)', zIndex: 10, borderRadius: '0 0 0 4px' }}></div>
                          <div style={{ position: 'absolute', bottom: '24px', right: '24px', width: '30px', height: '30px', borderBottom: '3px solid rgba(255,255,255,0.4)', borderRight: '3px solid rgba(255,255,255,0.4)', zIndex: 10, borderRadius: '0 0 4px 0' }}></div>
                        </>
                      )}

                      <video 
                        ref={videoRef} autoPlay playsInline muted
                        onPointerDown={handlePointerDown} onPointerUp={handlePointerUp} onPointerLeave={() => { dragStart.current = null; }} onContextMenu={(e) => e.preventDefault()} 
                        onLoadedMetadata={(e) => {
                          const playPromise = e.target.play();
                          if (playPromise !== undefined) {
                            playPromise
                              .then(() => setPlayError(false))
                              .catch((error) => {
                                console.warn("Auto-play prevented:", error);
                                setPlayError(true);
                              });
                          }
                        }}
                      style={{ width: '100%', height: '100%', backgroundColor: 'black', objectFit: 'cover', cursor: activeStreamMode === 'screen' ? 'pointer' : 'default', touchAction: 'none', position: 'relative', zIndex: 1 }}
                      />
                    </div>
                    
                    {playError && (
                      <button 
                        onClick={() => {
                          if (videoRef.current) videoRef.current.play().catch(console.error);
                          setPlayError(false);
                        }}
                        style={{ 
                          position: 'absolute', 
                          top: '50%', 
                          left: '50%', 
                          transform: 'translate(-50%, -50%)', 
                          padding: '15px 30px', 
                          fontSize: '1.2rem', 
                          zIndex: 10, 
                          cursor: 'pointer', 
                          borderRadius: '8px', 
                          backgroundColor: 'rgba(239, 68, 68, 0.9)', 
                          backdropFilter: 'blur(4px)',
                          color: 'white', 
                          border: 'none', 
                          boxShadow: '0 10px 25px rgba(0,0,0,0.5)' 
                        }}
                      >
                    ▶️ Click to Initialize Video
                      </button>
                    )}
                  </div>
                  
                  {/* Remote Control Actions */}
                  <div style={{ padding: '20px 28px', borderTop: '1px solid rgba(255, 255, 255, 0.05)', display: 'flex', gap: '12px', flexWrap: 'wrap', backgroundColor: 'rgba(0, 0, 0, 0.3)' }}>
                    {activeStreamMode === 'screen' ? (
                      <>
                        <button onClick={() => sendScroll('down')} className="btn-hover" style={{...actionBtn, padding: '8px 16px', fontSize: '0.85rem', background: 'linear-gradient(135deg, #4b5563, #374151)'}}>⬇️ Scroll Down</button>
                        <button onClick={() => sendScroll('up')} className="btn-hover" style={{...actionBtn, padding: '8px 16px', fontSize: '0.85rem', background: 'linear-gradient(135deg, #4b5563, #374151)'}}>⬆️ Scroll Up</button>
                        <input 
                          type="text" 
                          placeholder="Type message to phone and press Enter..." 
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && e.target.value.trim()) {
                              sendText(e.target.value);
                              e.target.value = ""; 
                            }
                          }}
                          className="stylish-input"
                          style={{
                            flex: 1, padding: '10px 16px', borderRadius: '12px', minWidth: '200px',
                            background: 'rgba(0,0,0,0.4)', color: '#fff', border: '1px solid rgba(255, 255, 255, 0.1)', outline: 'none', fontSize: '0.95rem'
                          }}
                        />
                      </>
                    ) : (
                      <>
                        <button onClick={() => sendZoom('in')} className="btn-hover" style={{...actionBtn, padding: '10px 20px', fontSize: '0.85rem', background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)'}}>🔍 Zoom In</button>
                        <button onClick={() => sendZoom('out')} className="btn-hover" style={{...actionBtn, padding: '10px 20px', fontSize: '0.85rem', background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)'}}>🔎 Zoom Out</button>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* System Logs UI */}
              <div className="glass-panel log-scroll" style={{ 
                  flex: '1 1 auto',
                  padding: '32px', 
                  borderRadius: '32px',
                  height: peerConnection && activeStreamMode === 'screen' ? 'auto' : '250px',
                  minHeight: '200px',
                  maxHeight: peerConnection && activeStreamMode === 'screen' ? '75vh' : '400px',
                  overflowY: 'auto',
                  fontFamily: '"Fira Code", "JetBrains Mono", monospace',
                  fontSize: '0.85rem',
              }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#a1a1aa', marginBottom: '24px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: '20px' }}>
                    <span style={{ fontWeight: '800', fontSize: '0.9rem', letterSpacing: '2px', textTransform: 'uppercase' }}>👨‍💻 Terminal Logs</span>
                    <button 
                      className="btn-hover"
                      onClick={() => setLogs([])} 
                      style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', color: '#fca5a5', cursor: 'pointer', fontSize: '0.75rem', padding: '8px 14px', borderRadius: '8px', fontWeight: 'bold' }}
                    >
                      Clear
                    </button>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {logs.length === 0 && <div style={{ color: '#52525b', fontStyle: 'italic', textAlign: 'center', padding: '30px 0' }}>Waiting for activity...</div>}
                    {logs.map((log, i) => (
                        <div key={i} style={{ color: log.includes('Success') || log.includes('Connected') ? '#34d399' : log.includes('Error') ? '#f87171' : '#38bdf8', lineHeight: '1.5', display: 'flex', gap: '10px' }}>
                          <span style={{ color: '#52525b', userSelect: 'none' }}>&gt;</span> 
                          <span>{log}</span>
                        </div>
                    ))}
                    {logs.length > 0 && (
                      <div style={{ color: '#38bdf8', marginTop: '4px' }}><span className="blink-cursor">█</span></div>
                    )}
                  </div>
              </div>
            </div>

            {/* Emergency Power-Off Videos */}
            {selectedDevice?.offlineVideos && Object.keys(selectedDevice.offlineVideos).length > 0 && (
              <div className="glass-panel animate-slide-up delay-4" style={{ marginTop: '36px', borderRadius: '32px', padding: '32px', border: '1px solid rgba(239, 68, 68, 0.3)', boxShadow: '0 10px 30px rgba(239, 68, 68, 0.15)' }}>
                <h3 style={{ color: '#fca5a5', margin: '0 0 24px 0', display: 'flex', alignItems: 'center', gap: '12px', fontSize: '1.2rem', fontWeight: '700' }}>
                  <span className="recording-dot"></span> Emergency Power-Off Recordings
                </h3>
                <div className="log-scroll" style={{ display: 'flex', gap: '15px', overflowX: 'auto', paddingBottom: '10px' }}>
                  {Object.keys(selectedDevice.offlineVideos).map(vidId => {
                    const video = selectedDevice.offlineVideos[vidId];
                    return (
                      <div key={vidId} style={{ backgroundColor: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255, 255, 255, 0.05)', padding: '16px', borderRadius: '20px', minWidth: '300px', flexShrink: 0 }}>
                        <video src={video.url} controls preload="metadata" style={{ width: '100%', height: '170px', objectFit: 'cover', borderRadius: '12px', marginBottom: '12px', backgroundColor: '#000' }} />
                        <div style={{ fontSize: '0.85rem', color: '#a1a1aa', marginBottom: '15px' }}>
                          📅 {new Date(video.timestamp).toLocaleString()}
                        </div>
                        <div style={{ display: 'flex', gap: '10px' }}>
                          <a href={video.url} className="btn-hover" download={`Emergency_${vidId}.mp4`} target="_blank" rel="noreferrer" style={{ flex: 1, display: 'inline-block', textAlign: 'center', background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)', color: '#fff', padding: '10px', borderRadius: '10px', textDecoration: 'none', fontSize: '0.85rem', fontWeight: 'bold' }}>⬇️ Download</a>
                          <button className="btn-hover" onClick={() => deleteOfflineVideo(vidId)} style={{ background: 'linear-gradient(135deg, #ef4444, #b91c1c)', color: '#fff', border: 'none', padding: '10px 14px', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold' }}>🗑️ Delete</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Local Recordings Folder */}
            {clips.length > 0 && (
              <div className="glass-panel animate-slide-up delay-4" style={{ marginTop: '36px', borderRadius: '32px', padding: '32px', border: '1px solid rgba(59, 130, 246, 0.3)', boxShadow: '0 10px 30px rgba(59, 130, 246, 0.1)' }}>
                <h3 style={{ color: '#93c5fd', margin: '0 0 24px 0', display: 'flex', alignItems: 'center', gap: '12px', fontSize: '1.2rem', fontWeight: '700' }}>
                  📁 Session Recordings
                </h3>
                <div className="log-scroll" style={{ display: 'flex', gap: '15px', overflowX: 'auto', paddingBottom: '10px' }}>
                  {clips.map(clip => (
                    <div key={clip.id} style={{ backgroundColor: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255, 255, 255, 0.05)', padding: '16px', borderRadius: '20px', minWidth: '300px', flexShrink: 0 }}>
                      <video src={clip.url} controls preload="metadata" style={{ width: '100%', height: '170px', objectFit: 'cover', borderRadius: '12px', marginBottom: '12px', backgroundColor: '#000' }} />
                      <div style={{ fontSize: '0.85rem', color: '#a1a1aa', marginBottom: '15px' }}>
                        📅 {new Date(clip.timestamp).toLocaleString()}
                      </div>
                      <div style={{ display: 'flex', gap: '10px' }}>
                        <a href={clip.url} className="btn-hover" download={`Clip_${clip.id}.webm`} style={{ flex: 1, display: 'inline-block', textAlign: 'center', background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)', color: '#fff', padding: '10px', borderRadius: '10px', textDecoration: 'none', fontSize: '0.85rem', fontWeight: 'bold' }}>⬇️ Download</a>
                        <button className="btn-hover" onClick={() => deleteLocalClip(clip.id, clip.url)} style={{ background: 'linear-gradient(135deg, #ef4444, #b91c1c)', color: '#fff', border: 'none', padding: '10px 14px', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold' }}>🗑️ Delete</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="empty-glow animate-slide-up" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#a1a1aa' }}>
            <div className="float-anim" style={{ fontSize: '6.5rem', marginBottom: '24px', filter: 'drop-shadow(0 20px 30px rgba(59, 130, 246, 0.5))' }}>🛰️</div>
            <h2 style={{ color: '#fff', marginBottom: '16px', fontSize: '2.4rem', fontWeight: '700', letterSpacing: '-0.5px' }}>Waiting for Target</h2>
            <p style={{ fontSize: '1.15rem', marginBottom: '40px', color: '#a1a1aa', maxWidth: '450px', textAlign: 'center', lineHeight: '1.6' }}>Select a device from the sidebar or scan the QR code below to establish a secure connection.</p>
            
            <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px', borderRadius: '32px', boxShadow: '0 20px 40px rgba(0,0,0,0.4)' }}>
              <div style={{ background: '#fff', padding: '20px', borderRadius: '16px', marginBottom: '20px' }}>
                <QRCodeCanvas value={user.uid} size={200} />
              </div>
              <div style={{ textAlign: 'center' }}>
                <p style={{ margin: '0 0 8px 0', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '1px', color: '#71717a' }}>Your Admin UID</p>
                <code style={{ fontSize: '1.1rem', color: '#3b82f6', background: '#3b82f620', padding: '8px 16px', borderRadius: '8px' }}>{user.uid}</code>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
    </>
  );
}

const cardStyle = { 
  padding: '32px', 
  borderRadius: '24px', 
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  position: 'relative',
  overflow: 'hidden'
};

const actionBtn = { 
  padding: '12px 24px', 
  color: '#fff', 
  border: '1px solid rgba(255, 255, 255, 0.12)', 
  borderRadius: '16px', 
  cursor: 'pointer', 
  fontWeight: '700',
  fontSize: '0.95rem',
  letterSpacing: '0.5px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '10px',
  textShadow: '0 2px 5px rgba(0,0,0,0.4)',
  backdropFilter: 'blur(10px)'
};