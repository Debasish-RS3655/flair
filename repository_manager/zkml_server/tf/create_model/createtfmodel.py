import tensorflow as tf
import tf2onnx
import onnx

# 1) Define a trivial Keras model with fixed input size (1,28,28,1)
model = tf.keras.Sequential([
    tf.keras.layers.InputLayer(input_shape=(28, 28, 1), name="input_image"),
    tf.keras.layers.Flatten(name="flatten"),
    tf.keras.layers.Dense(10, activation="softmax", name="output_probs"),
], name="simple_cnn")

# 2) Workaround: tf2onnx expects model.output_names to exist
model.output_names = [model.layers[-1].name]

# 3) (Optional) Initialize weights by running one dummy batch
model.compile(optimizer="adam", loss="sparse_categorical_crossentropy")
dummy_x = tf.random.uniform((1, 28, 28, 1), dtype=tf.float32)
dummy_y = tf.constant([0], dtype=tf.int32)
model.train_on_batch(dummy_x, dummy_y)

# 4) Convert to ONNX with fixed batch size = 1
spec = [tf.TensorSpec((1, 28, 28, 1), tf.float32, name="input_image")]
onnx_model, _ = tf2onnx.convert.from_keras(model, input_signature=spec, opset=13)

# 5) Save to disk
onnx.save(onnx_model, "simple_model.onnx")

print("ONNX model saved as simple_model.onnx")
print("Input dimensions:", spec[0].shape)
