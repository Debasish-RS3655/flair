from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import torch
import json
import logging
import ezkl
import asyncio
import base64
import zlib

app = Flask(__name__)
CORS(app)

# Set logging level to ERROR to disable warnings from EZKL
logging.getLogger('ezkl').setLevel(logging.ERROR)

def compress_and_encode(data: bytes) -> str:
    """
    Compresses binary data using zlib and then encodes it in Base64.
    Returns a UTF-8 string.
    """
    compressed = zlib.compress(data)
    encoded = base64.b64encode(compressed).decode('utf-8')
    return encoded

def decode_and_decompress(encoded_str: str) -> bytes:
    """
    Decodes a Base64 string and then decompresses it using zlib.
    Returns the original binary data.
    """
    decoded = base64.b64decode(encoded_str)
    decompressed = zlib.decompress(decoded)
    return decompressed

@app.route('/upload', methods=['POST'])
def upload_file():
    # Ensure the model file is present
    if 'file' not in request.files:
        return jsonify({'message': 'No file part'}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({'message': 'No selected file'}), 400
    
    # Save the uploaded ONNX file
    model_path = os.path.join('network.onnx')
    file.save(model_path)

    # Get the dimensions from the request; expecting a JSON-formatted string with an "input_dims" field
    dims_str = request.form.get('dimensions')
    if not dims_str:
        return jsonify({'message': 'Missing "dimensions" field in the request.'}), 400

    try:
        dims = json.loads(dims_str)
    except Exception as e:
        return jsonify({'message': 'Invalid dimensions provided. Must be valid JSON.', 'error': str(e)}), 400

    if 'input_dims' not in dims:
        return jsonify({'message': 'Dimensions JSON must contain "input_dims".'}), 400

    # Create a new asyncio event loop and process the model
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        loop.run_until_complete(process_model(model_path, dims))
    except Exception as e:
        print("Error during processing:", e)
        return jsonify({'message': 'Error processing the model', 'error': str(e)}), 500
    finally:
        loop.close()
    
    # Read the final proof, verification key, and settings files and compress them
    with open("test.pf", "r") as pf_file:
        proof_contents = pf_file.read().encode('utf-8')
        compressed_proof = compress_and_encode(proof_contents)
    
    with open("test.vk", "rb") as vk_file:
        vk_binary = vk_file.read()
        compressed_vk = compress_and_encode(vk_binary)
    
    with open("settings.json", "r") as settings_file:
        settings_contents = settings_file.read().encode('utf-8')
        compressed_settings = compress_and_encode(settings_contents)

    # Delete temporary files
    files_to_delete = [
        model_path, "input.json", "calibration.json", "network.compiled",
        "witness.json", "test.pk", 
        # also delete the final files now since this is a standalone module
        "test.pf", "test.vk", "settings.json"
        ]
    for f in files_to_delete:
        if os.path.exists(f):
            os.remove(f)

    # Return only the final, compressed proof, verification key and settings JSON
    return jsonify({
        "proof": compressed_proof,
        "verification_key": compressed_vk,
        "settings": compressed_settings
    }), 200

async def process_model(model_path, dims):
    """
    Process the model using EZKL to generate a zero-knowledge proof.
    Expects dims to be a dictionary with:
      - "input_dims": A list representing the desired dimensions for input data.
    The calibration data dimensions are computed automatically as a batch of 20 samples.
    """
    # Define file paths
    compiled_model_path = os.path.join('network.compiled')
    pk_path = os.path.join('test.pk')
    vk_path = os.path.join('test.vk')
    settings_path = os.path.join('settings.json')
    witness_path = os.path.join('witness.json')
    data_path = os.path.join('input.json')
    cal_path = os.path.join('calibration.json')
    proof_path = os.path.join('test.pf')
    
    # -----------------------------
    # Step 1: Generate Random Input Data
    # -----------------------------
    print("Step 1: Generating random input data using provided dimensions.")
    try:
        input_dims = dims["input_dims"]
        input_tensor = torch.rand(*input_dims).detach().numpy()
        data_array = input_tensor.reshape([-1]).tolist()
    except Exception as e:
        raise Exception("Failed to generate input data. Check the 'input_dims' field.") from e

    print("Saving generated input data to JSON format.")
    with open(data_path, 'w') as f:
        json.dump({"input_data": [data_array]}, f)
    print(f"Input data saved to: {data_path}")
    
    # -----------------------------
    # Step 2: Generate Random Calibration Data
    # -----------------------------
    print("Step 2: Generating random calibration data using derived dimensions.")
    calibration_batch = 20  # Fixed batch size for calibration
    # Construct calibration dimensions: [calibration_batch] + (rest of input dimensions after the first element)
    cal_dims = [calibration_batch] + input_dims[1:]
    try:
        calibration_tensor = torch.rand(*cal_dims).detach().numpy()
        calibration_array = calibration_tensor.reshape([-1]).tolist()
    except Exception as e:
        raise Exception("Failed to generate calibration data based on input_dims.") from e

    with open(cal_path, 'w') as f:
        json.dump({"input_data": [calibration_array]}, f)
    print(f"Calibration data saved to: {cal_path}")
    
    # -----------------------------
    # Step 3: Generate EZKL Settings
    # -----------------------------
    print("Step 3: Generating EZKL settings for the ONNX model.")
    py_run_args = ezkl.PyRunArgs()
    py_run_args.input_visibility = "public"
    py_run_args.output_visibility = "public"
    py_run_args.param_visibility = "private"
    
    res = ezkl.gen_settings(model_path, settings_path, py_run_args=py_run_args)
    if res:
        print(f"EZKL settings successfully generated and saved to: {settings_path}")
    else:
        raise Exception("Error in generating EZKL settings.")
    
    # -----------------------------
    # Step 4: Calibrate Settings using Generated Calibration Data
    # -----------------------------
    print("Step 4: Calibrating model settings using generated calibration data.")
    await ezkl.calibrate_settings(cal_path, model_path, settings_path, "resources")
    print("Model calibration completed.")
    
    # -----------------------------
    # Step 5: Compile the Circuit
    # -----------------------------
    print("Step 5: Compiling the model circuit for ZK proof generation.")
    res = ezkl.compile_circuit(model_path, compiled_model_path, settings_path)
    if res:
        print(f"Model circuit compiled successfully and saved to: {compiled_model_path}")
    else:
        raise Exception("Error in compiling the model circuit.")
    
    # -----------------------------
    # Step 6: Fetch the SRS
    # -----------------------------
    print("Step 6: Fetching Structured Reference String (SRS) for ZK proof.")
    await ezkl.get_srs(settings_path)
    print("SRS fetched successfully.")
    
    # -----------------------------
    # Step 7: Generate the Witness
    # -----------------------------
    print("Step 7: Generating the witness file based on the input data and compiled circuit.")
    res = await ezkl.gen_witness(data_path, compiled_model_path, witness_path)
    if os.path.exists(witness_path):
        print(f"Witness file generated and saved to: {witness_path}")
    else:
        raise Exception("Error in generating witness file.")
    
    # -----------------------------
    # Step 8: Setup Keys
    # -----------------------------
    print("Step 8: Setting up circuit parameters and generating keys (verification and proving keys).")
    res = ezkl.setup(compiled_model_path, vk_path, pk_path)
    if res:
        print(f"Verification key saved to: {vk_path}")
        print(f"Proving key saved to: {pk_path}")
    else:
        raise Exception("Error in generating the circuit and generating keys.")
    
    # -----------------------------
    # Step 9: Generate the Proof
    # -----------------------------
    print("Step 9: Generating the Zero-Knowledge Proof.")
    res = ezkl.prove(witness_path, compiled_model_path, pk_path, proof_path, "single")
    if os.path.exists(proof_path):
        print(f"Proof successfully generated and saved to: {proof_path}")
    else:
        raise Exception("Error in generating the proof.")
    
    # -----------------------------
    # Step 10: Verify the Proof
    # -----------------------------
    print("Step 10: Verifying the proof to ensure correctness.")
    res = ezkl.verify(proof_path, settings_path, vk_path)
    if res:
        print("Proof verified successfully! Everything is authentic.")
    else:
        raise Exception("Proof verification failed.")
    
    return

@app.route('/verify_proof', methods=['POST'])
def verify_proof():
    """
    Expects a JSON POST body with the following fields (all compressed and Base64-encoded):
      - "proof": The proof as a compressed and encoded string.
      - "verification_key": The verification key as a compressed and encoded string.
      - "settings": The settings JSON as a compressed and encoded string.
      
    The endpoint decodes and decompresses these inputs, writes them to temporary files,
    calls ezkl.verify(), and then deletes the temporary files.
    
    Returns a JSON response with {"verified": true} if the proof verifies,
    or {"verified": false} otherwise.
    """
    data = request.get_json()
    if not data:
        return jsonify({'message': 'No JSON data provided'}), 400

    for key in ['proof', 'verification_key', 'settings']:
        if key not in data:
            return jsonify({'message': f'Missing field: {key}'}), 400

    # Paths for temporary files
    proof_path = os.path.join('uploaded_proof.pf')
    vk_path = os.path.join('uploaded_vk')
    settings_path = os.path.join('uploaded_settings.json')

    # Decompress and write the proof (text)
    try:
        proof_decompressed = decode_and_decompress(data['proof']).decode('utf-8')
    except Exception as e:
        return jsonify({'message': 'Failed to decode proof', 'error': str(e)}), 400
    with open(proof_path, 'w') as f:
        f.write(proof_decompressed)

    # Decompress and write the verification key (binary)
    try:
        vk_decompressed = decode_and_decompress(data['verification_key'])
    except Exception as e:
        return jsonify({'message': 'Failed to decode verification key', 'error': str(e)}), 400
    with open(vk_path, 'wb') as f:
        f.write(vk_decompressed)

    # Decompress and write the settings (text)
    try:
        settings_decompressed = decode_and_decompress(data['settings']).decode('utf-8')
    except Exception as e:
        return jsonify({'message': 'Failed to decode settings', 'error': str(e)}), 400
    with open(settings_path, 'w') as f:
        f.write(settings_decompressed)

    # Run the verification using EZKL
    try:
        verified = ezkl.verify(proof_path, settings_path, vk_path)
    except Exception as e:
        print("Error during verification:", e)
        verified = False

    # Delete the temporary files
    for f_path in [proof_path, vk_path, settings_path]:
        if os.path.exists(f_path):
            os.remove(f_path)

    return jsonify({"verified": verified}), 200

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=2003)
