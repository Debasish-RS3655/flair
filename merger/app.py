# Import necessary libraries
import pickle
import tensorflow as tf
from tensorflow import keras
from flwr.server.strategy import FedAvg  # Federated strategy
from flwr_serverless import AsyncFederatedNode
from flwr_serverless.keras import FlwrFederatedCallback

from lib.shared_folder_http import SharedFolderHTTPAuth

# Define the federated learning strategy and shared folder
strategy = FedAvg()
shared_folder = SharedFolderHTTPAuth(
    # base_url="http://localhost:4000/repo/hash/5345c1b8-49ff-4ece-8bdd-c44a8d7701ce/branch/hash/a8d2f74a-8a76-450d-9baf-fbd3808c38fc/commit/sharedFolder",
    base_url="https://flairhub.onrender.com/repo/hash/2d3b3aad-dae5-4b9a-bd38-1f172c04c639/branch/hash/6a80151b-81f1-4e3e-b384-066ab10ecd09/commit/sharedFolder",
    auth_header_value="Bearer universalDzpefiVYkPED7Kbit6fWRiXQ1zSmBy17AN15NVTx1tcd.WYyWcMne8bjJsbpFBz9PhgcKTqEPYCcK2zqsLf8mVQngd9rx3ZC5VV5T8rg4dBdp2FVyiqew8NcgY6eT9cEF8zVn8kHxpJPw7Qpu8SHayAE4FPZnbRu1NxBXdyVfe6SWk3DbN9BrCF9vrsACCsNsTEgttUfqURVWXJDGyr3RL2eLwbf9hXt7VKcP3SZczA7uYfF2jJ8w7x5Yexo4mHQPkzUbzPmDSCaVzfxR19o13b6ChmN4tMoi8Uynmbcqtyko3tMczm72mvydjzGednWgk4NxGxvKwXdXQsrfeM5Bo83bFCSz9sXjK59u4CWfvV6iZyhmWRrSabEe5Dx5Vw5nLCXNqit17gXoqK3uV33zf6N657hQ1rgJi1ktmzmrxAj1nirmw4JuKeVzowBMvh9sP5aKfJ3fnQ4UKigLTh6z6xYcENFULrDCnh7Hj29EuFTJcaXj6R9Qj96nPzXGakcUsp7BWMKKP2P6uU4xJcAtTXt63F6RQVjBijvHftMxrnwYCuYTJR1JjL8izvWoa5SzXzqPunnUSyKp5bAFmuJfAigm7gr6WSEuhncxe2482t9Ur2NMBknsKuQwzoPRgRPwRP7t8pLMotEayp9k3gSLQrXRMwWT9RQrghcYsEAyFgT8aY21SbgSmzAzeZExpyw1L1w5eFMxaNxWFWXK5NNiAoiLZupKQiKaGSzD48YmLNW4YnVseswtQJkx7nouDmepGXDbqdZMQ5jv4B8HPhFXhyddaM1QNKuhjfD9GQ6CMotaRgnir7ns3.4Lhp8QVKzvHsnXAvqiPexrbbngp6cwYM7skdR5X1osv3Dfm9v6X1VXHvbRQN1rRiQtjpEuuAUJQM4qvrhghkUERb"
)
node = AsyncFederatedNode(strategy=strategy, 
                          shared_folder=shared_folder,
                          # wallet address of the user is the node id
                          node_id="DzpefiVYkPED7Kbit6fWRiXQ1zSmBy17AN15NVTx1tcd")

# Define dataset and model parameters
batch_size = 32
dataset = tf.data.Dataset.from_tensor_slices((tf.random.normal([1000, 28, 28]), tf.random.uniform([1000], maxval=10, dtype=tf.int32)))
dataset = dataset.batch(batch_size)

steps_per_epoch = len(dataset)  # Calculate steps per epoch based on dataset size and batch size
num_examples_per_epoch = steps_per_epoch * batch_size  # Number of examples used in each epoch

# Define the federated callback
callback = FlwrFederatedCallback(
    node,
    num_examples_per_epoch=num_examples_per_epoch,  
    save_model_before_aggregation=False,                    # skip per client snapshots
    override_metrics_with_aggregated_metrics=False,         # keep both local and global metrics
    save_model_after_aggregation=False,                      # persist global model each round
)

# Define and compile the model
model = keras.Sequential([
    keras.layers.Flatten(input_shape=(28, 28)),
    keras.layers.Dense(128, activation='relu'),
    keras.layers.Dense(10, activation='softmax')
])
model.compile(optimizer='adam', loss='sparse_categorical_crossentropy', metrics=['accuracy'])

# Train the model using the federated callback
model.fit(dataset, epochs=5, callbacks=[callback])