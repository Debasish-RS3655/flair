"""Branch API operations."""
from typing import Dict, Any
from .utils import _client_with_auth


def get_branches(repo_hash: str) -> list[Dict[str, Any]]:
    """Get all branches for a repository.
    
    Args:
        repo_hash: Repository hash
    
    Returns:
        List of branch data
    """
    with _client_with_auth() as client:
        r = client.get(f"/repo/hash/{repo_hash}/branch")
        r.raise_for_status()
        return r.json().get("data", [])


def create_branch(repo_hash: str, name: str, current_branch_hash: str, description: str = None) -> Dict[str, Any]:
    """Create a new branch from an existing branch.
    
    Args:
        repo_hash: Repository hash
        name: New branch name
        current_branch_hash: Hash of the branch to branch from
        description: Optional branch description
    
    Returns:
        New branch data
    """
    payload = {
        "name": name,
        "currentBranchHash": current_branch_hash
    }
    if description:
        payload["description"] = description
    
    with _client_with_auth() as client:
        r = client.post(f"/repo/hash/{repo_hash}/branch/create", json=payload)
        r.raise_for_status()
        return r.json().get("data", {})


def delete_branch(repo_hash: str, branch_hash: str) -> Dict[str, Any]:
    """Delete a branch.
    
    Args:
        repo_hash: Repository hash
        branch_hash: Hash of the branch to delete
    
    Returns:
        Response data
    """
    with _client_with_auth() as client:
        r = client.delete(f"/repo/hash/{repo_hash}/branch/hash/{branch_hash}/delete")
        r.raise_for_status()
        return r.json()


def get_branch_by_name(repo_hash: str, branch_name: str) -> Dict[str, Any]:
    """Get branch details by name.
    
    Args:
        repo_hash: Repository hash
        branch_name: Branch name
    
    Returns:
        Branch data
    """
    with _client_with_auth() as client:
        r = client.get(f"/repo/hash/{repo_hash}/branch/name/{branch_name}")
        r.raise_for_status()
        return r.json().get("data", {})
