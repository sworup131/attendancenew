#!/usr/bin/env python3
"""
Simple OpenCV-based face enroll / train / live recognition script.

Features:
- Enroll: copy images into dataset/<label>/
- Train: build LBPH model from dataset
- Live: run webcam, detect faces (Haar cascade), predict label using LBPH model,
        and save detection metadata to MongoDB (`face_detections` collection).

Usage examples:
  python3 face_recognizer.py --mode enroll --label alice --images /path/to/img1.jpg /path/to/img2.jpg
  python3 face_recognizer.py --mode train
  python3 face_recognizer.py --mode live

Environment:
- MONGO_URI optional env var (defaults to mongodb://localhost:27017/)
- MONGO_DB optional env var (defaults to logindb)

"""
import argparse
import os
import shutil
import cv2
import numpy as np
from pathlib import Path
import datetime
from db import save_detection


BASE_DIR = Path(__file__).resolve().parent
DATASET_DIR = BASE_DIR / 'dataset'
MODEL_DIR = BASE_DIR / 'models'
MODEL_FILE = MODEL_DIR / 'lbph_model.yml'


def ensure_dirs():
    DATASET_DIR.mkdir(parents=True, exist_ok=True)
    MODEL_DIR.mkdir(parents=True, exist_ok=True)


def enroll_images(label, image_paths):
    ensure_dirs()
    label_dir = DATASET_DIR / label
    label_dir.mkdir(parents=True, exist_ok=True)
    for img_path in image_paths:
        p = Path(img_path)
        if not p.exists():
            print('Skipping missing image', img_path)
            continue
        dest = label_dir / p.name
        shutil.copy(str(p), str(dest))
        print('Copied', p, '->', dest)


def _detect_face(gray, face_cascade):
    faces = face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(60, 60))
    # return list of (x,y,w,h)
    return faces


def train_model():
    ensure_dirs()
    face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')

    labels = []
    images = []

    label_to_id = {}
    current_id = 0

    for person_dir in sorted(DATASET_DIR.iterdir()):
        if not person_dir.is_dir():
            continue
        label = person_dir.name
        if label not in label_to_id:
            label_to_id[label] = current_id
            current_id += 1
        for img_file in person_dir.iterdir():
            try:
                img = cv2.imread(str(img_file))
                if img is None:
                    print('Failed to read', img_file)
                    continue
                gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
                faces = _detect_face(gray, face_cascade)
                if len(faces) == 0:
                    print('No face found in', img_file)
                    continue
                # pick the largest face
                x, y, w, h = max(faces, key=lambda r: r[2] * r[3])
                roi = gray[y:y+h, x:x+w]
                roi_resized = cv2.resize(roi, (200, 200))
                images.append(roi_resized)
                labels.append(label_to_id[label])
            except Exception as e:
                print('Error processing', img_file, e)

    if len(images) == 0:
        print('No training images. Create dataset/<label> with images and retry.')
        return

    recognizer = cv2.face.LBPHFaceRecognizer_create()
    recognizer.train(images, np.array(labels))
    recognizer.write(str(MODEL_FILE))
    # save label map
    label_map_file = MODEL_DIR / 'labels.txt'
    with open(label_map_file, 'w') as f:
        for label, idx in label_to_id.items():
            f.write(f"{idx}\t{label}\n")

    print('Training complete. Model saved to', MODEL_FILE)


def load_label_map():
    label_map_file = MODEL_DIR / 'labels.txt'
    if not label_map_file.exists():
        return {}
    mapping = {}
    with open(label_map_file, 'r') as f:
        for line in f:
            parts = line.strip().split('\t')
            if len(parts) == 2:
                mapping[int(parts[0])] = parts[1]
    return mapping


def live_recognition(camera_index=0, min_confidence=80):
    face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
    if not MODEL_FILE.exists():
        print('Model not found. Run with --mode train first.')
        return

    recognizer = cv2.face.LBPHFaceRecognizer_create()
    recognizer.read(str(MODEL_FILE))
    label_map = load_label_map()

    cap = cv2.VideoCapture(camera_index)
    if not cap.isOpened():
        print('Failed to open camera')
        return

    print('Starting live recognition. Press q to quit.')
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        faces = _detect_face(gray, face_cascade)
        fh, fw = frame.shape[:2]
        for (x, y, w, h) in faces:
            roi = gray[y:y+h, x:x+w]
            try:
                roi_resized = cv2.resize(roi, (200, 200))
                label_id, confidence = recognizer.predict(roi_resized)
                # LBPH: lower confidence = better match
                label = label_map.get(label_id, 'unknown')
                # prepare record
                record = {
                    'label': label,
                    'bbox': {'x': int(x), 'y': int(y), 'w': int(w), 'h': int(h)},
                    'frame_size': {'width': int(fw), 'height': int(fh)},
                    'confidence': float(confidence),
                    'detected_at': datetime.datetime.utcnow()
                }
                # Save to MongoDB
                try:
                    save_detection(record)
                except Exception as e:
                    print('DB save error:', e)

                # annotate frame
                text = f"{label} ({confidence:.1f})"
                cv2.rectangle(frame, (x, y), (x+w, y+h), (0, 255, 0), 2)
                cv2.putText(frame, text, (x, y-10), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0,255,0), 2)
            except Exception as e:
                print('Recognition error:', e)
        cv2.imshow('Live', frame)
        key = cv2.waitKey(1) & 0xFF
        if key == ord('q'):
            break

    cap.release()
    cv2.destroyAllWindows()


def enroll_via_webcam(label, count=20, camera_index=0):
    ensure_dirs()
    label_dir = DATASET_DIR / label
    label_dir.mkdir(parents=True, exist_ok=True)

    cap = cv2.VideoCapture(camera_index)
    if not cap.isOpened():
        print('Failed to open camera')
        return

    print(f'Enrolling label "{label}". Press c to capture an image, q to quit.')
    saved = 0
    idx = 0
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        display = frame.copy()
        cv2.putText(display, f'Saved: {saved}/{count}', (10,30), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0,255,0), 2)
        cv2.imshow('Enroll - Press c to capture, q to quit', display)
        key = cv2.waitKey(1) & 0xFF
        if key == ord('c'):
            fname = label_dir / f'{label}_{int(datetime.datetime.utcnow().timestamp())}_{idx}.jpg'
            cv2.imwrite(str(fname), frame)
            saved += 1
            idx += 1
            print('Captured', fname)
            if saved >= count:
                print('Collected required images.')
                break
        elif key == ord('q'):
            print('Enrollment cancelled by user.')
            break

    cap.release()
    cv2.destroyAllWindows()


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument('--mode', choices=['enroll', 'train', 'live', 'enroll-webcam'], required=True)
    p.add_argument('--label', help='Label (person name) for enroll mode')
    p.add_argument('--images', nargs='*', help='Image paths to enroll')
    p.add_argument('--camera', type=int, default=0, help='Camera index for live mode')
    p.add_argument('--count', type=int, default=20, help='Number of images to capture for webcam enroll')
    return p.parse_args()


def main():
    args = parse_args()
    if args.mode == 'enroll':
        if not args.label or not args.images:
            print('Enroll requires --label and --images')
            return
        enroll_images(args.label, args.images)
    elif args.mode == 'enroll-webcam':
        if not args.label:
            print('enroll-webcam requires --label')
            return
        enroll_via_webcam(args.label, count=args.count, camera_index=args.camera)
    elif args.mode == 'train':
        train_model()
    elif args.mode == 'live':
        live_recognition(camera_index=args.camera)


if __name__ == '__main__':
    main()
