import tensorflow as tf

batch_size=32
x = tf.random.normal([1000, 28, 28])
y = tf.random.uniform([1000], maxval=10, dtype=tf.int32)

dataset = tf.data.Dataset.from_tensor_slices((x, y))
dataset = dataset.batch(batch_size)
