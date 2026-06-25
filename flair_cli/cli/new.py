"""
New command: Create sample model files for different frameworks.
"""
from __future__ import annotations
import typer
from rich.console import Console
from pathlib import Path

app = typer.Typer()
console = Console()


PYTORCH_TEMPLATE = '''"""
Sample PyTorch Model

This is only a sample scaffold.
You are free to modify or ignore it.
Flair does not require any specific architecture format.
"""

import torch
import torch.nn as nn
import torch.nn.functional as F


class SampleModel(nn.Module):
    """
    A simple convolutional neural network for image classification.
    
    This is a basic example - modify it according to your needs.
    """
    
    def __init__(self, num_classes=10):
        super(SampleModel, self).__init__()
        
        # Convolutional layers
        self.conv1 = nn.Conv2d(3, 32, kernel_size=3, padding=1)
        self.conv2 = nn.Conv2d(32, 64, kernel_size=3, padding=1)
        self.conv3 = nn.Conv2d(64, 128, kernel_size=3, padding=1)
        
        # Pooling layer
        self.pool = nn.MaxPool2d(2, 2)
        
        # Fully connected layers
        self.fc1 = nn.Linear(128 * 4 * 4, 512)
        self.fc2 = nn.Linear(512, num_classes)
        
        # Dropout for regularization
        self.dropout = nn.Dropout(0.5)
    
    def forward(self, x):
        # Input shape: (batch_size, 3, 32, 32)
        
        # Convolutional layers with ReLU and pooling
        x = self.pool(F.relu(self.conv1(x)))  # -> (batch_size, 32, 16, 16)
        x = self.pool(F.relu(self.conv2(x)))  # -> (batch_size, 64, 8, 8)
        x = self.pool(F.relu(self.conv3(x)))  # -> (batch_size, 128, 4, 4)
        
        # Flatten
        x = x.view(-1, 128 * 4 * 4)
        
        # Fully connected layers
        x = F.relu(self.fc1(x))
        x = self.dropout(x)
        x = self.fc2(x)
        
        return x


def create_and_save_model():
    """
    Example: Create and save the model.
    """
    # Initialize model
    model = SampleModel(num_classes=10)
    
    # Save model weights
    torch.save(model.state_dict(), 'model.pt')
    print("Model saved to model.pt")
    
    # Alternatively, save the entire model
    # torch.save(model, 'model.pth')


def load_and_use_model():
    """
    Example: Load and use the model.
    """
    # Load model
    model = SampleModel(num_classes=10)
    model.load_state_dict(torch.load('model.pt'))
    model.eval()
    
    # Create dummy input (batch_size=1, channels=3, height=32, width=32)
    dummy_input = torch.randn(1, 3, 32, 32)
    
    # Forward pass
    with torch.no_grad():
        output = model(dummy_input)
    
    print(f"Output shape: {output.shape}")
    return output


if __name__ == "__main__":
    # Create and save the model
    create_and_save_model()
    
    # Load and test the model
    # output = load_and_use_model()
'''

TENSORFLOW_TEMPLATE = '''"""
Sample TensorFlow/Keras Model

This is only a sample scaffold.
You are free to modify or ignore it.
Flair does not require any specific architecture format.
"""

import tensorflow as tf
from tensorflow import keras
from tensorflow.keras import layers


def create_sample_model(input_shape=(32, 32, 3), num_classes=10):
    """
    Create a simple convolutional neural network for image classification.
    
    This is a basic example - modify it according to your needs.
    
    Args:
        input_shape: Tuple of input dimensions (height, width, channels)
        num_classes: Number of output classes
    
    Returns:
        A compiled Keras model
    """
    model = keras.Sequential([
        # Input layer
        layers.Input(shape=input_shape),
        
        # Convolutional blocks
        layers.Conv2D(32, (3, 3), activation='relu', padding='same'),
        layers.MaxPooling2D((2, 2)),
        
        layers.Conv2D(64, (3, 3), activation='relu', padding='same'),
        layers.MaxPooling2D((2, 2)),
        
        layers.Conv2D(128, (3, 3), activation='relu', padding='same'),
        layers.MaxPooling2D((2, 2)),
        
        # Flatten and dense layers
        layers.Flatten(),
        layers.Dense(512, activation='relu'),
        layers.Dropout(0.5),
        layers.Dense(num_classes, activation='softmax')
    ])
    
    return model


def create_and_save_model():
    """
    Example: Create, compile, and save the model.
    """
    # Create model
    model = create_sample_model(input_shape=(32, 32, 3), num_classes=10)
    
    # Compile model
    model.compile(
        optimizer='adam',
        loss='sparse_categorical_crossentropy',
        metrics=['accuracy']
    )
    
    # Print model summary
    model.summary()
    
    # Save model (Keras format)
    model.save('model.keras')
    print("Model saved to model.keras")
    
    # Alternatively, save in HDF5 format
    # model.save('model.h5')


def load_and_use_model():
    """
    Example: Load and use the model.
    """
    # Load model
    model = keras.models.load_model('model.keras')
    
    # Create dummy input (batch_size=1, height=32, width=32, channels=3)
    import numpy as np
    dummy_input = np.random.randn(1, 32, 32, 3).astype(np.float32)
    
    # Make prediction
    output = model.predict(dummy_input, verbose=0)
    
    print(f"Output shape: {output.shape}")
    return output


def create_functional_api_model():
    """
    Alternative: Create model using Functional API for more complex architectures.
    """
    inputs = keras.Input(shape=(32, 32, 3))
    
    # Convolutional blocks
    x = layers.Conv2D(32, (3, 3), activation='relu', padding='same')(inputs)
    x = layers.MaxPooling2D((2, 2))(x)
    
    x = layers.Conv2D(64, (3, 3), activation='relu', padding='same')(x)
    x = layers.MaxPooling2D((2, 2))(x)
    
    x = layers.Conv2D(128, (3, 3), activation='relu', padding='same')(x)
    x = layers.MaxPooling2D((2, 2))(x)
    
    # Dense layers
    x = layers.Flatten()(x)
    x = layers.Dense(512, activation='relu')(x)
    x = layers.Dropout(0.5)(x)
    outputs = layers.Dense(10, activation='softmax')(x)
    
    # Create model
    model = keras.Model(inputs=inputs, outputs=outputs, name='sample_model')
    
    return model


if __name__ == "__main__":
    # Create and save the model
    create_and_save_model()
    
    # Load and test the model
    # output = load_and_use_model()
'''


@app.command()
def new(
    example: str = typer.Option(
        None,
        "--example",
        "-e",
        help="Framework to generate example for (pytorch/tensorflow)"
    ),
    output: str = typer.Option(
        None,
        "--output",
        "-o",
        help="Output filename (default: model_<framework>.py)"
    )
):
    """Create a sample model file for a specific framework.
    
    Generates a sample model scaffold to help you get started quickly.
    The generated file is only a starting point - modify it as needed.
    
    Examples:
        flair new --example pytorch
        flair new --example tensorflow
        flair new --example pytorch --output my_model.py
    """
    if not example:
        console.print("[red]✗ Please specify a framework using --example[/red]")
        console.print("[yellow]Supported frameworks: pytorch, tensorflow[/yellow]")
        console.print("\n[dim]Example:[/dim]")
        console.print("  flair new --example pytorch")
        raise typer.Exit(code=1)
    
    framework = example.lower()
    
    if framework not in ("pytorch", "tensorflow"):
        console.print(f"[red]✗ Unsupported framework: {example}[/red]")
        console.print("[yellow]Supported frameworks: pytorch, tensorflow[/yellow]")
        raise typer.Exit(code=1)
    
    # Determine output filename
    if output:
        output_file = Path(output)
    else:
        output_file = Path(f"model_{framework}.py")
    
    # Check if file exists
    if output_file.exists():
        overwrite = typer.confirm(
            f"File '{output_file}' already exists. Overwrite?",
            default=False
        )
        if not overwrite:
            console.print("[yellow]Operation cancelled[/yellow]")
            raise typer.Exit(code=0)
    
    # Write template to file
    try:
        if framework == "pytorch":
            output_file.write_text(PYTORCH_TEMPLATE)
            console.print(f"[green]✓ PyTorch sample model created: {output_file}[/green]")
            console.print("\n[dim]The file includes:[/dim]")
            console.print("  • Sample CNN model class")
            console.print("  • Example save/load functions")
            console.print("  • Usage examples")
            console.print("\n[dim]To save your model for Flair:[/dim]")
            console.print("  1. Modify the model as needed")
            console.print("  2. Run the script to generate model.pt")
            console.print("  3. Use 'flair params create --model model.pt'")
        else:  # tensorflow
            output_file.write_text(TENSORFLOW_TEMPLATE)
            console.print(f"[green]✓ TensorFlow sample model created: {output_file}[/green]")
            console.print("\n[dim]The file includes:[/dim]")
            console.print("  • Sample CNN model (Sequential API)")
            console.print("  • Alternative Functional API example")
            console.print("  • Example save/load functions")
            console.print("  • Usage examples")
            console.print("\n[dim]To save your model for Flair:[/dim]")
            console.print("  1. Modify the model as needed")
            console.print("  2. Run the script to generate model.keras")
            console.print("  3. Use 'flair params create --model model.keras'")
        
        console.print("\n[yellow]Note: This is only a sample scaffold.[/yellow]")
        console.print("[yellow]You are free to modify or ignore it.[/yellow]")
        console.print("[yellow]Flair does not require any specific architecture format.[/yellow]")
        
    except Exception as e:
        console.print(f"[red]✗ Failed to create file: {str(e)}[/red]")
        raise typer.Exit(code=1)
