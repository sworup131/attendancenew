const video = document.getElementById('video')
const overlay = document.getElementById('overlay')
const captureBtn = document.getElementById('capture')
const enrollBtn = document.getElementById('enroll')
const labelInput = document.getElementById('label')
const output = document.getElementById('output')
const addFaceBtn = document.getElementById('addFace')
const trainBtn = document.getElementById('trainBtn')
const markBtn = document.getElementById('markAttendance')
const status = document.getElementById('status')
const classInput = document.getElementById('classInput')
const thumbs = document.getElementById('thumbs')

async function startCamera(){
  try{
    const stream = await navigator.mediaDevices.getUserMedia({video:true})
    video.srcObject = stream
    const setOverlaySize = ()=>{
      // match overlay to the video's displayed size (CSS layout), not the raw capture resolution
      const w = video.clientWidth || video.videoWidth
      const h = video.clientHeight || video.videoHeight
      overlay.width = w
      overlay.height = h
      overlay.style.width = w + 'px'
      overlay.style.height = h + 'px'
    }
    video.addEventListener('loadedmetadata', setOverlaySize)
    // also update on resize in case the page layout changes
    window.addEventListener('resize', setOverlaySize)
    // initial attempt to set size
    setTimeout(setOverlaySize, 100)
  }catch(e){
    output.innerText = 'Camera error: '+e
  }
}

function captureToDataURL(){
  const canvas = document.createElement('canvas')
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  const ctx = canvas.getContext('2d')
  ctx.drawImage(video,0,0,canvas.width,canvas.height)
  return canvas.toDataURL('image/jpeg')
}

function addThumbnail(dataUrl, label){
  if(!thumbs) return
  const wrapper = document.createElement('div')
  wrapper.className = 'thumb-item'
  const img = document.createElement('img')
  img.src = dataUrl
  img.alt = label || 'capture'
  img.style.width = '100px'
  img.style.height = '75px'
  img.style.objectFit = 'cover'
  img.style.border = '1px solid #ddd'
  img.style.margin = '4px'
  const lbl = document.createElement('div')
  lbl.style.fontSize = '11px'
  lbl.style.color = '#333'
  lbl.style.textAlign = 'center'
  lbl.style.marginTop = '2px'
  lbl.innerText = label || ''
  wrapper.appendChild(img)
  wrapper.appendChild(lbl)
  // prepend so newest are at top-left
  if(thumbs.firstChild){
    thumbs.insertBefore(wrapper, thumbs.firstChild)
  }else{
    thumbs.appendChild(wrapper)
  }
  // keep at most 12 thumbnails
  while(thumbs.childElementCount > 12){
    thumbs.removeChild(thumbs.lastChild)
  }
}

function clearOverlay(){
  const ctx = overlay.getContext('2d')
  ctx.clearRect(0,0,overlay.width, overlay.height)
}

function drawBoxes(faces){
  const ctx = overlay.getContext('2d')
  ctx.clearRect(0,0,overlay.width, overlay.height)
  ctx.lineWidth = Math.max(2, Math.round(overlay.width/200))
  ctx.strokeStyle = 'rgba(0,200,0,0.9)'
  // faces from server use coordinates relative to the captured frame size (frame_size).
  // compute scale from frame_size -> displayed overlay size
  faces.forEach(f=>{
    const srcW = f.frame_size && f.frame_size.width ? f.frame_size.width : overlay.width
    const srcH = f.frame_size && f.frame_size.height ? f.frame_size.height : overlay.height
    const scaleX = overlay.width / srcW
    const scaleY = overlay.height / srcH
    const x = Math.round(f.bbox.x * scaleX)
    const y = Math.round(f.bbox.y * scaleY)
    const w = Math.round(f.bbox.w * scaleX)
    const h = Math.round(f.bbox.h * scaleY)
    ctx.fillStyle = 'rgba(0,200,0,0.15)'
    ctx.fillRect(x,y,w,h)
    ctx.strokeRect(x,y,w,h)
    // intentionally do not draw label text inside the box (label display disabled)
  })
  // auto clear after 3 seconds
  setTimeout(clearOverlay, 3000)
}

async function postJSON(url, body){
  const r = await fetch(url, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
  return r.json()
}

captureBtn.addEventListener('click', async ()=>{
  status.innerText = 'Verifying...'
  output.innerText = ''
  const img = captureToDataURL()
  try{
    const res = await postJSON('/recognize', {image: img})
    status.innerText = ''
    if(res && res.faces){
      output.innerText = res.faces.map(f=>`${f.label} (${f.confidence===null? 'n/a': f.confidence.toFixed(1)})`).join('\n')
      drawBoxes(res.faces)
      // show captured thumbnail for verify
      try{ addThumbnail(img, 'verify') }catch(e){}
    }else{
      output.innerText = JSON.stringify(res, null, 2)
    }
  }catch(e){
    status.innerText = ''
    output.innerText = 'Verify failed: '+e
  }
})

enrollBtn.addEventListener('click', async ()=>{
  const label = labelInput.value.trim()
  if(!label){ output.innerText='Provide label to enroll'; return }
  output.innerText = 'Sending enroll frame...'
  const img = captureToDataURL()
  const res = await postJSON('/enroll-image', {image: img, label})
  output.innerText = JSON.stringify(res, null, 2)
  try{ addThumbnail(img, label) }catch(e){}
})

addFaceBtn.addEventListener('click', async ()=>{
  const label = labelInput.value.trim()
  if(!label){ output.innerText='Provide label to add face data'; return }
  status.innerText = 'Adding...'
  const img = captureToDataURL()
  try{
    const res = await postJSON('/add-face-data', {image: img, label})
    status.innerText = ''
    output.innerText = JSON.stringify(res, null, 2)
    console.log('addFace: entered label=', label, 'server returned records=', res && res.records ? res.records.length : 0)
    if(res && res.records){
      const faces = res.records.map(r=>({bbox:r.bbox, frame_size:r.frame_size, label: label}))
      drawBoxes(faces)
      try{ addThumbnail(img, label) }catch(e){}
    }
  }catch(e){
    status.innerText = ''
    output.innerText = 'Add failed: '+e
  }
})

markBtn.addEventListener('click', async ()=>{
  const label = labelInput.value.trim()
  if(!label){ output.innerText='Provide label to mark attendance'; return }
  status.innerText = 'Marking attendance...'
  const img = captureToDataURL()
  try{
    // detect and save face first
    const addRes = await postJSON('/add-face-data', {image: img, label})
    if(!addRes || !addRes.records || addRes.records.length === 0){
      status.innerText = ''
      output.innerText = 'No faces detected; attendance not marked.'
      return
    }
    try{ addThumbnail(img, label) }catch(e){}
    // take the first saved record id and call mark-attendance
    const record = addRes.records[0]
    const markRes = await postJSON('/mark-attendance', {label, record_id: record._id})
    status.innerText = ''
    if(markRes && markRes.inserted){
      output.innerText = 'Attendance marked for '+label+' (id: '+markRes.inserted+')'
    }else{
      output.innerText = 'Attendance mark failed: '+JSON.stringify(markRes)
    }
  }catch(e){
    status.innerText = ''
    output.innerText = 'Mark attendance failed: '+e
  }
})

trainBtn.addEventListener('click', async ()=>{
  status.innerText = 'Training...'
  try{
    const r = await fetch('/train', {method:'POST'})
    const data = await r.json()
    status.innerText = ''
    if(r.ok){
      output.innerText = 'Training completed.'
    }else{
      output.innerText = 'Training error: ' + JSON.stringify(data)
    }
  }catch(e){
    status.innerText = ''
    output.innerText = 'Training request failed: '+e
  }
})

startCamera()
