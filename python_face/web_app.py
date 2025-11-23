from flask import Flask, render_template, request, jsonify, send_file
from flask_cors import CORS
import cv2
import numpy as np
import base64
import io
from PIL import Image
from pathlib import Path
from db import save_detection, get_db
import datetime

BASE_DIR = Path(__file__).resolve().parent
MODEL_DIR = BASE_DIR / 'models'
MODEL_FILE = MODEL_DIR / 'lbph_model.yml'

app = Flask(__name__, template_folder=str(BASE_DIR / 'templates'), static_folder=str(BASE_DIR / 'static'))
CORS(app)

# load cascade and model if present
face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
recognizer = None
label_map = {}
# If recognizer returns a confidence above this value, treat as 'unknown'.
# LBPH returns lower values for better matches; tune this based on your dataset.
CONFIDENCE_THRESHOLD = 80.0
if MODEL_FILE.exists():
    try:
        recognizer = cv2.face.LBPHFaceRecognizer_create()
        recognizer.read(str(MODEL_FILE))
        # load labels
        labels_file = MODEL_DIR / 'labels.txt'
        if labels_file.exists():
            with open(labels_file, 'r') as f:
                for line in f:
                    parts = line.strip().split('\t')
                    if len(parts) == 2:
                        label_map[int(parts[0])] = parts[1]
    except Exception as e:
        print('Failed to load model:', e)


def b64_to_image(b64str):
    # expected data URL or raw base64
    if b64str.startswith('data:'):
        b64str = b64str.split(',', 1)[1]
    img_bytes = base64.b64decode(b64str)
    image = Image.open(io.BytesIO(img_bytes)).convert('RGB')
    arr = np.array(image)[:, :, ::-1].copy()  # RGB to BGR
    return arr


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/recognize', methods=['POST'])
def recognize():
    global recognizer
    data = request.json
    if not data or 'image' not in data:
        return jsonify({'error': 'No image provided'}), 400
    img = b64_to_image(data['image'])
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    faces = face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(60,60))
    fh, fw = img.shape[:2]
    results = []
    for (x, y, w, h) in faces:
        roi = gray[y:y+h, x:x+w]
        try:
            roi_resized = cv2.resize(roi, (200,200))
            if recognizer is None:
                label = 'unknown'
                confidence = None
            else:
                label_id, confidence = recognizer.predict(roi_resized)
                # LBPH: lower confidence means better match. If confidence is high,
                # treat it as unknown to avoid always assigning the closest label.
                if confidence is None:
                    label = label_map.get(label_id, 'unknown')
                else:
                    try:
                        conf_value = float(confidence)
                    except Exception:
                        conf_value = confidence
                    if conf_value > CONFIDENCE_THRESHOLD:
                        label = 'unknown'
                    else:
                        label = label_map.get(label_id, 'unknown')

            # Do NOT save verification results to DB here (verify-only mode)
            result = {
                'label': label,
                'bbox': {'x': int(x), 'y': int(y), 'w': int(w), 'h': int(h)},
                'frame_size': {'width': int(fw), 'height': int(fh)},
                'confidence': float(confidence) if confidence is not None else None,
                'detected_at': datetime.datetime.utcnow()
            }
            results.append(result)
        except Exception as e:
            print('Recognition error:', e)
    return jsonify({'faces': results})


@app.route('/enroll-image', methods=['POST'])
def enroll_image():
    data = request.json
    if not data or 'image' not in data or 'label' not in data:
        return jsonify({'error': 'image and label required'}), 400
    label = data['label']
    img = b64_to_image(data['image'])
    # save to dataset/label
    ds_dir = BASE_DIR / 'dataset' / label
    ds_dir.mkdir(parents=True, exist_ok=True)
    fname = ds_dir / f'{label}_{int(datetime.datetime.utcnow().timestamp())}.jpg'
    cv2.imwrite(str(fname), img)
    return jsonify({'saved': str(fname)})


@app.route('/add-face-data', methods=['POST'])
def add_face_data():
    data = request.json
    if not data or 'image' not in data or 'label' not in data:
        return jsonify({'error': 'image and label required'}), 400
    label = data['label']
    img = b64_to_image(data['image'])
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    faces = face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(60,60))
    fh, fw = img.shape[:2]
    records = []
    db = get_db()
    coll = db['student_faces']
    images_dir = BASE_DIR / 'face_images' / label
    images_dir.mkdir(parents=True, exist_ok=True)
    for (x, y, w, h) in faces:
        # crop face region and save image
        crop = img[y:y+h, x:x+w]
        # filename with timestamp
        fname = f"{label}_{int(datetime.datetime.utcnow().timestamp())}_{x}_{y}.jpg"
        fpath = images_dir / fname
        try:
            cv2.imwrite(str(fpath), crop)
        except Exception as e:
            print('Failed to write face image', e)

        rec = {
            'label': label,
            'bbox': {'x': int(x), 'y': int(y), 'w': int(w), 'h': int(h)},
            'frame_size': {'width': int(fw), 'height': int(fh)},
            'face_width': int(w),
            'face_height': int(h),
            'image_path': str(fpath.relative_to(BASE_DIR)),
            'detected_at': datetime.datetime.utcnow()
        }
        try:
            res = coll.insert_one(rec)
            rec['_id'] = str(res.inserted_id)
            records.append(rec)
        except Exception as e:
            print('DB insert error', e)
    if len(records) == 0:
        return jsonify({'saved': 0, 'message': 'No faces detected'}), 200
    return jsonify({'saved': len(records), 'records': records})


@app.route('/train', methods=['POST'])
def train():
    # run the same train logic from face_recognizer.train_model
    from face_recognizer import train_model
    try:
        train_model()
        return jsonify({'trained': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/face_images/<path:fname>')
def serve_face_image(fname):
    # Serve saved face images from the face_images directory
    try:
        img_path = BASE_DIR / 'face_images' / fname
        if not img_path.exists():
            return ('Not found', 404)
        return send_file(str(img_path))
    except Exception as e:
        return (str(e), 500)


@app.route('/viewer')
def viewer():
    return render_template('viewer.html')


@app.route('/api/student_faces')
def api_student_faces():
    # return recent student_faces documents with pagination
    db = get_db()
    coll = db['student_faces']
    try:
        limit = int(request.args.get('limit', '50'))
    except Exception:
        limit = 50
    docs = []
    for d in coll.find().sort('detected_at', -1).limit(limit):
        d['_id'] = str(d.get('_id'))
        # ensure image_path exists
        if 'image_path' in d:
            d['image_url'] = '/' + d['image_path']
        docs.append(d)
    return jsonify({'count': len(docs), 'items': docs})


@app.route('/mark-attendance', methods=['POST'])
def mark_attendance():
    data = request.json
    if not data or 'label' not in data:
        return jsonify({'error':'label required'}), 400
    label = data.get('label')
    record_id = data.get('record_id')
    class_name = data.get('class')
    db = get_db()
    coll = db['attendance']
    rec = {
        'label': label,
        'record_id': record_id,
        'class': class_name,
        'marked_at': datetime.datetime.utcnow(),
        'source': 'web'
    }
    try:
        res = coll.insert_one(rec)
        return jsonify({'inserted': str(res.inserted_id)})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    import os
    port = int(os.environ.get('PORT', '5000'))
    app.run(host='0.0.0.0', port=port, debug=False)
