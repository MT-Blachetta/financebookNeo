#!/bin/bash

# FinanceBook Application Launcher
# This script checks dependencies, sets up the environment and starts the application

set -e  # exit on any error

# colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # no color

# function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to check Python version
check_python_version() {
    if command_exists python3; then
        PYTHON_VERSION=$(python3 -c 'import sys; print(".".join(map(str, sys.version_info[:2])))')
        PYTHON_MAJOR=$(echo $PYTHON_VERSION | cut -d. -f1)
        PYTHON_MINOR=$(echo $PYTHON_VERSION | cut -d. -f2)
        
        if [ "$PYTHON_MAJOR" -eq 3 ] && [ "$PYTHON_MINOR" -ge 8 ]; then
            return 0
        else
            return 1
        fi
    else
        return 1
    fi
}

# Function to check Node.js version
check_node_version() {
    if command_exists node; then
        NODE_VERSION=$(node -v | sed 's/v//')
        NODE_MAJOR=$(echo $NODE_VERSION | cut -d. -f1)
        
        if [ "$NODE_MAJOR" -ge 18 ]; then
            return 0
        else
            return 1
        fi
    else
        return 1
    fi
}

# function to ask for user confirmation
ask_confirmation() {
    while true; do
        read -p "$1 (y/n): " yn
        case $yn in
            [Yy]* ) return 0;;
            [Nn]* ) return 1;;
            * ) echo "Please answer yes or no.";;
        esac
    done
}

print_status "starting FinanceBook Application Setup..."

# check for required software
print_status "Checking system requirements..."

MISSING_DEPS=()

# check Python
if check_python_version; then
    print_success "Python 3.8+ found: $(python3 --version)"
else
    print_error "Python 3.8+ is required but not found"
    MISSING_DEPS+=("python3 (version 3.8 or higher)")
fi

# check venv module
if python3 -m venv --help >/dev/null 2>&1; then
    print_success "Python venv module found"
else
    print_error "Python venv module is required but not found"
    MISSING_DEPS+=("python3-venv")
fi

# check Node.js
if check_node_version; then
    print_success "Node.js 18+ found: $(node --version)"
else
    print_error "Node.js 18+ is required but not found"
    MISSING_DEPS+=("nodejs (version 18 or higher)")
fi

# check npm
if command_exists npm; then
    print_success "npm found: $(npm --version)"
else
    print_error "npm is required but not found"
    MISSING_DEPS+=("npm")
fi

# check Docker
if command_exists docker; then
    print_success "Docker found: $(docker --version | cut -d' ' -f1-3)"
    
    # check if Docker daemon is running
    if ! docker info >/dev/null 2>&1; then
        print_error "Docker daemon is not running"
        MISSING_DEPS+=("docker daemon (please start Docker service)")
    fi
else
    print_error "Docker is required but not found"
    MISSING_DEPS+=("docker")
fi

# If any dependencies are missing then exit
if [ ${#MISSING_DEPS[@]} -ne 0 ]; then
    print_error "Missing required dependencies:"
    for dep in "${MISSING_DEPS[@]}"; do
        echo "  - $dep"
    done
    echo ""
    print_error "Please install the missing dependencies and run this script again."
    echo ""
    echo "Installation commands for Ubuntu/Debian:"
    echo "  sudo apt update"
    echo "  sudo apt install python3 python3-venv nodejs npm docker.io"
    echo "  sudo systemctl start docker"
    echo "  sudo usermod -aG docker \$USER  # Then logout and login again"
    echo ""
    echo "For other systems, please refer to the official documentation."
    exit 1
fi

print_success "All required dependencies are installed!"

# check if we're in the correct directory
if [ ! -f "requirements.txt" ] || [ ! -d "frontend" ] || [ ! -f "Dockerfile" ]; then
    print_error "This script must be run from the FinanceBook project root directory"
    print_error "Make sure you're in the directory containing requirements.txt, frontend/, and Dockerfile"
    exit 1
fi

# setup Python virtual environment
print_status "Setting up Python virtual environment..."
if [ ! -d ".venv" ]; then
    python3 -m venv .venv
    print_success "Virtual environment created"
else
    print_success "Virtual environment already exists"
fi

# activate virtual environment and install dependencies
print_status "Installing Python dependencies..."
source .venv/bin/activate

# pip will be available in the virtual environment
python -m pip install --upgrade pip setuptools wheel
python -m pip install -r requirements.txt
print_success "Python dependencies installed"

# create .env file if it doesn't exist
print_status "Setting up environment configuration..."
if [ ! -f ".env" ]; then
    echo "DATABASE_URL=postgresql+psycopg2://yourself:secretPassword@localhost/financebook" > .env
    print_success "Created app/.env file with database configuration"
else
    print_success ".env file already exists"
fi

# setup frontend dependencies
print_status "Installing frontend dependencies..."
cd frontend
npm install
cd ..
print_success "Frontend dependencies installed"

# check if PostgreSQL container is already running
print_status "Setting up PostgreSQL database..."
if docker ps | grep -q "financebook-db"; then
    print_success "PostgreSQL container is already running"
elif docker ps -a | grep -q "financebook-db"; then
    print_status "Starting existing PostgreSQL container..."
    docker start financebook-db
    print_success "PostgreSQL container started"
else
    print_status "Creating and starting PostgreSQL container..."
    docker build -t financebook-postgres .
    mkdir /home/$USERNAME/financebookDatabase
    docker run -d --name financebook-db -p 5432:5432 -v postgres_data:/home/$USERNAME/financebookDatabase financebook-postgres
    print_success "PostgreSQL container created and started"
    
    # wait a moment for the database to initialize
    print_status "Waiting for database to initialize..."
    sleep 5
fi

# check if ports are available
print_status "Checking if required ports are available..."
if lsof -Pi :8000 -sTCP:LISTEN -t >/dev/null 2>&1; then
    if ask_confirmation "Port 8000 is already in use. Do you want to continue anyway?"; then
        print_warning "Continuing with port 8000 potentially in use"
    else
        print_error "Aborting due to port conflict"
        exit 1
    fi
fi

if lsof -Pi :5173 -sTCP:LISTEN -t >/dev/null 2>&1; then
    if ask_confirmation "Port 5173 is already in use. Do you want to continue anyway?"; then
        print_warning "Continuing with port 5173 potentially in use"
    else
        print_error "Aborting due to port conflict"
        exit 1
    fi
fi

print_success "Setup completed successfully!"
echo ""
print_status "Starting the application..."

# Function to cleanup on exit
cleanup() {
    print_status "Shutting down application..."
    if [ ! -z "$BACKEND_PID" ]; then
        kill $BACKEND_PID 2>/dev/null || true
    fi
    if [ ! -z "$FRONTEND_PID" ]; then
        kill $FRONTEND_PID 2>/dev/null || true
    fi
    print_success "Application stopped"
}

# set trap to cleanup on script exit
trap cleanup EXIT INT TERM

# start backend server
print_status "Starting backend server on http://localhost:8000..."
source .venv/bin/activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 > backend.log 2>&1 &
BACKEND_PID=$!

# wait a moment for backend to start
sleep 3

# check if backend started successfully
if ! kill -0 $BACKEND_PID 2>/dev/null; then
    print_error "Failed to start backend server. Check backend.log for details."
    exit 1
fi

print_success "Backend server started (PID: $BACKEND_PID)"

# start frontend server
print_status "Starting frontend server on http://localhost:5173..."
cd frontend
npm run dev > ../frontend.log 2>&1 &
FRONTEND_PID=$!
cd ..

# wait a moment for frontend to start
sleep 3

# check if frontend started successfully
if ! kill -0 $FRONTEND_PID 2>/dev/null; then
    print_error "Failed to start frontend server. Check frontend.log for details."
    exit 1
fi

print_success "Frontend server started (PID: $FRONTEND_PID)"

# wait a bit more for servers to fully initialize
sleep 2

print_success "FinanceBook is now running!"
echo ""
echo "🌐 Frontend: http://localhost:5173"
echo "🔧 Backend API: http://localhost:8000"
echo "📚 API Documentation: http://localhost:8000/docs"
echo ""
print_status "Opening application in browser..."

# try to open browser
if command_exists xdg-open; then
    xdg-open http://localhost:5173 >/dev/null 2>&1 &
elif command_exists open; then
    open http://localhost:5173 >/dev/null 2>&1 &
elif command_exists start; then
    start http://localhost:5173 >/dev/null 2>&1 &
else
    print_warning "Could not automatically open browser. Please navigate to http://localhost:5173"
fi

echo ""
print_status "Application is running. Press Ctrl+C to stop."
echo ""
print_status "Logs are being written to:"
echo "  - Backend: backend.log"
echo "  - Frontend: frontend.log"

# wait for user to stop the application
wait