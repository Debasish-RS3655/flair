# !! This is not an executable python file! 

import torch.nn as nn
from {modulePath} import {model_instance}
class ModelCapture:
	def __init__(self, model):
		self.model=model
	def get_architecture(self):
		architecture=[]
		for name, layer in self.model.named_modules():
			if not isinstance(layer,nn.Sequential) and name:
				layer_info={"name":name,"type":layer.__class__.__name__,"num_params":sum(p.numel() for p in layer.parameters())}
				if isinstance(layer,(nn.Linear,nn.Conv2d,nn.Conv3d)):
					layer_info.update({"in_features":getattr(layer,"in_features",None),"out_features":getattr(layer,"out_features",None),"kernel_size":getattr(layer,"kernel_size",None),"stride":getattr(layer,"stride",None),"padding":getattr(layer,"padding",None),"dilation":getattr(layer,"dilation",None)})
				elif isinstance(layer,(nn.RNN,nn.LSTM,nn.GRU)):
					layer_info.update({"input_size":layer.input_size,"hidden_size":layer.hidden_size,"num_layers":layer.num_layers,"bidirectional":layer.bidirectional})
				elif isinstance(layer,nn.Transformer):
					layer_info.update({"num_layers":layer.encoder.layers[0].self_attn.num_heads,"d_model":layer.d_model})
				elif isinstance(layer,(nn.BatchNorm1d,nn.BatchNorm2d)):
					layer_info.update({"num_features":layer.num_features,"eps":layer.eps,"momentum":layer.momentum})
				if "discriminator" in name.lower() or "generator" in name.lower():
					layer_info["role"]="GAN Component"
				architecture.append(layer_info)
		print(architecture)
meta=ModelCapture({model_instance})
meta.get_architecture()