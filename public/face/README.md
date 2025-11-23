Face enrollment models and usage

- This folder contains the client script `enroll.js` used by `views/enroll.ejs`.
- face-api.js requires model weight files (SSD Mobilenet, faceLandmark68, faceRecognitionNet).

Steps to prepare locally:
1. Create a directory `public/models`.
2. Download the following weight files from the face-api.js repository and place them in `public/models`:
   - `ssd_mobilenetv1_model-weights_manifest.json` and related shard files
   - `face_landmark_68_model-weights_manifest.json` and related shard files
   - `face_recognition_model-weights_manifest.json` and related shard files

Simpler: clone or download the models from https://github.com/justadudewhohacks/face-api.js/tree/master/weights and copy into `public/models`.

After placing the files, open `http://localhost:3000/enroll` and start the camera.

Notes:
- For privacy, only descriptors (arrays of numbers) are sent to the server, not images.
- Tuning: default matching threshold in server is 0.6 (adjust in `routes/qrcode.js`).
