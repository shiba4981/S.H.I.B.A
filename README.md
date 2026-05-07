# 🐕 S.H.I.B.A Command Center

**S.H.I.B.A** is a full-stack Remote Device Management and monitoring system. This project allows you to securely track, view, and control an Android device remotely from a web browser with near-zero latency. 

It uses **Firebase Realtime Database** for signaling and state management, and **WebRTC** for direct peer-to-peer video streaming and remote control data channels.

![S.H.I.B.A Dashboard Screenshot](https://via.placeholder.com/1000x400?text=S.H.I.B.A+Dashboard+Screenshot+Here)

## ✨ Key Features

* **⚡ Ultra-Low Latency Streaming:** Live WebRTC video feed from the target device's Front Camera, Rear Camera, or Screen.
* **🕹️ Remote Control:** Full remote access to the Android device. Simulate taps, swipes, text typing, and zooming directly from the web dashboard via WebRTC Data Channels and Android Accessibility Services.
* **🌍 Live Fleet Tracking:** Real-time GPS location tracking with speed, altitude, and accuracy indicators, rendered on an interactive Leaflet map.
* **🔋 Device Telemetry:** Live battery monitoring and strict "Ghost Device" (Online/Offline) detection using continuous heartbeat pings.
* **🔐 Secure Pairing:** Link new devices securely by scanning an auto-generated QR code from the S.H.I.B.A admin dashboard.
* **📹 Session Recording:** Record 10-second clips of the live stream directly to your local browser.
* **🛡️ Stealth/Background Operation:** Runs as a persistent Android foreground service, surviving app closures and deep sleep (Doze mode).

## 🚀 Deployment

This dashboard is optimized for seamless deployment on **Vercel**. Once your GitHub repository is linked, any new push to the `main` branch will automatically trigger a new production build. 

## �️ Tech Stack

**Web Dashboard (Frontend)**
* React.js
* WebRTC API (Video & Data Channels)
* Firebase Realtime Database (Signaling & Telemetry)
* Leaflet & React-Leaflet (Mapping)
* QR Code React (Device Pairing)

**Android Client (Target Device)**
* Java / Android SDK
* Native WebRTC (Hardware Accelerated Video/Audio Pipelines)
* Firebase SDK
* FusedLocationProvider (Google Play Services)
* Android AccessibilityService (For remote touch injection)
* MediaProjection API (For screen capturing)

## 🏗️ Architecture

1.  **Signaling:** The S.H.I.B.A dashboard and Android device exchange WebRTC SDP Offers/Answers and ICE Candidates via a shared Firebase Realtime Database node.
2.  **P2P Tunnel:** Once signaling is complete, a direct WebRTC tunnel is established. 
3.  **NAT Traversal:** If devices are behind strict firewalls, network traffic is routed through **Metered.ca TURN servers**.
4.  **Control Loop:** User interactions on the React video player are translated into JSON commands, sent through the WebRTC Data Channel, and executed on the Android device via a custom Accessibility Service.

## ⚠️ Disclaimer

**Educational and Authorized Use Only.**
This software includes features that allow for remote surveillance and control of an Android device. It is intended strictly for:
* Personal device management.
* Authorized fleet tracking.
* Educational purposes regarding WebRTC and Android system APIs.

Do not install S.H.I.B.A on any device you do not own or do not have explicit, written consent to monitor. The developers assume no liability and are not responsible for any misuse or damage caused by this program.

## 📝 License

Distributed under the MIT License. See `LICENSE` for more information.