# !! This is not an executable python file! 

import torch
weights1=torch.load(".flair/weights/{baseHash}.pth")
weights2=torch.load(".flair/weights/{meltHash}.pth")
averaged_weights={}
for key in weights1.keys():
	if key in weights2:
		averaged_weights[key]=(weights1[key]+weights2[key])/2
	else:
		raise ValueError(f"Key '{key}' missing in one of the weights.")
torch.save(averaged_weights, ".flair/weights/{hash}.pth")