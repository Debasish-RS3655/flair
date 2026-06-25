"""Metrics command group: stage commit metrics in .flair/metrics.json."""

from __future__ import annotations

from datetime import datetime, timezone
import json
from pathlib import Path

import typer
from rich.console import Console

app = typer.Typer(help="Stage and manage commit metrics")
console = Console()


def _get_flair_dir() -> Path:
    flair_dir = Path.cwd() / ".flair"
    if not flair_dir.exists():
        console.print("[red]Not in a Flair repository. Run 'flair init' first.[/red]")
        raise typer.Exit(code=1)
    return flair_dir


def _metrics_file() -> Path:
    return _get_flair_dir() / "metrics.json"


def _load_metrics(path: Path) -> dict:
    if not path.exists():
        return {}
    try:
        with open(path, "r") as f:
            data = json.load(f)
        if not isinstance(data, dict):
            console.print("[yellow]Warning: .flair/metrics.json is not a JSON object. Resetting staged metrics.[/yellow]")
            return {}
        return data
    except Exception as e:
        console.print(f"[yellow]Warning: Could not read staged metrics: {e}[/yellow]")
        return {}


def _parse_metric_value(raw: str):
    """Parse a scalar metric token into int/float/str."""
    text = raw.strip()
    if not text:
        return None

    try:
        # Keep integers as ints when possible, otherwise use float.
        if text.lower() in {"nan", "+nan", "-nan", "inf", "+inf", "-inf"}:
            return float(text)
        if "." not in text and "e" not in text.lower():
            return int(text)
        return float(text)
    except Exception:
        return text


def _read_mlflow_metric_file(file_path: Path):
    """Read the latest value from an MLflow metric file."""
    try:
        with open(file_path, "r") as f:
            lines = [line.strip() for line in f.readlines() if line.strip()]
        if not lines:
            return None

        # MLflow file format is typically: <timestamp> <value> <step>
        latest = lines[-1].split()
        if len(latest) >= 2:
            return _parse_metric_value(latest[1])
        return _parse_metric_value(latest[-1])
    except Exception as e:
        console.print(f"[yellow]Warning: Could not parse metric file {file_path}: {e}[/yellow]")
        return None


def _find_mlflow_run_dirs(source: Path) -> list[Path]:
    """Find MLflow run directories under source by locating metrics/ folders."""
    if not source.exists():
        return []

    run_dirs: list[Path] = []
    for metrics_dir in source.rglob("metrics"):
        if not metrics_dir.is_dir():
            continue
        try:
            has_files = any(child.is_file() for child in metrics_dir.iterdir())
        except Exception:
            has_files = False
        if has_files:
            run_dirs.append(metrics_dir.parent)

    # Deduplicate while preserving order.
    unique: list[Path] = []
    seen: set[Path] = set()
    for run_dir in run_dirs:
        if run_dir not in seen:
            seen.add(run_dir)
            unique.append(run_dir)
    return unique


def _load_mlflow_metrics_from_run(run_dir: Path) -> dict:
    """Load latest scalar metrics from a single MLflow run directory."""
    metrics_dir = run_dir / "metrics"
    if not metrics_dir.exists() or not metrics_dir.is_dir():
        return {}

    imported: dict = {}
    for metric_file in metrics_dir.rglob("*"):
        if not metric_file.is_file():
            continue

        metric_name = metric_file.relative_to(metrics_dir).as_posix()
        metric_value = _read_mlflow_metric_file(metric_file)
        if metric_value is None:
            continue

        imported[metric_name] = metric_value

    return imported


@app.command("set")
def set_metrics(
    epoch: int | None = typer.Option(None, "--epoch", help="Training epoch"),
    accuracy: float | None = typer.Option(None, "--accuracy", help="Accuracy metric"),
    val_loss: float | None = typer.Option(None, "--val-loss", help="Validation loss"),
    train_loss: float | None = typer.Option(None, "--train-loss", help="Training loss"),
    precision: float | None = typer.Option(None, "--precision", help="Precision metric"),
    recall: float | None = typer.Option(None, "--recall", help="Recall metric"),
    f1: float | None = typer.Option(None, "--f1", help="F1 score"),
    learning_rate: float | None = typer.Option(None, "--learning-rate", help="Learning rate"),
    notes: str | None = typer.Option(None, "--notes", help="Optional notes"),
):
    """Set or update staged metrics in .flair/metrics.json."""
    updates = {
        "epoch": epoch,
        "accuracy": accuracy,
        "val_loss": val_loss,
        "train_loss": train_loss,
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "learning_rate": learning_rate,
        "notes": notes,
    }
    updates = {k: v for k, v in updates.items() if v is not None}

    if not updates:
        console.print("[yellow]No metrics provided. Use at least one option with 'flair metrics set'.[/yellow]")
        raise typer.Exit(code=1)

    path = _metrics_file()
    data = _load_metrics(path)
    data.update(updates)
    data["updatedAt"] = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")

    with open(path, "w") as f:
        json.dump(data, f, indent=2)

    console.print("[green]Metrics staged.[/green]")
    console.print(f"[dim]File: {path}[/dim]")


@app.command("import")
def import_metrics(
    source: Path = typer.Option(Path("mlruns"), "--source", help="Path to MLflow tracking directory"),
    run_id: str | None = typer.Option(None, "--run-id", help="Specific MLflow run ID to import"),
):
    """Import metrics from MLflow logs and stage them in .flair/metrics.json."""
    flair_dir = _get_flair_dir()

    source_path = source if source.is_absolute() else (Path.cwd() / source)
    if not source_path.exists():
        console.print(f"[red]MLflow source path not found: {source_path}[/red]")
        raise typer.Exit(code=1)

    selected_run_dir: Path | None = None

    if run_id:
        # Common MLflow layout: <mlruns>/<experiment_id>/<run_id>/metrics
        for experiment_dir in source_path.iterdir():
            if not experiment_dir.is_dir():
                continue
            candidate = experiment_dir / run_id
            if (candidate / "metrics").exists():
                selected_run_dir = candidate
                break

        # Also allow directly pointing at a run folder under source.
        if selected_run_dir is None:
            direct_candidate = source_path / run_id
            if (direct_candidate / "metrics").exists():
                selected_run_dir = direct_candidate

        if selected_run_dir is None:
            console.print(f"[red]Could not find MLflow run '{run_id}' under {source_path}[/red]")
            raise typer.Exit(code=1)
    else:
        run_dirs = _find_mlflow_run_dirs(source_path)
        if not run_dirs:
            console.print(f"[red]No MLflow run metrics found under {source_path}[/red]")
            raise typer.Exit(code=1)

        # Pick the most recently modified run directory.
        selected_run_dir = max(run_dirs, key=lambda p: p.stat().st_mtime)

    imported_metrics = _load_mlflow_metrics_from_run(selected_run_dir)
    if not imported_metrics:
        console.print(f"[red]No importable metrics found in run: {selected_run_dir}[/red]")
        raise typer.Exit(code=1)

    path = _metrics_file()
    data = _load_metrics(path)
    data.update(imported_metrics)
    data["updatedAt"] = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")

    with open(path, "w") as f:
        json.dump(data, f, indent=2)

    console.print("[green]Metrics imported from MLflow and staged.[/green]")
    console.print(f"[dim]Run: {selected_run_dir}[/dim]")
    console.print(f"[dim]Imported metrics: {len(imported_metrics)}[/dim]")
    console.print(f"[dim]File: {path}[/dim]")


@app.command("show")
def show_metrics():
    """Show current staged metrics from .flair/metrics.json."""
    path = _metrics_file()
    if not path.exists():
        console.print("No staged metrics found.")
        console.print("Use 'flair metrics set' or 'flair metrics import'.")
        raise typer.Exit(code=0)

    data = _load_metrics(path)
    if not data:
        console.print("No staged metrics found.")
        console.print("Use 'flair metrics set' or 'flair metrics import'.")
        raise typer.Exit(code=0)

    console.print("Current staged metrics:")
    for key, value in data.items():
        console.print(f"- {key}: {value}")


@app.command("reset")
def reset_metrics():
    """Reset staged metrics by deleting .flair/metrics.json."""
    path = _metrics_file()
    if not path.exists():
        console.print("No staged metrics to reset.")
        raise typer.Exit(code=0)

    try:
        path.unlink()
        console.print("Metrics reset.")
    except Exception as e:
        console.print(f"[red]Failed to reset metrics: {e}[/red]")
        raise typer.Exit(code=1)
