import dlib
import cv2
import numpy as np
from flask import Flask, request, jsonify
import joblib
from jose import JWTError, jwt
import datetime
import os

# ====================== KONFIGURASI ======================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SHAPE_PREDICTOR = os.path.join(BASE_DIR, "shape_predictor_68_face_landmarks.dat")
FACE_RECOG_MODEL = os.path.join(BASE_DIR, "dlib_face_recognition_resnet_model_v1.dat")
SECRET_KEY = "your_secret_key" # Use a secure key for signing JWT tokens
# Inisialisasi dlib
detector = dlib.get_frontal_face_detector()
predictor = dlib.shape_predictor(SHAPE_PREDICTOR)
face_rec_model = dlib.face_recognition_model_v1(FACE_RECOG_MODEL)
# Memuat model yang sudah dilatih
knn = joblib.load(os.path.join(BASE_DIR, 'knn_model.pkl'))
le = joblib.load(os.path.join(BASE_DIR, 'label_encoder.pkl'))
X_train = np.load(os.path.join(BASE_DIR, 'face_encodings.npy'))
# ====================== FUNGSI ======================
def get_face_encoding(image, face):
    shape = predictor(image, face)
    return np.array(face_rec_model.compute_face_descriptor(image, shape))

def generate_token(user_id):
    """
    Function to generate JWT token for the user.
    """
    payload = {
        'user_id': user_id,
        'exp': datetime.datetime.utcnow() + datetime.timedelta(hours=1) # Token expiration time (1 hour)
    }
    token = jwt.encode(payload, SECRET_KEY, algorithm='HS256')
    return token
    
def verify_token(token):
    """
    Function to verify the provided JWT token.
    """
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=['HS256'])
        return payload['user_id']
    except JWTError:
        return None

app = Flask(__name__)
@app.route('/login', methods=['POST'])
def login():
    # Example login route
    # Here you would verify the user's credentials from a database
    # For the sake of this example, let's assume that user ID '123' is authenticated
    user_id = '123' # This would come from the authentication process (e.g., checking email/password)
    if user_id:
        # Generate a token if login is successful
        token = generate_token(user_id)
        return jsonify({'status': 'success', 'token': token})
    else:
        return jsonify({'status': 'fail', 'message': 'Invalid credentials'}), 401
        
@app.route('/recognize-face', methods=['POST'])
def recognize_face():
    # # Verify token before proceeding
    # token = request.headers.get('Authorization')
    # if token is None:
    # return jsonify({'status': 'fail', 'message': 'Token is missing'}), 403
    # user_id = verify_token(token)
    # if user_id is None:
    # return jsonify({'status': 'fail', 'message': 'Invalid or expired token'}), 403
    # Proceed with face recognition if token is valid

    file = request.files['image']
    img_array = np.asarray(bytearray(file.read()), dtype=np.uint8)
    image = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
    
    # Deteksi wajah
    rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    faces = detector(rgb)
    results = []

    for face in faces:
        # Face encoding
        encoding = get_face_encoding(rgb, face)
        
        # Prediksi dengan KNN
        encoding_2d = encoding.reshape(1, -1)
        pred_encoded = knn.predict(encoding_2d)[0]
        pred_name = le.inverse_transform([pred_encoded])[0]

        # Hitung confidence (jarak ke tetangga terdekat)
        distances, _ = knn.kneighbors(encoding_2d, n_neighbors=3)
        confidence = 1 / (1 + distances[0][0]) # Semakin kecil jarak, semakin tinggi confidence
        label = pred_name if confidence > 0.4 else "Unknown" # Threshold confidence

        # Simpan hasil
        results.append({
            'label': label,
            'confidence': confidence
        })
        
    if len(results) == 0:
        return jsonify({
            'status': 'fail',
            'message': 'Tidak ada wajah terdeteksi',
            'faces': []
        }), 400

    best_result = results[0]

    if best_result['label'] == "Unknown":
        return jsonify({
            'status': 'fail',
            'message': 'Wajah tidak dikenali',
            'faces': results
        }), 401

    return jsonify({
        'status': 'success',
        'faces': results,
        'face_label': best_result['label']
    })

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)