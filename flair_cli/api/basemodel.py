from typing import Dict, Any
from .utils import _client_with_auth # Import the shared helper


# fetch the base model download URL for the given repository hash
def get_base_model_url(repo_hash: str) -> Dict[str, Any]:
    """Get base model download URL for a repository.
    
    Returns:
        {"data": "ipfs_url", "fileExtension": ".pt"}
    """
    with _client_with_auth() as client:
        r = client.get(f"/repo/hash/{repo_hash}/basemodel/fetch_url")
        r.raise_for_status()
        return r.json()

# uses the upload model endpoint of the repository manager and returns what the API has returned
def upload_base_model(repo_hash: str, file_path) -> Dict[str, Any]:
    """Upload base model file to repository.
    
    Args:
        repo_hash: Repository hash
        file_path: Path object to the file
    
    Returns:
        {"data": {"cid": "...", "fileExtension": "...", "url": "..."}}
    """
    with _client_with_auth() as client:
        with open(file_path, "rb") as f:
            files = {"baseModel": (file_path.name, f, "application/octet-stream")}
            r = client.post(f"/repo/hash/{repo_hash}/basemodel/upload", files=files)
            r.raise_for_status()
            return r.json().get("data", {})


def delete_base_model(repo_hash: str) -> Dict[str, Any]:
    """Delete base model from repository.
    
    Returns:
        {"data": "cid_of_deleted_model"}
    """
    with _client_with_auth() as client:
        r = client.delete(f"/repo/hash/{repo_hash}/basemodel/delete")
        r.raise_for_status()
        return r.json()