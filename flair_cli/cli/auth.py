"""
Auth commands (SIWS - Sign-In With Solana via browser-based OAuth2-style callback flow).

Design: The CLI starts a temporary local HTTP callback server, opens the browser with the
auth URL + redirect_uri parameter. The frontend signs the user in, then redirects back to
the CLI's callback URL with the signed token. The CLI captures the token and saves it.

Session tokens are cached in ~/.flair/session.json with an expiration time (configurable,
default 7 days). If a valid session exists, users are not prompted to re-authenticate.
"""
from __future__ import annotations
import typer
from rich.console import Console
from rich import print as rprint
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import threading
import webbrowser
import time
import os
import json
from datetime import datetime, timedelta

from ..core import session as session_mod
from ..core import config as config_mod
from ..api.client import verify_auth

app = typer.Typer()
console = Console()


def _get_auth_url(auth_url_override: str | None = None) -> str:
    """
    Resolve auth URL with precedence:
    1. Command-line override (--auth-url)
    2. Environment variable (FLAIR_AUTH_URL)
    3. Config file (~/.flair/config.yaml)
    4. Built-in default (localhost:5173 for dev)
    
    Returns the auth frontend URL (e.g., http://localhost:5173/)
    """
    # Tier 1: CLI override
    if auth_url_override:
        return auth_url_override
    
    # Tier 2: Environment variable
    env_url = os.environ.get("FLAIR_AUTH_URL")
    if env_url:
        return env_url
    
    # Tier 3: Config file
    cfg = config_mod.load_config()
    if cfg.auth_url:
        return cfg.auth_url

    # # No config found
    # raise RuntimeError(
    #     "No auth URL configured. Set one of:\n"
    #     "  - FLAIR_AUTH_URL environment variable\n"
    #     "  - flair config set --auth-url <url>\n"
    #     "  - flair auth login --auth-url <url>"
    # )
    
    # Should not reach here since FlairConfig has a default, but just in case
    return "http://localhost:5173/"


class CallbackHandler(BaseHTTPRequestHandler):
    """HTTP handler for the OAuth2 callback endpoint."""
    
    # Class variables to store the received token
    token = None
    wallet = None
    error = None
    
    def do_GET(self):
        """Handle the redirect from the auth frontend."""
        parsed = urlparse(self.path)
        query_params = parse_qs(parsed.query)
        
        # Extract token and wallet from query params
        token_list = query_params.get('token', [])
        wallet_list = query_params.get('wallet', [])
        error_list = query_params.get('error', [])
        
        if error_list:
            CallbackHandler.error = error_list[0]
            self._send_response(f"<h1>Authentication Failed</h1><p>{error_list[0]}</p>")
            return
        
        if token_list and wallet_list:
            CallbackHandler.token = token_list[0]
            CallbackHandler.wallet = wallet_list[0]
            self._send_response("<h1>✓ Success!</h1><p>Authentication successful. You can close this window.</p>")
        else:
            CallbackHandler.error = "Missing token or wallet in callback"
            self._send_response(f"<h1>Error</h1><p>Missing required parameters</p>")
    
    def _send_response(self, html: str):
        """Send an HTML response."""
        self.send_response(200)
        self.send_header('Content-type', 'text/html')
        self.end_headers()
        self.wfile.write(html.encode('utf-8'))
    
    def log_message(self, format, *args):
        """Suppress default logging."""
        pass


@app.command("login")
def login(
    auth_url: str = typer.Option(None, "--auth-url", help="Auth frontend URL (e.g., https://auth.flair.example/login)"),
    open_browser: bool = typer.Option(True, "--browser/--no-browser", help="Automatically open browser"),
    force: bool = typer.Option(False, "--force", help="Force re-authentication even if valid session exists")
):
    """Login using Sign-In With Solana via browser OAuth2 callback flow.
    
    If a valid session exists, you will be logged in automatically without re-authenticating.
    Use --force to re-authenticate and create a new session.
    
    The CLI will:
    1. Start a temporary local HTTP server
    2. Open your browser to the auth page with a redirect_uri
    3. Wait for you to sign in with your wallet
    4. Capture the signed token when the frontend redirects back
    5. Save the token locally with expiration (configurable, default 24 hours)
    
    \b
    Configure auth URL via (in order of precedence):
    - --auth-url flag
    - FLAIR_AUTH_URL environment variable
    - flair config set --auth-url <url>
    """
    try:
        # Check if valid session already exists
        if not force:
            existing_session = session_mod.load_session()
            if existing_session:
                console.print("✓ [bold green]You are already logged in[/bold green]")
                console.print(f"Wallet: [bold]{existing_session.wallet_address}[/bold]")
                console.print(f"Session expires at: {existing_session.expires_at}")
                console.print("[dim]Use --force to re-authenticate[/dim]")
                return
        
        # Resolve auth URL with precedence
        resolved_auth_url = _get_auth_url(auth_url)
        
        # Get session timeout from config
        cfg = config_mod.load_config()
        session_timeout_hours = cfg.session_timeout_hours
        
        # Reset callback handler state
        CallbackHandler.token = None
        CallbackHandler.wallet = None
        CallbackHandler.error = None
        
        # Start callback server to get a port
        server = HTTPServer(('localhost', 0), CallbackHandler)
        callback_port = server.server_port
        callback_url = f"http://localhost:{callback_port}/callback"
        
        # Start server in background thread
        server_thread = threading.Thread(target=server.serve_forever, daemon=True)
        server_thread.daemon = True
        server_thread.start()
        
        console.print(f"[dim]Callback server listening on {callback_url}[/dim]")
        
        # Build auth URL with redirect_uri parameter
        auth_url_with_redirect = f"{resolved_auth_url}{'&' if '?' in resolved_auth_url else '?'}redirect_uri={callback_url}"
        
        if open_browser:
            webbrowser.open(auth_url_with_redirect)
            console.print(f"[green]✓ Browser opened to auth page[/green]")
        else:
            console.print(f"[green]Please visit:[/green] {auth_url_with_redirect}")
        
        console.print("[dim]Waiting for authentication (timeout: 5 min)...[/dim]")
        
        # Wait for callback (with timeout)
        start_time = time.time()
        timeout = 300
        while time.time() - start_time < timeout:
            if CallbackHandler.token and CallbackHandler.wallet:
                server.shutdown()
                
                # Calculate expiration time
                expires_at = datetime.utcnow() + timedelta(hours=session_timeout_hours)
                expires_at_str = expires_at.isoformat() + "Z"
                
                # Save session with expiration
                # SSH-MIGRATION: wallet_address currently stores Solana pubkey from browser auth;
                # rename/extend when login moves to SSH key fingerprint or OpenSSH identity.
                s = session_mod.Session(
                    token=CallbackHandler.token,
                    wallet_address=CallbackHandler.wallet,
                    expires_at=expires_at_str
                )
                session_mod.save_session(s)
                console.print("✓ [bold green]Login successful[/bold green]")
                console.print(f"Wallet: [bold]{CallbackHandler.wallet}[/bold]")
                console.print(f"Session expires at: [dim]{expires_at_str}[/dim]")
                return
            
            if CallbackHandler.error:
                server.shutdown()
                console.print(f"[bold red]Authentication failed:[/bold red] {CallbackHandler.error}", style="bold red")
                raise typer.Exit(code=1)
            
            time.sleep(0.1)
        
        server.shutdown()
        console.print("[bold red]Authentication timeout (5 minutes)[/bold red]")
        raise typer.Exit(code=1)
        
    except RuntimeError as e:
        console.print(f"[bold red]Error:[/bold red] {e}")
        raise typer.Exit(code=1)
    except Exception as e:
        console.print(f"[bold red]Login failed:[/bold red] {e}", style="bold red")
        raise typer.Exit(code=1)


@app.command("status")
def status():
    """Show auth status."""
    s = session_mod.load_session()
    if not s:
        console.print("Not logged in", style="yellow")
        raise typer.Exit(code=0)
    console.print(f"Logged in as [bold]{s.wallet_address}[/bold] (expires: {s.expires_at})", style="green")


@app.command("logout")
def logout():
    """Logout and clear local session token."""
    session_mod.clear_session()
    console.print("Logged out and session cleared", style="green")