# ZKML proof Generation using EZKL library
Two endpoints

1. create_proof: accpets the following fields in the request body
    file: ML model in onnx format    
    dimensions: {input_dims: [x, x, x, x]}

2. verify_proof: accepts the following fields in request body:
    proof: ZKML proof in utf8 string
    verifier_key: verifier key in base64 encoded format
    settings: settings file in json