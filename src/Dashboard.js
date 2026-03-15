import React, { useState, useEffect } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { db, auth } from './firebase';
import { ref, onValue, remove, set } from 'firebase/database';
import { signOut } from 'firebase/auth';

// Fix for the default marker icon not showing in React-Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

export default function Dashboard({ user }) {
  const [devices, setDevices] = useState({});
  const [activeDevice, setActiveDevice] = useState(null);
  // const [showQR, setShowQR] = useState(false); // unused
  const [showLinkQR, setShowLinkQR] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');

  const selectedDevice = activeDevice ? devices[activeDevice] : null;
  const position = selectedDevice ? [selectedDevice.latitude, selectedDevice.longitude] : [20.2961, 85.8245];

  function ChangeView({ center }) {
    const map = useMap();
    map.setView(center, map.getZoom());
    return null;
  }

  useEffect(() => {
    const devicesRef = ref(db, `users/${user.uid}/devices`);
    onValue(devicesRef, (snapshot) => {
      const data = snapshot.val();
      console.log("Realtime Data:", data); // Check your F12 console for this!
      setDevices(data || {});
    });
  }, [user.uid]);

  const removeDevice = (deviceId) => {
    const deviceRef = ref(db, `users/${user.uid}/devices/${deviceId}`);
    remove(deviceRef).then(() => {
      alert("Device removed successfully");
      setActiveDevice(null);
    });
  };

  const addTestDevice = () => {
    const deviceRef = ref(db, `users/${user.uid}/devices/test-device`);
    set(deviceRef, {
      battery: 100,
      latitude: 0,
      longitude: 0,
      status: 'online'
    }).then(() => {
      alert("Test device added!");
    });
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

  const removeDevice = (deviceId) => {
    const deviceRef = ref(db, `users/${user.uid}/devices/${deviceId}`);
    // Optimistic update
    setDevices(prev => {
      const newDevices = {...prev};
      delete newDevices[deviceId];
      return newDevices;
    });
    setActiveDevice(null);
    remove(deviceRef)
      .then(() => {
        alert("Device removed successfully");
      })
      .catch((err) => {
        alert("Error removing device: " + err.message);
      });
  };

  return (
    <div style={{ display: 'flex', height: '100vh', backgroundColor: '#000', color: '#fff' }}>
      {/* Sidebar: Device List */}
      <div style={{ width: '250px', borderRight: '1px solid #333', padding: '20px' }}>
        <h4>Admin: {user.email}</h4>
        <button onClick={() => signOut(auth)}>Logout</button>
        <hr/>
        {/* Link Device Section */}
        <div style={{ marginBottom: '20px' }}>
          <h3>🔗 Link Device</h3>
          <button 
            onClick={() => setShowLinkQR(!showLinkQR)}
            style={{ 
              width: '100%', 
              padding: '8px', 
              background: '#007bff', 
              color: 'white', 
              border: 'none', 
              borderRadius: '4px',
              marginBottom: '10px'
            }}
          >
            {showLinkQR ? 'Hide QR' : 'Show QR Code'}
          </button>
          {showLinkQR && (
            <div style={{ 
              padding: '15px', 
              backgroundColor: '#111', 
              borderRadius: '8px', 
              textAlign: 'center'
            }}>
              <QRCodeCanvas value={`register:${user.uid}`} size={180} />
              <p style={{ marginTop: '10px', fontSize: '0.85rem', color: '#ccc' }}>
                Scan with your device app to link<br/>
                <small>Your UID: {user.uid.slice(0,8)}...</small>
              </p>
            </div>
          )}
        </div>
        <h3>My Devices</h3>
        <button onClick={addTestDevice} style={{ marginBottom: '10px', background: 'green', color: 'white', border: 'none', padding: '5px', borderRadius: '4px' }}>Add Test Device</button>
        {Object.keys(devices).map(id => (
          <div key={id} style={{
            padding: '10px', margin: '5px 0', borderRadius: '8px', cursor: 'pointer',
            backgroundColor: activeDevice === id ? '#333' : 'transparent'
          }}>
            <div onClick={() => setActiveDevice(id)}>
              📱 {editingId === id ? (
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onBlur={() => saveDeviceName(id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveDeviceName(id);
                    if (e.key === 'Escape') {
                      setEditingId(null);
                      setEditName('');
                    }
                  }}
                  autoFocus
                  style={{
                    color: 'white',
                    background: '#222',
                    border: '1px solid #444',
                    padding: '2px 4px',
                    borderRadius: '3px',
                    fontSize: '14px',
                    minWidth: '100px'
                  }}
                />
              ) : (
                <span style={{ cursor: 'pointer' }} onDoubleClick={() => startEdit(id, devices[id]?.name || id)}>
                  {devices[id]?.name || id}
                </span>
              )} <br/> <small>{devices[id].battery}% | Online</small>
            </div>
            <button onClick={() => removeDevice(id)} style={{ marginTop: '5px', background: 'red', color: 'white', border: 'none', padding: '5px', borderRadius: '4px' }}>Remove</button>
          </div>
        ))}
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, padding: '40px', backgroundColor: '#121212' }}>
        {selectedDevice ? (
          <div>
            <h1 style={{ color: '#007bff' }}>📡 Monitoring: {activeDevice ? (devices[activeDevice]?.name || activeDevice) : 'No Device'}</h1>

            {/* Status Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', marginBottom: '30px' }}>
              <div style={cardStyle}>🔋 Battery: <br/><strong>{selectedDevice.battery}%</strong></div>
              <div style={cardStyle}>🚀 Speed: <br/><strong>{selectedDevice.speed || 0} km/h</strong></div>
              <div style={cardStyle}>📍 Lat/Lng: <br/><strong>{selectedDevice.latitude?.toFixed(4)}, {selectedDevice.longitude?.toFixed(4)}</strong></div>
            </div>

            {/* Leaflet Map */}
            <div style={{ height: '450px', width: '100%', borderRadius: '15px', overflow: 'hidden', border: '2px solid #333' }}>
              <MapContainer center={position} zoom={15} style={{ height: '100%', width: '100%' }}>
                <ChangeView center={position} />
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                />
                <Marker position={position}>
                  <Popup>
                    <b>{activeDevice ? (devices[activeDevice]?.name || activeDevice) : 'Unknown'}</b> <br/>
                    Speed: {selectedDevice?.speed || 0} km/h
                  </Popup>
                </Marker>
              </MapContainer>
            </div>

            {/* Control Actions */}
            <div style={{ marginTop: '30px' }}>
               <button style={actionBtn}>📸 Live Camera</button>
               <button style={actionBtn}>🖥️ View Screen</button>
               <button style={actionBtn} onClick={() => alert("Listening...")}>🎙️ Mic Access</button>
            </div>
          </div>
        ) : (
          <div style={{ textAlign: 'center', marginTop: '60px', color: '#666' }}>
            <h2>Select a device from the sidebar to start tracking.</h2>
            <p style={{ marginTop: '20px' }}>Scan this QR code with your phone app to register a device:</p>
            <div style={{ display: 'inline-block', marginTop: '10px', padding: '15px', background: '#111', borderRadius: '15px' }}>
              <QRCodeCanvas value={user.uid} size={200} />
            </div>
            <p style={{ marginTop: '20px', fontSize: '0.9rem', color: '#999' }}>Your ID: <strong>{user.uid}</strong></p>
          </div>
        )}
      </div>
    </div>
  );
}

const cardStyle = { backgroundColor: '#1a1a1a', padding: '20px', borderRadius: '10px', border: '1px solid #333' };
const actionBtn = { padding: '10px 20px', marginRight: '10px', backgroundColor: '#007bff', color: '#fff', border: 'none', borderRadius: '5px', cursor: 'pointer' };