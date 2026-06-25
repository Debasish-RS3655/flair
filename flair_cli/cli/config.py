"""
Configuration commands to manage ~/.flair/config.yaml
"""
from __future__ import annotations
import typer
from rich.console import Console
from rich.table import Table

from ..core import config as config_mod
import os

app = typer.Typer()
console = Console()


@app.command("view")
def view():
    """View current configuration (including defaults).
    
    Shows active values resolved from:
    1. Environment variables (FLAIR_*)
    2. ~/.flair/config.yaml
    3. Built-in defaults
    """
    cfg = config_mod.load_config()
    table = Table(title="Flair Configuration")
    table.add_column("Key", style="cyan")
    table.add_column("Value", style="green")
    table.add_column("Source", style="dim")
    
    api_base = os.environ.get("FLAIR_API_BASE") or cfg.api_base_url or "http://localhost:2112"
    api_source = "env" if os.environ.get("FLAIR_API_BASE") else ("config" if config_mod.CONFIG_PATH.exists() else "default")
    table.add_row("api_base_url", api_base, f"[dim]({api_source})[/dim]")
    
    auth = os.environ.get("FLAIR_AUTH_URL") or cfg.auth_url or "http://localhost:5173"
    auth_source = "env" if os.environ.get("FLAIR_AUTH_URL") else ("config" if config_mod.CONFIG_PATH.exists() else "default")
    table.add_row("auth_url", auth, f"[dim]({auth_source})[/dim]")
    
    session_timeout = cfg.session_timeout_hours or 168
    table.add_row("session_timeout_hours", str(session_timeout), "config")
    
    console.print(table)
    console.print(f"\n[dim]Config file: {config_mod.CONFIG_PATH}[/dim]")


@app.command("set")
def set_config(
    api_base_url: str = typer.Option(None, help="Backend API base URL"),
    auth_url: str = typer.Option(None, help="Auth frontend URL"),
    session_timeout_hours: int = typer.Option(None, help="Session timeout in hours (default: 168)")
):
    """Set configuration values in ~/.flair/config.yaml.
    
    For production deployments, you can set these values in the config file
    or via environment variables:
    
      export FLAIR_API_BASE=https://api.example.com
      export FLAIR_AUTH_URL=https://auth.example.com
    
    Example:
      flair config set --auth-url https://auth.myorg.com --session-timeout-hours 48
    """
    cfg = config_mod.load_config()
    changed = False
    
    if api_base_url:
        cfg.api_base_url = api_base_url
        console.print(f"✓ Set api_base_url = {api_base_url}", style="green")
        changed = True
    
    if auth_url:
        cfg.auth_url = auth_url
        console.print(f"✓ Set auth_url = {auth_url}", style="green")
        changed = True
    
    if session_timeout_hours is not None:
        cfg.session_timeout_hours = session_timeout_hours
        console.print(f"✓ Set session_timeout_hours = {session_timeout_hours}", style="green")
        changed = True
    
    if changed:
        config_mod.save_config(cfg)
        console.print(f"[dim]Config saved to {config_mod.CONFIG_PATH}[/dim]")
    else:
        console.print("[yellow]No values to set[/yellow]")
