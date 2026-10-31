"""Einstiegspunkt für die gebündelte Programmdatei (PyInstaller braucht absolute Importe)."""

import sys

from nexora_worker.__main__ import main

if __name__ == "__main__":
    sys.exit(main())
