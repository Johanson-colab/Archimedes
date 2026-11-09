"""Report paper2slides prerequisites without printing credentials or changing settings."""
from __future__ import annotations
import importlib.util
import json
import os
import shutil
import subprocess
from pathlib import Path


def main() -> None:
    commands = {name: shutil.which(name) for name in ('node', 'npm', 'pdftoppm', 'soffice')}
    packages = {name: importlib.util.find_spec(name) is not None for name in ('requests', 'dotenv', 'PIL', 'markitdown')}
    node_modules = {}
    if commands['npm'] and commands['node']:
        result = subprocess.run(['npm', 'root', '-g'], capture_output=True, text=True)
        root = Path(result.stdout.strip()) if result.returncode == 0 else None
        for package in ('pptxgenjs', 'react', 'react-dom', 'react-icons', 'sharp'):
            node_modules[package] = bool(root and (root / package).exists())
    fontconfig = Path('/opt/homebrew/etc/fonts/fonts.conf')
    report = {'commands': commands, 'python_packages': packages, 'global_node_modules': node_modules,
              'mineru_token_configured': bool(os.environ.get('MINERU_API_TOKEN', '').strip()),
              'fontconfig': {'current_file': os.environ.get('FONTCONFIG_FILE'),
                             'homebrew_available': fontconfig.is_file(),
                             'suggested_file': str(fontconfig) if fontconfig.is_file() else None},
              'note': 'Presence checks do not validate authentication, network, installed fonts or visual output. Render a CJK slide when relevant.'}
    print(json.dumps(report, ensure_ascii=False, indent=2))

if __name__ == '__main__':
    main()
