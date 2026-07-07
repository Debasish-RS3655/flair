"""
Entry point for the Flair CLI.
This creates a Typer app and mounts subcommand groups from the `cli` package.
"""
from typing import Optional
import typer
from rich.console import Console

from flair_cli.cli import auth, config, init, clone, basemodel, branch, add, zkp, push, pull, params, new, commit, revert, reset, metrics, merge, status as status_cmd, log as log_cmd, diff as diff_cmd

app = typer.Typer(help="Flair — model repository ledger CLI")
console = Console()

# Mount subcommands
app.add_typer(auth.app, name="auth", help="Authentication commands (SIWS login + SSH setup)")
app.add_typer(config.app, name="config", help="Configuration management")
app.add_typer(init.app, name="init", help="Initialize repository in current directory")
app.add_typer(clone.app, name="clone", help="Clone a remote repository")
app.add_typer(basemodel.app, name="basemodel", help="Manage base models")
app.add_typer(branch.app, name="branch", help="Branch management")
app.add_typer(new.app, name="new", help="Create sample model files")
app.add_typer(add.app, name="add", help="Create a new local commit")
app.add_typer(params.app, name="params", help="Extract and create model parameters")
app.add_typer(metrics.app, name="metrics", help="Stage and manage commit metrics")
app.add_typer(merge.app, name="merge", help="Create lineage-based merge candidates")
app.add_typer(zkp.app, name="zkp", help="Zero-Knowledge Proof operations")
app.add_typer(commit.app, name="commit", help="Finalize commit with message and determine type")
app.add_typer(push.app, name="push", help="Push commits to remote repository")
app.add_typer(pull.app, name="pull", help="Pull latest commit statuses from remote")
app.add_typer(revert.app, name="revert", help="Revert to previous commit")
app.add_typer(reset.app, name="reset", help="Reset HEAD to previous local commit")

# Add checkout as top-level command for git-like experience
@app.command()
def checkout(branch_name: str = typer.Argument(..., help="Branch name to switch to")):
    """Switch to a different branch (alias for 'branch checkout')."""
    from flair_cli.cli.branch import checkout as branch_checkout
    branch_checkout(branch_name)


@app.command()
def status():
    """Show branch, head, local commit completeness, and unpushed commit count."""
    status_cmd.status()


@app.command()
def log(
    graph: bool = typer.Option(False, "--graph", help="Show a simple graph-style prefix"),
    branch: str = typer.Option(None, "--branch", help="Show history for a specific branch"),
    limit: int = typer.Option(50, "--limit", help="Maximum number of commits to display"),
):
    """Show commit history, newest first."""
    log_cmd.log(graph=graph, branch=branch, limit=limit)


@app.command()
def diff(
    commit_a: str = typer.Argument(..., help="First commit hash to compare"),
    commit_b: str = typer.Argument(..., help="Second commit hash to compare"),
    detailed: bool = typer.Option(False, "--detailed", help="Show all layers (not just top 5)"),
    json: bool = typer.Option(False, "--json", help="Output machine-readable JSON"),
):
    """Compare two model commits and produce a semantic summary of changes.
    
    This command supports federated learning and model reproducibility workflows.
    It detects architecture changes, computes overall statistics, per-layer diffs,
    and provides merge readiness assessment.
    
    Example:
        flair diff 9f2c... b71e...
        flair diff <commitA> <commitB> --detailed
        flair diff <commitA> <commitB> --json
    """
    diff_cmd.diff(commit_a=commit_a, commit_b=commit_b, detailed=detailed, json_output=json)

@app.callback(invoke_without_command=True)
def main(ctx: typer.Context, json: Optional[bool] = typer.Option(False, "--json", help="Output machine-friendly JSON")):
    """Flair CLI — record-only model repository and commit ledger for ML model evolution.
    Note: Flair never performs training or stores private keys.
    """
    if ctx.invoked_subcommand is None:
        console.print("Use 'flair --help' to see available commands.")

if __name__ == "__main__":
    app()