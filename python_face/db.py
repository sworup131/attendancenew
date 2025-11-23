import os
import datetime
from pymongo import MongoClient


def get_db():
    uri = os.environ.get('MONGO_URI', 'mongodb://localhost:27017/')
    # default DB name compatible with the Node app
    client = MongoClient(uri)
    dbname = os.environ.get('MONGO_DB', 'logindb')
    return client[dbname]


def save_detection(record):
    """Insert a face detection record into `face_detections` collection.

    record example:
    {
      'label': 'user1' or 'unknown',
      'bbox': {'x': 10, 'y': 20, 'w': 100, 'h': 120},
      'frame_size': {'width': 1280, 'height': 720},
      'confidence': 45.3,  # lower is better for LBPH
      'timestamp': datetime.datetime.utcnow()
    }
    """
    db = get_db()
    coll = db['face_detections']
    if 'timestamp' not in record:
        record['timestamp'] = datetime.datetime.utcnow()
    res = coll.insert_one(record)
    return res.inserted_id


if __name__ == '__main__':
    # quick smoke test
    print('Connecting to MongoDB...')
    db = get_db()
    print('Collections:', db.list_collection_names())