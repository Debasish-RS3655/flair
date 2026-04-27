import store from "./store.ts";
import { burnOptions, meltOptions } from "../lib/types.ts";
import { generateRandomHash, sanitizePythonPath } from "../lib/utils.ts";
import { spinner } from "../lib/utils.ts";
// import { bruteFlairSearch } from "../lib/utils.ts";

class Flair {
  version: string;
  constructor() {
    this.version = "0.1.1-alpha";
  }
  initialize = async () => {
    try {
      const exists = await Deno.stat("./flair");
      if (exists.isDirectory) {
        console.log("You have already flaired up");
        Deno.exit(0);
      }
    } catch (_) {
      //
    }
    try {
      await Deno.mkdir("flair/weights", { recursive: true });
      const sharedFolderScript = await Deno.open(
        "flair/shared_folder_http.py",
        {
          write: true,
          create: true,
        }
      );
      await sharedFolderScript.write(
        new TextEncoder().encode(
          'import pickle\nimport time\nfrom typing import Any, Iterator, Optional, Union\nimport requests\n\n\nclass SharedFolderHTTPAuth:\n\t"""\n\tHTTP-backed shared folder with per-request Authorization header and success-flag handling.\n\n\tEndpoints (must be implemented by your HTTP file‐service):\n\t  GET    /files/<key>          → raw bytes of <key> or 404 if missing\n\t  PUT    /files/<key>          → write raw bytes to <key>\n\t  DELETE /files/<key>          → delete <key>\n\t  GET    /files/list           → JSON list of existing keys\n\t  GET    /files/<key>.success  → existence of success flag (empty body, 200 or 404)\n\n\tUsage:\n\t    folder = SharedFolderHTTPAuth(\n\t        base_url="http://host:5000",\n\t        auth_header_value="Bearer TOKEN",\n\t    )\n\t"""\n\n\tdef __init__(\n\t\tself,\n\t\tbase_url: str,\n\t\tauth_header_value: str,\n\t\tretry_sleep_time: float = 3.0,\n\t\tmax_retry: int = 3,\n\t\ttimeout: float = 5.0,\n\t):\n\t\tself.base_url = base_url.rstrip("/")\n\t\tself.auth_header_value = auth_header_value\n\t\tself.retry_sleep_time = retry_sleep_time\n\t\tself.max_retry = max_retry\n\t\tself.timeout = timeout\n\t\tself._headers = {\n\t\t\t"Authorization": self.auth_header_value,\n\t\t\t"Accept": "application/octet-stream",\n\t\t}\n\n\tdef get_raw_folder(self) -> "SharedFolderHTTPAuth":\n\t\t"""\n\t\tThe Keras callback calls `.get_raw_folder()` before writing\n\t\tmodels/metrics as raw bytes. Since this class already handles\n\t\traw bytes directly, just return self.\n\t\t"""\n\t\treturn self\n\n\tdef _url(self, key: str) -> str:\n\t\treturn f"{self.base_url}/files/{key}"\n\n\tdef _url_list(self) -> str:\n\t\treturn f"{self.base_url}/files/list"\n\n\tdef _url_flag(self, key: str) -> str:\n\t\treturn f"{self.base_url}/files/{key}.success"\n\n\tdef _put_success_flag(self, key: str) -> None:\n\t\turl = self._url_flag(key)\n\t\tresp = requests.put(url, headers=self._headers, timeout=self.timeout)\n\t\tresp.raise_for_status()\n\n\tdef _delete_success_flag(self, key: str) -> None:\n\t\turl = self._url_flag(key)\n\t\tresp = requests.delete(url, headers=self._headers, timeout=self.timeout)\n\t\tif resp.status_code not in (200, 204, 404):\n\t\t\tresp.raise_for_status()\n\n\tdef _exists_success_flag(self, key: str) -> bool:\n\t\turl = self._url_flag(key)\n\t\tresp = requests.get(url, headers=self._headers, timeout=self.timeout)\n\t\tif resp.status_code == 200:\n\t\t\treturn True\n\t\tif resp.status_code == 404:\n\t\t\treturn False\n\t\tresp.raise_for_status()\n\n\tdef get(self, key: str, default: Optional[bytes] = None) -> Optional[Union[bytes, dict]]:\n\t\tresp = requests.get(self._url(key), headers=self._headers, timeout=self.timeout)\n\t\tif resp.status_code == 200:\n\t\t\traw = resp.content\n\t\t\tif not key.endswith(".json"):\n\t\t\t\ttry:\n\t\t\t\t\treturn pickle.loads(raw)\n\t\t\t\texcept Exception:\n\t\t\t\t\treturn raw\n\t\t\treturn raw\n\n\tdef __getitem__(self, key: str) -> Optional[bytes]:\n\t\treturn self.get(key)\n\n\tdef __setitem__(self, key: str, value: Union[bytes, bytearray, dict]) -> None:\n\t\turl = self._url(key)\n\t\theaders = {**self._headers, "Content-Type": "application/octet-stream"}\n\t\tif isinstance(value, dict):\n\t\t\tdata = pickle.dumps(value)\n\t\telif isinstance(value, (bytes, bytearray)):\n\t\t\tdata = value\n\t\telse:\n\t\t\traise ValueError(f"Expected bytes or dict for {key}, got {type(value)}")\n\t\tresp = requests.put(url, headers=headers, data=data, timeout=self.timeout)\n\t\tresp.raise_for_status()\n\t\tself._put_success_flag(key)\n\n\tdef __delitem__(self, key: str) -> None:\n\t\turl = self._url(key)\n\t\tresp = requests.delete(url, headers=self._headers, timeout=self.timeout)\n\t\tif resp.status_code not in (200, 204, 404):\n\t\t\tresp.raise_for_status()\n\t\tself._delete_success_flag(key)\n\n\tdef _list_keys(self) -> list[str]:\n\t\turl = self._url_list()\n\t\tresp = requests.get(url, headers=self._headers, timeout=self.timeout)\n\t\tresp.raise_for_status()\n\t\tdata = resp.json()\n\t\tif not isinstance(data, list):\n\t\t\traise ValueError(f"Expected list of keys, got: {data!r}")\n\t\treturn data\n\n\tdef items(self) -> Iterator[tuple[str, bytes]]:\n\t\tfor key in self._list_keys():\n\t\t\tcontent = self.get(key)\n\t\t\tif content is not None:\n\t\t\t\tyield key, content\n\n\tdef __len__(self) -> int:\n\t\treturn len(self._list_keys())\n\n\tdef __repr__(self) -> str:\n\t\treturn f"<SharedFolderHTTPAuth base_url={self.base_url!r}>"'
        )
      );
      sharedFolderScript.close();
      store.setup();
    } catch (error) {
      console.log(error);
    }
  };
  runPythonScript = async (script: string, args: string[]) => {
    try {
      const process = new Deno.Command("python", {
        args: [script, ...args],
      });
      const { success, stdout } = await process.output();

      if (success) {
        spinner.stop();
        return new TextDecoder().decode(stdout);
      } else {
        console.log("error in successfully running python script:", stdout);
        Deno.exit(0);
      }
    } catch (error) {
      console.log("error in running python script");
      console.error(`Error: ${error}`);
      Deno.exit(0);
    }
  };

  burnWeights = async ({
    path,
    model,
    dataPath,
    dataInstance,
    description,
  }: burnOptions) =>
    // combinedHash: string = ""
    {
      try {
        let modulePath: string = "";
        let modelInstance: string = "";
        if (!path && !model) {
          const misc = store.getMisc();
          modulePath = misc.module_path;
          modelInstance = misc.model_instance;
        } else if (!path || !model) {
          console.log(
            "Both --path and --model values are required.\nTo reset the previously set values, use 'flair burn --set'. See --help for more information."
          );
          Deno.exit(0);
        } else if (path && model) {
          modulePath = sanitizePythonPath(path as string);
          modelInstance = model as string;
          store.saveMisc({ path: modulePath, model: modelInstance, set: true });
        }
        // const hash = generateRandomHash();
        // await bruteFlairSearch();
        // const weightPath = ".flair/weights/" + hash + ".pth";
        const burnScript = await Deno.open("burn.py", {
          write: true,
          create: true,
        });
        const { token, wallet, repo_hash } = store.getCreds();
        const { branch_hash } = store.getCurrentBranch();
        await burnScript.write(
          new TextEncoder().encode(
            `from flwr.server.strategy import FedAvg\nfrom flwr_serverless import AsyncFederatedNode\nfrom flwr_serverless.keras import FlwrFederatedCallback\nfrom flair.shared_folder_http import SharedFolderHTTPAuth\nfrom ${modulePath} import ${modelInstance}\nfrom ${dataPath} import ${dataInstance}\nstrategy=FedAvg()\nshared_folder=SharedFolderHTTPAuth(\nbase_url="http://localhost:4000/repo/hash/${repo_hash}/branch/hash/${branch_hash}/commit/sharedFolder",\nauth_header_value="Bearer ${token}"\n)\nnode = AsyncFederatedNode(strategy=strategy, shared_folder=shared_folder, node_id="${wallet}")`
          )
        );
        burnScript.close();
        await this.runPythonScript("burn.py", []);
        // await burnScript.write(
        //   new TextEncoder().encode(
        //     `import torch\nfrom ${modulePath} import ${modelInstance}\nprint(f"\\nModel:{${modelInstance}}")\ndef save_model_weights(model):\n\ttorch.save(model.state_dict(),"${weightPath}")\nsave_model_weights(${modelInstance})`
        //   )
        // );
        // await metricScript.write(
        //   new TextEncoder().encode(
        //     `import torch.nn as nn\nfrom ${modulePath} import ${modelInstance}\nclass ModelCapture:\n\tdef __init__(self, model):\n\t\tself.model=model\n\tdef get_architecture(self):\n\t\tarchitecture=[]\n\t\tfor name, layer in self.model.named_modules():\n\t\t\tif not isinstance(layer,nn.Sequential) and name:\n\t\t\t\tlayer_info={"name":name,"type":layer.__class__.__name__,"num_params":sum(p.numel() for p in layer.parameters())}\n\t\t\t\tif isinstance(layer,(nn.Linear,nn.Conv2d,nn.Conv3d)):\n\t\t\t\t\tlayer_info.update({"in_features":getattr(layer,"in_features",None),"out_features":getattr(layer,"out_features",None),"kernel_size":getattr(layer,"kernel_size",None),"stride":getattr(layer,"stride",None),"padding":getattr(layer,"padding",None),"dilation":getattr(layer,"dilation",None)})\n\t\t\t\telif isinstance(layer,(nn.RNN,nn.LSTM,nn.GRU)):\n\t\t\t\t\tlayer_info.update({"input_size":layer.input_size,"hidden_size":layer.hidden_size,"num_layers":layer.num_layers,"bidirectional":layer.bidirectional})\n\t\t\t\telif isinstance(layer,nn.Transformer):\n\t\t\t\t\tlayer_info.update({"num_layers":layer.encoder.layers[0].self_attn.num_heads,"d_model":layer.d_model})\n\t\t\t\telif isinstance(layer,(nn.BatchNorm1d,nn.BatchNorm2d)):\n\t\t\t\t\tlayer_info.update({"num_features":layer.num_features,"eps":layer.eps,"momentum":layer.momentum})\n\t\t\t\tif "discriminator" in name.lower() or "generator" in name.lower():\n\t\t\t\t\tlayer_info["role"]="GAN Component"\n\t\t\t\tarchitecture.append(layer_info)\n\t\tprint(architecture)\nmeta=ModelCapture(${modelInstance})\nmeta.get_architecture()`
        //   )
        // );
        // burnScript.close();
        // spinner.start("Serializing weights");
        // await this.runPythonScript("burn.py", []);
        // spinner.start("Capturing model metrics");
        // const metrics = await this.runPythonScript("metrics.py", []);
        // spinner.start("Generating hashes");
        // await store.burnStore(description as string, hash, metrics, combinedHash);
        // await Deno.remove("burn.py");
        // await Deno.remove("metrics.py");
        // spinner.stop();
      } catch (error) {
        console.error(`Error: ${error}`);
        Deno.exit(0);
      }
    };
  // melt = async ({ branch }: meltOptions) => {
  //   const [{ baseBranch, baseHash }, { meltBranch, meltHash }] =
  //     store.getLatestBurnHash(branch as string);
  //   const hash = generateRandomHash();
  //   await bruteFlairSearch();
  //   const meltScript = await Deno.open("melt.py", {
  //     write: true,
  //     create: true,
  //   });
  //   await meltScript.write(
  //     new TextEncoder().encode(
  //       `import torch\nweights1=torch.load(".flair/weights/${baseHash}.pth")\nweights2=torch.load(".flair/weights/${meltHash}.pth")\naveraged_weights={}\nfor key in weights1.keys():\n\tif key in weights2:\n\t\taveraged_weights[key]=(weights1[key]+weights2[key])/2\n\telse:\n\t\traise ValueError(f"Key '{key}' missing in one of the weights.")\ntorch.save(averaged_weights, ".flair/weights/${hash}.pth")`
  //     )
  //   );
  //   spinner.start(`Melting ${meltBranch} on ${baseBranch}`);
  //   await this.runPythonScript("melt.py", []);
  //   await Deno.remove("melt.py");
  //   await this.burnWeights(
  //     {
  //       description: `MELT: ${meltBranch} --> ${baseBranch}`,
  //     },
  //     meltHash + ";" + baseHash
  //   );
  // };
}

const flair = new Flair();

export default flair;
