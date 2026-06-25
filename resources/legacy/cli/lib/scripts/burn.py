# !! This is not an executable python file! 

import torch
from {modulePath} import {model_instance}
def save_model_weights(model):
	torch.save(model.state_dict(),".flair/weights/{hash}.pth")
save_model_weights({model_instance})