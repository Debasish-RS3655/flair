# universal zkml server with support for both tensorflow and pytroch models
# Debashish Buragohain

from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import os
import json
import logging
import ezkl
import asyncio
import base64
import zlib
import io
import zipfile

# Add backends
import numpy as np
import torch
import tensorflow as tf

import config


def _cleanup_artifacts(model_path: str):
    """Remove temporary files created during proof generation/verification."""
    to_del = [
        model_path, "input.json", "calibration.json", "network.compiled",
        "witness.json", "test.pk", "test.pf", "test.vk", "settings.json",
        "uploaded_proof.pf", "uploaded_vk", "uploaded_settings.json"
    ]
    for f in to_del:
        if f and os.path.exists(f):
            try:
                os.remove(f)
            except Exception as e:
                logger.warning(f"Could not remove {f}: {str(e)}")

app = Flask(__name__)
CORS(app)

# Silence EZKL logging
logging.getLogger('ezkl').setLevel(logging.ERROR)

# Configure app logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def compress_and_encode(data: bytes) -> str:
    """Compress bytes with zlib and Base64‑encode."""
    compressed = zlib.compress(data)
    return base64.b64encode(compressed).decode('utf-8')


def decode_and_decompress(encoded_str: str) -> bytes:
    """Inverse of compress_and_encode."""
    decoded = base64.b64decode(encoded_str)
    return zlib.decompress(decoded)


def compress_raw(data: bytes) -> bytes:
    """Compress bytes with zlib (no Base64)."""
    return zlib.compress(data)


def make_random_array(dims):
    """Generate a NumPy array of shape dims, float32 in [0,1)."""
    return np.random.rand(*dims).astype(np.float32)


def to_backend(array: np.ndarray, backend: str):
    """Convert NumPy array to the chosen backend tensor/array."""
    if backend == 'torch':
        return torch.from_numpy(array)
    elif backend == 'tensorflow':
        return tf.convert_to_tensor(array)
    else:  # numpy
        return array



# in the production version, this route would not be used since the zkp is generarted locally in the cli
@app.route('/upload', methods=['POST'])
def upload_file():
    """Upload ONNX model and create ZKP.
    
    Parameters:
    - file: ONNX model file
    - dimensions: JSON string with input_dims
    - backend: torch, tensorflow, or numpy
    
    Returns: {proof, verification_key, settings}
    """
    try:
        # --- File and dims & backend parsing ---
        if 'file' not in request.files:
            return jsonify({'success': False, 'message': 'No file part'}), 400
        file = request.files['file']
        if file.filename == '':
            return jsonify({'success': False, 'message': 'No selected file'}), 400

        model_path = 'network.onnx'
        file.save(model_path)

        # dims
        dims_str = request.form.get('dimensions')
        if not dims_str:
            return jsonify({'success': False, 'message': 'Missing "dimensions" field'}), 400
        try:
            dims = json.loads(dims_str)
            input_dims = dims['input_dims']
        except Exception as e:
            return jsonify({
                'success': False,
                'message': 'Invalid dimensions JSON',
                'error': str(e)
            }), 400

        # backend
        backend = request.form.get('backend', 'numpy').lower()
        if backend not in ('numpy', 'torch', 'tensorflow'):
            return jsonify({
                'success': False,
                'message': 'Unsupported backend',
                'supported': ['numpy', 'torch', 'tensorflow']
            }), 400

        logger.info(f"Processing model with backend: {backend}, input_dims: {input_dims}")

        # --- Async processing ---
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(
                process_model(model_path, input_dims, backend)
            )
        except Exception as e:
            logger.error(f"Error during processing: {str(e)}")
            return jsonify({
                'success': False,
                'message': 'Error during processing',
                'error': str(e)
            }), 500
        finally:
            loop.close()

        # --- Read outputs and emit in configured format ---
        try:
            if config.OUTPUT_FORMAT == "binary":
                proof_bytes = open("test.pf", "rb").read()
                vk_bytes = open("test.vk", "rb").read()
                settings_bytes = open("settings.json", "rb").read()

                # Build an in-memory ZIP containing zlib-compressed artifacts
                buffer = io.BytesIO()
                with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
                    zf.writestr("proof.zlib", compress_raw(proof_bytes))
                    zf.writestr("verification_key.zlib", compress_raw(vk_bytes))
                    zf.writestr("settings.zlib", compress_raw(settings_bytes))
                buffer.seek(0)

                # Cleanup before returning
                _cleanup_artifacts(model_path)

                return send_file(
                    buffer,
                    mimetype="application/zip",
                    as_attachment=True,
                    download_name="zkml_artifacts.zip"
                )
            else:
                with open("test.pf", "r") as pf:
                    proof = compress_and_encode(pf.read().encode('utf-8'))
                with open("test.vk", "rb") as vk:
                    vk_enc = compress_and_encode(vk.read())
                with open("settings.json", "r") as st:
                    settings_enc = compress_and_encode(st.read().encode('utf-8'))
        except Exception as e:
            logger.error(f"Error reading proof artifacts: {str(e)}")
            _cleanup_artifacts(model_path)
            return jsonify({
                'success': False,
                'message': 'Error reading proof artifacts',
                'error': str(e)
            }), 500

        # cleanup
        _cleanup_artifacts(model_path)

        logger.info("ZKP generation completed successfully")
        if config.OUTPUT_FORMAT == "base64":
            return jsonify({
                "success": True,
                "format": "base64",
                "proof": proof,
                "verification_key": vk_enc,
                "settings": settings_enc
            }), 200

    except Exception as e:
        logger.error(f"Unexpected error in upload_file: {str(e)}")
        return jsonify({
            'success': False,
            'message': 'Internal server error',
            'error': str(e)
        }), 500


async def process_model(model_path, input_dims, backend):
    """Process model and generate ZKP proof."""
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

    logger.info("Settings generated")

    # 4) calibrate
    await ezkl.calibrate_settings(cal_path, model_path, settings_path, "resources")
    logger.info("Settings calibrated")

    # 5) compile
    if not ezkl.compile_circuit(model_path, compiled_path, settings_path):
        raise RuntimeError("compile_circuit failed")
    logger.info("Circuit compiled")

    # 6) get SRS
    await ezkl.get_srs(settings_path)
    logger.info("SRS retrieved")

    # 7) witness
    if not await ezkl.gen_witness(data_path, compiled_path, witness_path):
        raise RuntimeError("gen_witness failed")
    logger.info("Witness generated")

    # 8) setup keys
    if not ezkl.setup(compiled_path, vk_path, pk_path):
        raise RuntimeError("setup failed")
    logger.info("Keys set up")

    # 9) prove
    if not ezkl.prove(witness_path, compiled_path, pk_path, proof_path, "single"):
        raise RuntimeError("prove failed")
    logger.info("Proof generated")

    # 10) verify
    if not ezkl.verify(proof_path, settings_path, vk_path):
        raise RuntimeError("verify failed")
    logger.info("Proof verified")


@app.route('/verify_proof', methods=['POST'])
def verify_proof():
    """Verify a ZKP proof.
    
    Parameters (JSON):
    - proof: Compressed proof
    - verification_key: Compressed verification key
    - settings: Compressed settings
    
    Returns: {verified: bool}
    """
    try:
        # Support both JSON (base64) and multipart binary inputs
        pf_p = "uploaded_proof.pf"
        vk_p = "uploaded_vk"
        st_p = "uploaded_settings.json"

        if request.files:
            # Binary path: expect .zlib compressed files
            proof_file = request.files.get('proof')
            vk_file = request.files.get('verification_key')
            settings_file = request.files.get('settings')

            if not proof_file or not vk_file or not settings_file:
                return jsonify({
                    'success': False,
                    'message': 'Missing one of the required files: proof, verification_key, settings',
                    'verified': False
                }), 400

            try:
                with open(pf_p, 'wb') as f:
                    f.write(zlib.decompress(proof_file.read()))
                with open(vk_p, 'wb') as f:
                    f.write(zlib.decompress(vk_file.read()))
                with open(st_p, 'wb') as f:
                    f.write(zlib.decompress(settings_file.read()))
            except Exception as e:
                logger.error(f"Error processing binary proof artifacts: {str(e)}")
                return jsonify({
                    'success': False,
                    'message': 'Error processing binary proof artifacts',
                    'verified': False,
                    'error': str(e)
                }), 400
        else:
            # Base64 JSON path (legacy/default)
            data = request.get_json() or {}
            for key in ('proof', 'verification_key', 'settings'):
                if key not in data:
                    return jsonify({
                        'success': False,
                        'message': f'Missing field: {key}',
                        'verified': False
                    }), 400

            try:
                with open(pf_p, 'w') as f:
                    f.write(decode_and_decompress(data['proof']).decode('utf-8'))
                with open(vk_p, 'wb') as f:
                    f.write(decode_and_decompress(data['verification_key']))
                with open(st_p, 'w') as f:
                    f.write(decode_and_decompress(data['settings']).decode('utf-8'))
            except Exception as e:
                logger.error(f"Error decoding proof artifacts: {str(e)}")
                return jsonify({
                    'success': False,
                    'message': 'Error decoding proof artifacts',
                    'verified': False,
                    'error': str(e)
                }), 400

        try:
            verified = ezkl.verify(pf_p, st_p, vk_p)
            logger.info(f"Verification result: {verified}")
        except Exception as e:
            logger.error(f"Verification failed: {str(e)}")
            verified = False

        # cleanup
        for p in (pf_p, vk_p, st_p):
            if os.path.exists(p):
                try:
                    os.remove(p)
                except Exception as e:
                    logger.warning(f"Could not remove {p}: {str(e)}")

        return jsonify({
            "success": True,
            "verified": verified
        }), 200

    except Exception as e:
        logger.error(f"Unexpected error in verify_proof: {str(e)}")
        return jsonify({
            'success': False,
            'message': 'Internal server error',
            'verified': False,
            'error': str(e)
        }), 500


@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint."""
    return jsonify({
        'status': 'ok',
        'service': 'ZKML Server',
        'version': '1.0.0'
    }), 200


@app.errorhandler(404)
def not_found(error):
    """Handle 404 errors."""
    return jsonify({
        'success': False,
        'message': 'Endpoint not found',
        'error': str(error)
    }), 404


@app.errorhandler(500)
def server_error(error):
    """Handle 500 errors."""
    logger.error(f"Server error: {str(error)}")
    return jsonify({
        'success': False,
        'message': 'Internal server error',
        'error': str(error)
    }), 500


if __name__ == '__main__':
    logger.info("Starting ZKML Server on 0.0.0.0:2003")
    app.run(debug=True, host='0.0.0.0', port=2003)