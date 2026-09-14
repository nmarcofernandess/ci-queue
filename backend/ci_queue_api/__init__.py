"""HTTP observability API for an independently installed CI Queue.

The package has no dependency on a consuming checkout.  A project supplies a
versioned ``ci-queue.json`` and the installation supplies the mutable state
root separately.
"""

from .config import ConfigError, ProjectConfig, load_project_config

__all__ = ["ConfigError", "ProjectConfig", "load_project_config"]
