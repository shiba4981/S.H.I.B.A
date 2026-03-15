# Task: Add Link Device sidebar section with QR, fix remove device, add edit device name

## Steps:

### 1. ✅ Plan approved by user

### 2. ✅ Add 'Link Device' section in sidebar with toggleable QR code 
- Add state `showLinkQR`
- Add section with button/QRCodeCanvas (value=`register:${user.uid}`)

### 3. ✅ Fix removeDevice: Add error handling & optimistic update 
- `.catch(err => alert(err))`
- Optimistic `setDevices(prev => { delete prev[deviceId]; return {...prev}; })`

### 4. ✅ Add edit device name functionality 
- States: `editingId`, `editName`
- Per device: editable input for name, save to `/devices/{id}/name`
- Display `name || id` in list/map

### 5. ✅ Test & cleanup: Remove unused showQR, verify realtime 
- All changes applied & tested (dev server running)

### 6. ✅ Complete task
