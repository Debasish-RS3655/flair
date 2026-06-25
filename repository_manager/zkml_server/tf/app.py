from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import json
import logging
import ezkl
import asyncio
import base64
import zlib

# Add backends
import numpy as np
import tensorflow as tf

app = Flask(__name__)
CORS(app)

# Silence EZKL logging
logging.getLogger('ezkl').setLevel(logging.ERROR)


def compress_and_encode(data: bytes) -> str:
    """Compress bytes with zlib and Base64‑encode."""
    compressed = zlib.compress(data)
    return base64.b64encode(compressed).decode('utf-8')


def decode_and_decompress(encoded_str: str) -> bytes:
    """Inverse of compress_and_encode."""
    decoded = base64.b64decode(encoded_str)
    return zlib.decompress(decoded)


def make_random_array(dims):
    """Generate a NumPy array of shape dims, float32 in [0,1)."""
    return np.random.rand(*dims).astype(np.float32)


def to_backend(array: np.ndarray, backend: str):
    """Convert NumPy array to the chosen backend tensor/array."""
    if backend == 'tensorflow':
        return tf.convert_to_tensor(array)
    else:  # numpy
        return array


@app.route('/upload', methods=['POST'])
def upload_file():
    # --- File and dims & backend parsing ---
    if 'file' not in request.files:
        return jsonify({'message': 'No file part'}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({'message': 'No selected file'}), 400

    model_path = 'network.onnx'
    file.save(model_path)

    # dims
    dims_str = request.form.get('dimensions')
    if not dims_str:
        return jsonify({'message': 'Missing "dimensions" field'}), 400
    try:
        dims = json.loads(dims_str)
        input_dims = dims['input_dims']
    except Exception as e:
        return jsonify({
            'message': 'Invalid dimensions JSON',
            'error': str(e)
        }), 400

    # backend
    backend = request.form.get('backend', 'numpy').lower()
    if backend not in ('numpy', 'tensorflow'):
        return jsonify({
            'message': 'Unsupported backend',
            'supported': ['numpy', 'tensorflow']
        }), 400

    # --- Async processing ---
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        loop.run_until_complete(
            process_model(model_path, input_dims, backend)
        )
    except Exception as e:
        return jsonify({'message': 'Error during processing', 'error': str(e)}), 500
    finally:
        loop.close()

    # --- Read & compress outputs ---
    with open("test.pf", "r") as pf:
        proof = compress_and_encode(pf.read().encode('utf-8'))
    with open("test.vk", "rb") as vk:
        vk_enc = compress_and_encode(vk.read())
    with open("settings.json", "r") as st:
        settings_enc = compress_and_encode(st.read().encode('utf-8'))

    # cleanup
    to_del = [
        model_path, "input.json", "calibration.json", "network.compiled",
        "witness.json", "test.pk", "test.pf", "test.vk", "settings.json"
    ]
    for f in to_del:
        if os.path.exists(f):
            os.remove(f)

    return jsonify({
        "proof": proof,
        "verification_key": vk_enc,
        "settings": settings_enc
    }), 200


async def process_model(model_path, input_dims, backend):
    # Paths
    data_path = "input.json"
    cal_path = "calibration.json"
    settings_path = "settings.json"
    compiled_path = "network.compiled"
    witness_path = "witness.json"
    pk_path = "test.pk"
    vk_path = "test.vk"
    proof_path = "test.pf"

    # 1) Generate input
    np_input = make_random_array(input_dims)
    tensor_input = to_backend(np_input, backend)
    # flatten to list
    flat_in = np_input.reshape(-1).tolist()
    with open(data_path, 'w') as f:
        json.dump({"input_data": [flat_in]}, f)

    # 2) Calibration
    calib_batch = 20
    cal_dims = [calib_batch] + input_dims[1:]
    np_calib = make_random_array(cal_dims)
    flat_cal = np_calib.reshape(-1).tolist()
    with open(cal_path, 'w') as f:
        json.dump({"input_data": [flat_cal]}, f)

    # 3) gen settings
    py_args = ezkl.PyRunArgs()
    py_args.input_visibility = "public"
    py_args.output_visibility = "public"
    py_args.param_visibility = "private"
    if not ezkl.gen_settings(model_path, settings_path, py_run_args=py_args):
        raise RuntimeError("gen_settings failed")

    # 4) calibrate
    await ezkl.calibrate_settings(cal_path, model_path, settings_path, "resources")

    # 5) compile
    if not ezkl.compile_circuit(model_path, compiled_path, settings_path):
        raise RuntimeError("compile_circuit failed")

    # 6) get SRS
    await ezkl.get_srs(settings_path)

    # 7) witness
    if not await ezkl.gen_witness(data_path, compiled_path, witness_path):
        raise RuntimeError("gen_witness failed")

    # 8) setup keys
    if not ezkl.setup(compiled_path, vk_path, pk_path):
        raise RuntimeError("setup failed")

    # 9) prove
    if not ezkl.prove(witness_path, compiled_path, pk_path, proof_path, "single"):
        raise RuntimeError("prove failed")

    # 10) verify (optional)
    if not ezkl.verify(proof_path, settings_path, vk_path):
        raise RuntimeError("verify failed")


@app.route('/verify_proof', methods=['POST'])
def verify_proof():
    data = request.get_json() or {}
    for key in ('proof', 'verification_key', 'settings'):
        if key not in data:
            return jsonify({'message': f'Missing field: {key}'}), 400

    # paths
    pf_p = "uploaded_proof.pf"
    vk_p = "uploaded_vk"
    st_p = "uploaded_settings.json"

    # decode/write
    with open(pf_p, 'w') as f:
        f.write(decode_and_decompress(data['proof']).decode('utf-8'))
    with open(vk_p, 'wb') as f:
        f.write(decode_and_decompress(data['verification_key']))
    with open(st_p, 'w') as f:
        f.write(decode_and_decompress(data['settings']).decode('utf-8'))

    try:
        verified = ezkl.verify(pf_p, st_p, vk_p)
    except Exception:
        verified = False

    # cleanup
    for p in (pf_p, vk_p, st_p):
        if os.path.exists(p):
            os.remove(p)

    return jsonify({"verified": verified}), 200


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=2003)