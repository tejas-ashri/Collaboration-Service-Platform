#!/usr/bin/env python3
"""
Start script for the Collaboration Platform Application
Starts all backend services, frontend, and optionally Docker services.
"""

import os
import sys
import subprocess
import signal
import time
import shutil
from pathlib import Path
from typing import List, Optional

# Color codes for terminal output
class Colors:
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    RED = '\033[91m'
    BLUE = '\033[94m'
    CYAN = '\033[96m'
    RESET = '\033[0m'
    BOLD = '\033[1m'

def print_colored(message: str, color: str = Colors.RESET):
    """Print colored message"""
    print(f"{color}{message}{Colors.RESET}")

def check_command(command: str) -> bool:
    """Check if a command is available"""
    return shutil.which(command) is not None

def check_prerequisites() -> bool:
    """Check if all prerequisites are installed"""
    print_colored("\n🔍 Checking prerequisites...", Colors.CYAN)
    
    required = {
        "node": "Node.js",
        "npm": "npm",
    }
    
    missing = []
    for cmd, name in required.items():
        if check_command(cmd):
            version = subprocess.run([cmd, "--version"], capture_output=True, text=True)
            print_colored(f"  ✅ {name}: {version.stdout.strip()}", Colors.GREEN)
        else:
            print_colored(f"  ❌ {name} is not installed", Colors.RED)
            missing.append(name)
    
    if missing:
        print_colored(f"\n⚠️  Please install: {', '.join(missing)}", Colors.YELLOW)
        return False
    
    return True

def check_docker() -> bool:
    """Check if Docker is available"""
    if check_command("docker") and check_command("docker-compose"):
        return True
    return False

def start_docker_services(backend_dir: Path) -> Optional[subprocess.Popen]:
    """Start Docker services (MongoDB and Redis)"""
    if not check_docker():
        print_colored("  ⚠️  Docker not found, skipping Docker services", Colors.YELLOW)
        print_colored("  ℹ️  Make sure MongoDB and Redis are running manually", Colors.CYAN)
        print_colored("  📖 See MONGODB_SETUP.md for instructions", Colors.CYAN)
        return None
    
    docker_compose_file = backend_dir / "docker-compose.yml"
    if not docker_compose_file.exists():
        print_colored("  ⚠️  docker-compose.yml not found", Colors.YELLOW)
        return None
    
    print_colored("\n🐳 Starting Docker services (MongoDB & Redis)...", Colors.CYAN)
    try:
        # Check if services are already running
        check_process = subprocess.run(
            ["docker-compose", "ps", "-q"],
            cwd=backend_dir,
            capture_output=True,
            text=True
        )
        
        if check_process.returncode == 0 and check_process.stdout.strip():
            print_colored("  ℹ️  Docker services may already be running", Colors.CYAN)
            # Verify MongoDB is accessible
            time.sleep(1)
            return None
        
        process = subprocess.Popen(
            ["docker-compose", "up", "-d"],
            cwd=backend_dir,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE
        )
        stdout, stderr = process.communicate()
        
        if process.returncode == 0:
            print_colored("  ✅ Docker services started", Colors.GREEN)
            # Wait a bit for services to be ready
            print_colored("  ⏳ Waiting for MongoDB to be ready...", Colors.CYAN)
            time.sleep(5)
            return process
        else:
            error_msg = stderr.decode() if stderr else stdout.decode()
            if "already" in error_msg.lower() or "up-to-date" in error_msg.lower():
                print_colored("  ✅ Docker services are already running", Colors.GREEN)
            else:
                print_colored(f"  ⚠️  Docker services warning: {error_msg[:100]}", Colors.YELLOW)
            return None
    except Exception as e:
        print_colored(f"  ❌ Failed to start Docker services: {e}", Colors.RED)
        print_colored("  📖 See MONGODB_SETUP.md for manual setup instructions", Colors.CYAN)
        return None

def setup_env_file(backend_dir: Path):
    """Create .env file if it doesn't exist"""
    env_file = backend_dir / ".env"
    example_env = backend_dir / "example.env"
    
    if env_file.exists():
        print_colored("  ✅ .env file exists", Colors.GREEN)
        return
    
    if example_env.exists():
        print_colored("  📝 Creating .env file from example.env...", Colors.CYAN)
        shutil.copy(example_env, env_file)
        print_colored("  ✅ Created .env file", Colors.GREEN)
        print_colored("  ⚠️  Please review and update .env with your configuration", Colors.YELLOW)
    else:
        print_colored("  ⚠️  example.env not found, skipping .env creation", Colors.YELLOW)

def load_env_file(backend_dir: Path) -> dict:
    """Load environment variables from .env file"""
    env_vars = os.environ.copy()
    env_file = backend_dir / ".env"
    
    if env_file.exists():
        try:
            with open(env_file, 'r') as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith('#') and '=' in line:
                        key, value = line.split('=', 1)
                        # Remove quotes if present
                        value = value.strip('"').strip("'")
                        env_vars[key.strip()] = value
        except Exception as e:
            print_colored(f"  ⚠️  Warning: Could not load .env file: {e}", Colors.YELLOW)
    
    return env_vars

def start_backend_service(backend_dir: Path, service_name: str, port: int, log_file: Path) -> Optional[subprocess.Popen]:
    """Start a single backend service"""
    print_colored(f"  📦 Starting {service_name} (port {port})...", Colors.CYAN)
    
    # Load environment variables from .env file
    env_vars = load_env_file(backend_dir)
    
    # Use node with dotenv/config for better environment loading
    try:
        with open(log_file, 'w') as log:
            # For auth service, use the dedicated script
            if service_name.lower() == "auth":
                script_path = backend_dir / "start-auth-service.sh"
                if script_path.exists():
                    process = subprocess.Popen(
                        ["bash", str(script_path)],
                        cwd=backend_dir,
                        stdout=log,
                        stderr=subprocess.STDOUT,
                        env=env_vars
                    )
                else:
                    # Fallback to npm with dotenv
                    process = subprocess.Popen(
                        ["node", "-r", "dotenv/config", "node_modules/.bin/ts-node-dev", "--respawn", 
                         f"services/{service_name.lower()}/src/index.ts"],
                        cwd=backend_dir,
                        stdout=log,
                        stderr=subprocess.STDOUT,
                        env=env_vars
                    )
            else:
                # For other services, use npm run
                process = subprocess.Popen(
                    ["node", "-r", "dotenv/config", "node_modules/.bin/ts-node-dev", "--respawn",
                     f"services/{service_name.lower()}/src/index.ts"],
                    cwd=backend_dir,
                    stdout=log,
                    stderr=subprocess.STDOUT,
                    env=env_vars
                )
        
        # Give it a moment to start
        time.sleep(1)
        
        if process.poll() is None:  # Process is still running
            print_colored(f"    ✅ {service_name} started (PID: {process.pid})", Colors.GREEN)
            return process
        else:
            print_colored(f"    ❌ {service_name} failed to start", Colors.RED)
            return None
    except Exception as e:
        print_colored(f"    ❌ Failed to start {service_name}: {e}", Colors.RED)
        return None

def start_frontend(frontend_dir: Path) -> Optional[subprocess.Popen]:
    """Start the frontend service"""
    print_colored("\n🎨 Starting Frontend (port 3000)...", Colors.CYAN)
    
    try:
        process = subprocess.Popen(
            ["npm", "run", "dev"],
            cwd=frontend_dir,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT
        )
        
        time.sleep(2)
        
        if process.poll() is None:
            print_colored("  ✅ Frontend started", Colors.GREEN)
            return process
        else:
            print_colored("  ❌ Frontend failed to start", Colors.RED)
            return None
    except Exception as e:
        print_colored(f"  ❌ Failed to start frontend: {e}", Colors.RED)
        return None

def check_service_health(port: int, service_name: str) -> bool:
    """Check if a service is responding on its health endpoint"""
    try:
        import urllib.request
        response = urllib.request.urlopen(f"http://localhost:{port}/health", timeout=2)
        return response.getcode() == 200
    except:
        return False

def main():
    """Main function to start all services"""
    # Get project root directory
    script_dir = Path(__file__).parent.absolute()
    backend_dir = script_dir / "backend"
    frontend_dir = script_dir / "frontend"
    
    print_colored("\n" + "="*60, Colors.BOLD)
    print_colored("🚀 Starting Collaboration Platform Application", Colors.BOLD + Colors.CYAN)
    print_colored("="*60 + "\n", Colors.BOLD)
    
    # Check prerequisites
    if not check_prerequisites():
        sys.exit(1)
    
    # Check if directories exist
    if not backend_dir.exists():
        print_colored(f"❌ Backend directory not found: {backend_dir}", Colors.RED)
        sys.exit(1)
    
    if not frontend_dir.exists():
        print_colored(f"❌ Frontend directory not found: {frontend_dir}", Colors.RED)
        sys.exit(1)
    
    # Setup .env file
    print_colored("\n📋 Setting up environment...", Colors.CYAN)
    setup_env_file(backend_dir)
    
    # Start Docker services
    docker_process = start_docker_services(backend_dir)
    
    # Install dependencies if needed
    print_colored("\n📦 Checking dependencies...", Colors.CYAN)
    node_modules_backend = backend_dir / "node_modules"
    node_modules_frontend = frontend_dir / "node_modules"
    
    if not node_modules_backend.exists():
        print_colored("  📥 Installing backend dependencies...", Colors.CYAN)
        subprocess.run(["npm", "install"], cwd=backend_dir, check=True)
        print_colored("  ✅ Backend dependencies installed", Colors.GREEN)
    else:
        print_colored("  ✅ Backend dependencies found", Colors.GREEN)
    
    if not node_modules_frontend.exists():
        print_colored("  📥 Installing frontend dependencies...", Colors.CYAN)
        subprocess.run(["npm", "install"], cwd=frontend_dir, check=True)
        print_colored("  ✅ Frontend dependencies installed", Colors.GREEN)
    else:
        print_colored("  ✅ Frontend dependencies found", Colors.GREEN)
    
    # Build backend packages
    print_colored("\n🔨 Building backend packages...", Colors.CYAN)
    build_script = backend_dir / "build-packages.py"
    if build_script.exists():
        try:
            result = subprocess.run(
                [sys.executable, str(build_script)],
                cwd=backend_dir,
                capture_output=True,
                text=True,
                timeout=120
            )
            if result.returncode == 0:
                print_colored("  ✅ Backend packages built", Colors.GREEN)
            else:
                print_colored(f"  ⚠️  Build had issues: {result.stderr[:200]}", Colors.YELLOW)
        except subprocess.TimeoutExpired:
            print_colored("  ⚠️  Build timed out, continuing anyway", Colors.YELLOW)
        except Exception as e:
            print_colored(f"  ⚠️  Build error: {e}, continuing anyway", Colors.YELLOW)
    else:
        # Fallback to npm build
        try:
            result = subprocess.run(["npm", "run", "build"], cwd=backend_dir, 
                                  capture_output=True, text=True, timeout=60)
            if result.returncode == 0:
                print_colored("  ✅ Backend packages built", Colors.GREEN)
            else:
                print_colored(f"  ⚠️  Build warnings: {result.stderr[:200]}", Colors.YELLOW)
        except subprocess.TimeoutExpired:
            print_colored("  ⚠️  Build timed out, continuing anyway", Colors.YELLOW)
        except Exception as e:
            print_colored(f"  ⚠️  Build error: {e}, continuing anyway", Colors.YELLOW)
    
    # Start backend services
    print_colored("\n🔧 Starting Backend Services...", Colors.CYAN)
    
    services = [
        ("auth", 4000),
        ("project", 4001),
        ("collab", 4002),
        ("file", 4003),
        ("ai", 4004),
    ]
    
    processes: List[subprocess.Popen] = []
    log_dir = Path("/tmp") if os.name != 'nt' else Path(os.getenv('TEMP', '.'))
    
    for service_name, port in services:
        log_file = log_dir / f"{service_name}-service.log"
        process = start_backend_service(backend_dir, service_name, port, log_file)
        if process:
            processes.append(process)
        time.sleep(0.5)  # Small delay between services
    
    # Start frontend
    frontend_process = start_frontend(frontend_dir)
    if frontend_process:
        processes.append(frontend_process)
    
    # Wait a bit for services to initialize
    print_colored("\n⏳ Waiting for services to initialize...", Colors.CYAN)
    time.sleep(3)
    
    # Check service health
    print_colored("\n🏥 Checking service health...", Colors.CYAN)
    for service_name, port in services:
        if check_service_health(port, service_name):
            print_colored(f"  ✅ {service_name} is healthy (port {port})", Colors.GREEN)
        else:
            print_colored(f"  ⚠️  {service_name} health check failed (port {port})", Colors.YELLOW)
            print_colored(f"     Check logs: {log_dir / f'{service_name}-service.log'}", Colors.CYAN)
    
    # Summary
    print_colored("\n" + "="*60, Colors.BOLD)
    print_colored("✅ Application Started!", Colors.BOLD + Colors.GREEN)
    print_colored("="*60, Colors.BOLD)
    print_colored(f"\n📋 Services Running:", Colors.CYAN)
    print_colored(f"   Backend Services: {len([p for p in processes if p != frontend_process])}/5", Colors.CYAN)
    print_colored(f"   Frontend: {'✅' if frontend_process else '❌'}", Colors.CYAN)
    print_colored(f"\n🌐 Access the application at:", Colors.CYAN)
    print_colored(f"   Frontend: {Colors.BOLD}http://localhost:3000{Colors.RESET}", Colors.GREEN)
    print_colored(f"\n📝 Service Logs:", Colors.CYAN)
    for service_name, _ in services:
        log_file = log_dir / f"{service_name}-service.log"
        print_colored(f"   {service_name}: {log_file}", Colors.CYAN)
    
    print_colored(f"\n🛑 To stop all services, press Ctrl+C", Colors.YELLOW)
    print_colored("="*60 + "\n", Colors.BOLD)
    
    # Handle graceful shutdown
    def signal_handler(sig, frame):
        print_colored("\n\n🛑 Shutting down services...", Colors.YELLOW)
        
        # Stop all processes
        for process in processes:
            try:
                process.terminate()
            except:
                pass
        
        # Stop Docker services
        if docker_process and check_docker():
            try:
                subprocess.run(["docker-compose", "down"], cwd=backend_dir, 
                             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            except:
                pass
        
        print_colored("✅ All services stopped", Colors.GREEN)
        sys.exit(0)
    
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    # Keep script running and monitor processes
    try:
        while True:
            # Check if any process has died
            for i, process in enumerate(processes):
                if process.poll() is not None:
                    service_name = services[i][0] if i < len(services) else "frontend"
                    print_colored(f"\n⚠️  {service_name} service stopped unexpectedly", Colors.YELLOW)
                    processes.remove(process)
            
            if not processes:
                print_colored("\n⚠️  All services have stopped", Colors.YELLOW)
                break
            
            time.sleep(5)
    except KeyboardInterrupt:
        signal_handler(None, None)

if __name__ == "__main__":
    main()

