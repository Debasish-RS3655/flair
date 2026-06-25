// configuration file for the repository manager backend
// Debashish Buragohain

export type Config = {
    [key: string]: any
};

const config = {
    upload: {
        baseModel: {
            allowedFileTypes: [
                // --- The "Blueprint" (Code & Config) ---
                ".py",            // Python Script: The most common way FL clients define the model class.
                ".json",          // Config: Keras/HuggingFace architecture definitions.
                ".yaml",          // Config: Alternative architecture definition format.

                // --- Graph Definitions (Production/Edge) ---
                ".onnx",          // ONNX: Best for cross-platform base models (defines graph + ops).
                ".pb",            // TensorFlow Protocol Buffer: The core graph definition file.
                ".tflite",        // TensorFlow Lite: Standard base model for mobile FL clients.

                // --- Full Model Containers (Architecture + Initial Weights) ---
                ".h5",            // Legacy Keras: Very common for storing the initial model state.
                ".keras",         // Modern Keras: The new standard replacing .h5.
                ".pt",            // PyTorch: Can contain the full model structure (if not just state_dict).
                ".pth",           // PyTorch: Same as .pt.
                ".pkl",           // Pickle: Generic python object (least secure, but used).
                ".joblib"         // Scikit-Learn: Common if your FL is doing simple ML (not Deep Learning).
            ],
            maxSize: 20,      // in MB
        },
        params: {
            allowedFileTypes: [
                // --- The "Universal" / Flower Standard ---
                ".npz",           // NumPy Zip (Default for Flower `List[np.ndarray]`)
                ".npy",           // Single NumPy Array

                // --- PyTorch ---
                ".pth",           // PyTorch Checkpoint (Standard)
                ".pt",            // PyTorch Checkpoint (Alternative extension)
                ".ckpt",          // PyTorch Lightning Checkpoint
                ".bin",           // Binary weights (Common in Hugging Face)

                // --- TensorFlow / Keras ---
                ".keras",         // Modern Keras Format (v3+)
                ".h5",            // HDF5 Format (Legacy Keras)
                ".hdf5",          // HDF5 Format (Alternative extension)

                // --- Modern / Cross-Platform ---
                ".safetensors",   // Hugging Face (Fast, Safe)
                ".onnx",          // Open Neural Network Exchange
                ".pkl"            // Python Pickle
            ],
            maxSize: 50,          // in MB
        }
    },
    commit: {
        session: {
            expiryMinutes: 10,
            blockDurationMinutes: 2,
        },
        genesis: {
            hash: '_GENESIS_COMMIT_'  // hash of the genesis commit
        }
    },
    cleanup: {
        intervalMinutes: 10,
    }
}

export default config as Config;