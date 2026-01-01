#!/usr/bin/env python3
"""Build all shared packages by compiling TypeScript files directly"""

import subprocess
import sys
from pathlib import Path

def build_packages(backend_dir: Path):
    """Build all shared packages"""
    packages = ["types", "config", "logger", "redis", "auth-middleware"]
    
    print("🔨 Building all shared packages...")
    
    for pkg in packages:
        pkg_dir = backend_dir / "packages" / "shared" / pkg
        src_file = pkg_dir / "src" / "index.ts"
        dist_dir = pkg_dir / "dist"
        
        if not src_file.exists():
            print(f"⚠️  {pkg}: src/index.ts not found, skipping")
            continue
        
        dist_dir.mkdir(exist_ok=True)
        
        # Compile TypeScript directly
        cmd = [
            "npx", "tsc", str(src_file),
            "--outDir", str(dist_dir),
            "--module", "commonjs",
            "--target", "es2020",
            "--esModuleInterop",
            "--skipLibCheck",
            "--declaration",
            "--resolveJsonModule"
        ]
        
        result = subprocess.run(cmd, cwd=str(backend_dir), capture_output=True, text=True)
        
        if (dist_dir / "index.js").exists():
            print(f"  ✅ {pkg}")
        else:
            print(f"  ❌ {pkg} failed")
            if result.stderr:
                print(f"     Error: {result.stderr[:200]}")
    
    # Also run root build
    print("Running root build...")
    subprocess.run(["npm", "run", "build"], cwd=str(backend_dir), capture_output=True)
    
    print("✅ Build complete")

if __name__ == "__main__":
    backend_dir = Path(__file__).parent.absolute()
    build_packages(backend_dir)

