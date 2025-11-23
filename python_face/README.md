Python OpenCV face recognizer

This small utility provides three modes:

- enroll: copy images into `python_face/dataset/<label>/`
- train: detect faces in dataset images and train an LBPH recognizer
- live: run webcam, detect faces, recognize using trained model, and save metadata to MongoDB

Setup
1. Create a Python virtual environment and install dependencies:

```bash
cd python_face
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

2. Ensure MongoDB is running locally (default URI: `mongodb://localhost:27017/`) or set `MONGO_URI` and `MONGO_DB` env vars.

Usage
- Enroll images for a label (person):
  ```bash
  python3 face_recognizer.py --mode enroll --label alice --images /path/to/img1.jpg /path/to/img2.jpg
  ```

- Train the LBPH model from the dataset:
  ```bash
  python3 face_recognizer.py --mode train
  ```

- Run live recognition (saves detections to `face_detections` collection):
  ```bash
  python3 face_recognizer.py --mode live
  ```

Output stored in MongoDB
- Collection: `face_detections`
- Each document contains: `label`, `bbox`, `frame_size`, `confidence`, `detected_at`.

Notes
- This is a simple demonstration using LBPH and Haar cascades; accuracy is limited.
- For production use consider using deep learning-based embeddings (dlib/face_recognition, or a dedicated service).
