#!/usr/bin/env bash
#
# install-tools.sh - Install all development tools for a fresh Ubuntu desktop
#
# This script installs all tools listed in the dotfiles README.md
# Prefers user-local installations (shell scripts, binaries to ~/.local/bin)
# Falls back to apt packages when user-local installation isn't possible
#
# Usage: ./install-tools.sh
#
# Log file: ./install.log (in the directory where script is run)

set -o pipefail

# ============================================================================
# Configuration
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="${SCRIPT_DIR}/install.log"
LOCAL_BIN="${HOME}/.local/bin"
APPLICATIONS_DIR="${HOME}/Applications"

# Track installation results
declare -a INSTALLED_TOOLS=()
declare -a FAILED_TOOLS=()
declare -a SKIPPED_TOOLS=()

# ============================================================================
# Logging Functions
# ============================================================================

log() {
    local level="$1"
    shift
    local message="$*"
    local timestamp
    timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[${timestamp}] [${level}] ${message}" | tee -a "$LOG_FILE"
}

log_info() {
    log "INFO" "$@"
}

log_success() {
    log "SUCCESS" "$@"
}

log_error() {
    log "ERROR" "$@"
}

log_skip() {
    log "SKIP" "$@"
}

log_section() {
    local section="$1"
    echo "" | tee -a "$LOG_FILE"
    echo "============================================================" | tee -a "$LOG_FILE"
    echo "  ${section}" | tee -a "$LOG_FILE"
    echo "============================================================" | tee -a "$LOG_FILE"
}

# ============================================================================
# Helper Functions
# ============================================================================

command_exists() {
    command -v "$1" &>/dev/null
}

add_installed() {
    local tool="$1"
    local location="$2"
    INSTALLED_TOOLS+=("${tool}:${location}")
}

add_failed() {
    local tool="$1"
    local reason="$2"
    FAILED_TOOLS+=("${tool}:${reason}")
}

add_skipped() {
    local tool="$1"
    local reason="$2"
    SKIPPED_TOOLS+=("${tool}:${reason}")
}

ensure_local_bin() {
    if [[ ! -d "$LOCAL_BIN" ]]; then
        mkdir -p "$LOCAL_BIN"
        log_info "Created ${LOCAL_BIN}"
    fi
}

ensure_applications_dir() {
    if [[ ! -d "$APPLICATIONS_DIR" ]]; then
        mkdir -p "$APPLICATIONS_DIR"
        log_info "Created ${APPLICATIONS_DIR}"
    fi
}

check_path() {
    if [[ ":$PATH:" != *":${LOCAL_BIN}:"* ]]; then
        log_info "WARNING: ${LOCAL_BIN} is not in your PATH"
        log_info "Add this to your shell config: export PATH=\"\${HOME}/.local/bin:\${PATH}\""
    fi
}

get_latest_github_release() {
    local repo="$1"
    curl -fsSL "https://api.github.com/repos/${repo}/releases/latest" 2>/dev/null | \
        grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\1/'
}

get_arch() {
    local arch
    arch=$(uname -m)
    case "$arch" in
        x86_64) echo "x86_64" ;;
        aarch64|arm64) echo "arm64" ;;
        *) echo "$arch" ;;
    esac
}

# ============================================================================
# Prerequisite Installation
# ============================================================================

install_prerequisites() {
    log_section "Prerequisites"
    
    local prereqs=(git curl wget)
    local missing=()
    
    for cmd in "${prereqs[@]}"; do
        if ! command_exists "$cmd"; then
            missing+=("$cmd")
        fi
    done
    
    if [[ ${#missing[@]} -gt 0 ]]; then
        log_info "Installing missing prerequisites: ${missing[*]}"
        sudo apt update
        sudo apt install -y "${missing[@]}"
        
        for cmd in "${missing[@]}"; do
            if command_exists "$cmd"; then
                log_success "${cmd} installed"
            else
                log_error "Failed to install ${cmd}"
                add_failed "$cmd" "apt install failed"
            fi
        done
    else
        log_info "All prerequisites already installed (git, curl, wget)"
    fi
    
    # Ensure software-properties-common for add-apt-repository
    if ! command_exists add-apt-repository; then
        log_info "Installing software-properties-common for PPA support"
        sudo apt install -y software-properties-common
    fi
}

# ============================================================================
# Shell Installer Tools
# ============================================================================

install_fzf() {
    local name="fzf"
    local install_dir="${HOME}/.fzf"
    
    if command_exists fzf; then
        add_skipped "$name" "already installed"
        log_skip "${name} already installed at $(command -v fzf)"
        return 0
    fi
    
    log_info "Installing ${name} via git clone..."
    
    if [[ -d "$install_dir" ]]; then
        rm -rf "$install_dir"
    fi
    
    if git clone --depth 1 https://github.com/junegunn/fzf.git "$install_dir" 2>>"$LOG_FILE"; then
        # Run install without shell integration (--no-key-bindings --no-completion --no-update-rc)
        if "${install_dir}/install" --bin >>"$LOG_FILE" 2>&1; then
            # Symlink to local bin
            ln -sf "${install_dir}/bin/fzf" "${LOCAL_BIN}/fzf"
            add_installed "$name" "${install_dir}/bin/fzf"
            log_success "${name} installed at ${install_dir}/bin/fzf"
        else
            add_failed "$name" "install script failed"
            log_error "${name}: install script failed"
        fi
    else
        add_failed "$name" "git clone failed"
        log_error "${name}: git clone failed"
    fi
}

install_zoxide() {
    local name="zoxide"
    
    if command_exists zoxide; then
        add_skipped "$name" "already installed"
        log_skip "${name} already installed at $(command -v zoxide)"
        return 0
    fi
    
    log_info "Installing ${name} via install script..."
    
    if curl -sSfL https://raw.githubusercontent.com/ajeetdsouza/zoxide/main/install.sh | sh >>"$LOG_FILE" 2>&1; then
        if command_exists zoxide || [[ -x "${LOCAL_BIN}/zoxide" ]]; then
            add_installed "$name" "${LOCAL_BIN}/zoxide"
            log_success "${name} installed at ${LOCAL_BIN}/zoxide"
        else
            add_failed "$name" "binary not found after install"
            log_error "${name}: binary not found after install"
        fi
    else
        add_failed "$name" "install script failed"
        log_error "${name}: install script failed"
    fi
}

install_lazydocker() {
    local name="lazydocker"
    
    if command_exists lazydocker; then
        add_skipped "$name" "already installed"
        log_skip "${name} already installed at $(command -v lazydocker)"
        return 0
    fi
    
    log_info "Installing ${name} via install script..."
    
    # The script installs to ~/.local/bin by default
    if curl -fsSL https://raw.githubusercontent.com/jesseduffield/lazydocker/master/scripts/install_update_linux.sh | bash >>"$LOG_FILE" 2>&1; then
        if command_exists lazydocker || [[ -x "${LOCAL_BIN}/lazydocker" ]]; then
            add_installed "$name" "${LOCAL_BIN}/lazydocker"
            log_success "${name} installed at ${LOCAL_BIN}/lazydocker"
        else
            add_failed "$name" "binary not found after install"
            log_error "${name}: binary not found after install"
        fi
    else
        add_failed "$name" "install script failed"
        log_error "${name}: install script failed"
    fi
}

install_opencode() {
    local name="opencode"
    
    if command_exists opencode; then
        add_skipped "$name" "already installed"
        log_skip "${name} already installed at $(command -v opencode)"
        return 0
    fi
    
    log_info "Installing ${name} via install script..."
    
    if curl -fsSL https://opencode.ai/install | bash >>"$LOG_FILE" 2>&1; then
        if command_exists opencode || [[ -x "${LOCAL_BIN}/opencode" ]]; then
            add_installed "$name" "${LOCAL_BIN}/opencode"
            log_success "${name} installed at ${LOCAL_BIN}/opencode"
        else
            add_failed "$name" "binary not found after install"
            log_error "${name}: binary not found after install"
        fi
    else
        add_failed "$name" "install script failed"
        log_error "${name}: install script failed"
    fi
}

install_beads() {
    local name="beads"
    
    if command_exists bd; then
        add_skipped "$name" "already installed"
        log_skip "${name} already installed at $(command -v bd)"
        return 0
    fi
    
    log_info "Installing ${name} via install script..."
    
    if curl -fsSL https://raw.githubusercontent.com/steveyegge/beads/main/scripts/install.sh | bash >>"$LOG_FILE" 2>&1; then
        if command_exists bd || [[ -x "${LOCAL_BIN}/bd" ]]; then
            add_installed "$name" "${LOCAL_BIN}/bd"
            log_success "${name} (bd) installed at ${LOCAL_BIN}/bd"
        else
            add_failed "$name" "binary not found after install"
            log_error "${name}: binary not found after install"
        fi
    else
        add_failed "$name" "install script failed"
        log_error "${name}: install script failed"
    fi
}

# ============================================================================
# Binary Download Tools
# ============================================================================

install_lazygit() {
    local name="lazygit"
    
    if command_exists lazygit; then
        add_skipped "$name" "already installed"
        log_skip "${name} already installed at $(command -v lazygit)"
        return 0
    fi
    
    log_info "Installing ${name} via binary download..."
    
    local version
    version=$(curl -fsSL "https://api.github.com/repos/jesseduffield/lazygit/releases/latest" 2>/dev/null | \
        grep -Po '"tag_name": *"v\K[^"]*')
    
    if [[ -z "$version" ]]; then
        add_failed "$name" "could not determine latest version"
        log_error "${name}: could not determine latest version"
        return 1
    fi
    
    local arch
    arch=$(get_arch)
    local arch_suffix="x86_64"
    [[ "$arch" == "arm64" ]] && arch_suffix="arm64"
    
    local url="https://github.com/jesseduffield/lazygit/releases/download/v${version}/lazygit_${version}_Linux_${arch_suffix}.tar.gz"
    local tmp_dir
    tmp_dir=$(mktemp -d)
    
    if curl -fsSL "$url" -o "${tmp_dir}/lazygit.tar.gz" 2>>"$LOG_FILE"; then
        if tar -xzf "${tmp_dir}/lazygit.tar.gz" -C "$tmp_dir" lazygit 2>>"$LOG_FILE"; then
            mv "${tmp_dir}/lazygit" "${LOCAL_BIN}/lazygit"
            chmod +x "${LOCAL_BIN}/lazygit"
            add_installed "$name" "${LOCAL_BIN}/lazygit"
            log_success "${name} v${version} installed at ${LOCAL_BIN}/lazygit"
        else
            add_failed "$name" "tar extraction failed"
            log_error "${name}: tar extraction failed"
        fi
    else
        add_failed "$name" "download failed"
        log_error "${name}: download failed from ${url}"
    fi
    
    rm -rf "$tmp_dir"
}

install_sesh() {
    local name="sesh"
    
    if command_exists sesh; then
        add_skipped "$name" "already installed"
        log_skip "${name} already installed at $(command -v sesh)"
        return 0
    fi
    
    log_info "Installing ${name} via binary download..."
    
    local version
    version=$(get_latest_github_release "joshmedeski/sesh")
    
    if [[ -z "$version" ]]; then
        add_failed "$name" "could not determine latest version"
        log_error "${name}: could not determine latest version"
        return 1
    fi
    
    local arch
    arch=$(get_arch)
    local arch_suffix="x86_64"
    [[ "$arch" == "arm64" ]] && arch_suffix="arm64"
    
    # sesh uses format: sesh_Linux_x86_64.tar.gz
    local url="https://github.com/joshmedeski/sesh/releases/download/${version}/sesh_Linux_${arch_suffix}.tar.gz"
    local tmp_dir
    tmp_dir=$(mktemp -d)
    
    if curl -fsSL "$url" -o "${tmp_dir}/sesh.tar.gz" 2>>"$LOG_FILE"; then
        if tar -xzf "${tmp_dir}/sesh.tar.gz" -C "$tmp_dir" 2>>"$LOG_FILE"; then
            mv "${tmp_dir}/sesh" "${LOCAL_BIN}/sesh"
            chmod +x "${LOCAL_BIN}/sesh"
            add_installed "$name" "${LOCAL_BIN}/sesh"
            log_success "${name} ${version} installed at ${LOCAL_BIN}/sesh"
        else
            add_failed "$name" "tar extraction failed"
            log_error "${name}: tar extraction failed"
        fi
    else
        add_failed "$name" "download failed"
        log_error "${name}: download failed from ${url}"
    fi
    
    rm -rf "$tmp_dir"
}

install_eza() {
    local name="eza"
    
    if command_exists eza; then
        add_skipped "$name" "already installed"
        log_skip "${name} already installed at $(command -v eza)"
        return 0
    fi
    
    log_info "Installing ${name} via binary download..."
    
    local arch
    arch=$(get_arch)
    local arch_suffix="x86_64-unknown-linux-gnu"
    [[ "$arch" == "arm64" ]] && arch_suffix="aarch64-unknown-linux-gnu"
    
    local url="https://github.com/eza-community/eza/releases/latest/download/eza_${arch_suffix}.tar.gz"
    local tmp_dir
    tmp_dir=$(mktemp -d)
    
    if curl -fsSL "$url" -o "${tmp_dir}/eza.tar.gz" 2>>"$LOG_FILE"; then
        if tar -xzf "${tmp_dir}/eza.tar.gz" -C "$tmp_dir" 2>>"$LOG_FILE"; then
            mv "${tmp_dir}/eza" "${LOCAL_BIN}/eza"
            chmod +x "${LOCAL_BIN}/eza"
            add_installed "$name" "${LOCAL_BIN}/eza"
            log_success "${name} installed at ${LOCAL_BIN}/eza"
        else
            add_failed "$name" "tar extraction failed"
            log_error "${name}: tar extraction failed"
        fi
    else
        add_failed "$name" "download failed"
        log_error "${name}: download failed from ${url}"
    fi
    
    rm -rf "$tmp_dir"
}

install_obsidian() {
    local name="obsidian"
    
    # Check if AppImage already exists
    if [[ -x "${APPLICATIONS_DIR}/Obsidian.AppImage" ]]; then
        add_skipped "$name" "already installed"
        log_skip "${name} already installed at ${APPLICATIONS_DIR}/Obsidian.AppImage"
        return 0
    fi
    
    # Also check if installed via other methods
    if command_exists obsidian; then
        add_skipped "$name" "already installed"
        log_skip "${name} already installed at $(command -v obsidian)"
        return 0
    fi
    
    log_info "Installing ${name} via AppImage..."
    
    ensure_applications_dir
    
    # Get latest version from GitHub API
    local version
    version=$(curl -fsSL "https://api.github.com/repos/obsidianmd/obsidian-releases/releases/latest" 2>/dev/null | \
        grep -Po '"tag_name": *"v\K[^"]*')
    
    if [[ -z "$version" ]]; then
        add_failed "$name" "could not determine latest version"
        log_error "${name}: could not determine latest version"
        return 1
    fi
    
    local url="https://github.com/obsidianmd/obsidian-releases/releases/download/v${version}/Obsidian-${version}.AppImage"
    
    if curl -fsSL "$url" -o "${APPLICATIONS_DIR}/Obsidian.AppImage" 2>>"$LOG_FILE"; then
        chmod +x "${APPLICATIONS_DIR}/Obsidian.AppImage"
        add_installed "$name" "${APPLICATIONS_DIR}/Obsidian.AppImage"
        log_success "${name} v${version} installed at ${APPLICATIONS_DIR}/Obsidian.AppImage"
    else
        add_failed "$name" "download failed"
        log_error "${name}: download failed from ${url}"
    fi
}

# ============================================================================
# APT Packages
# ============================================================================

install_apt_package() {
    local name="$1"
    local package="${2:-$1}"
    local binary="${3:-$1}"
    
    if command_exists "$binary"; then
        add_skipped "$name" "already installed"
        log_skip "${name} already installed at $(command -v "$binary")"
        return 0
    fi
    
    log_info "Installing ${name} via apt (package: ${package})..."
    
    if sudo apt install -y "$package" >>"$LOG_FILE" 2>&1; then
        local location
        location=$(command -v "$binary" 2>/dev/null || echo "/usr/bin/${binary}")
        add_installed "$name" "$location (apt)"
        log_success "${name} installed at ${location}"
    else
        add_failed "$name" "apt install failed"
        log_error "${name}: apt install ${package} failed"
    fi
}

install_apt_packages() {
    log_section "APT Packages"
    
    # Update apt cache once
    log_info "Updating apt cache..."
    sudo apt update >>"$LOG_FILE" 2>&1
    
    # bat - binary is named 'batcat' on Ubuntu
    install_apt_package "bat" "bat" "batcat"
    
    # fd - binary is named 'fdfind' on Ubuntu  
    install_apt_package "fd" "fd-find" "fdfind"
    
    # ripgrep
    install_apt_package "ripgrep" "ripgrep" "rg"
    
    # btop
    install_apt_package "btop" "btop" "btop"
    
    # taskwarrior (tw)
    install_apt_package "taskwarrior" "taskwarrior" "task"
    
    # mpv
    install_apt_package "mpv" "mpv" "mpv"
    
    # kdenlive
    install_apt_package "kdenlive" "kdenlive" "kdenlive"
}

# ============================================================================
# APT with External Repositories
# ============================================================================

install_gh() {
    local name="gh"
    
    if command_exists gh; then
        add_skipped "$name" "already installed"
        log_skip "${name} already installed at $(command -v gh)"
        return 0
    fi
    
    log_info "Installing ${name} via GitHub CLI official apt repository..."
    
    # Setup GitHub CLI repository
    (
        type -p wget >/dev/null || (sudo apt update && sudo apt install wget -y)
        sudo mkdir -p -m 755 /etc/apt/keyrings
        out=$(mktemp)
        wget -nv -O"$out" https://cli.github.com/packages/githubcli-archive-keyring.gpg
        cat "$out" | sudo tee /etc/apt/keyrings/githubcli-archive-keyring.gpg >/dev/null
        sudo chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg
        echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | \
            sudo tee /etc/apt/sources.list.d/github-cli.list >/dev/null
        sudo apt update
        sudo apt install gh -y
    ) >>"$LOG_FILE" 2>&1
    
    if command_exists gh; then
        add_installed "$name" "$(command -v gh) (apt/official repo)"
        log_success "${name} installed at $(command -v gh)"
    else
        add_failed "$name" "repository setup or install failed"
        log_error "${name}: repository setup or install failed"
    fi
}

install_obs_studio() {
    local name="obs-studio"
    
    if command_exists obs; then
        add_skipped "$name" "already installed"
        log_skip "${name} already installed at $(command -v obs)"
        return 0
    fi
    
    log_info "Installing ${name} via PPA..."
    
    (
        sudo add-apt-repository -y ppa:obsproject/obs-studio
        sudo apt update
        sudo apt install -y obs-studio
    ) >>"$LOG_FILE" 2>&1
    
    if command_exists obs; then
        add_installed "$name" "$(command -v obs) (apt/ppa)"
        log_success "${name} installed at $(command -v obs)"
    else
        add_failed "$name" "PPA setup or install failed"
        log_error "${name}: PPA setup or install failed"
    fi
}

# ============================================================================
# Main Installation Flow
# ============================================================================

print_summary() {
    log_section "Installation Summary"
    
    echo ""
    echo "INSTALLED (${#INSTALLED_TOOLS[@]}):"
    echo "-----------------------------------"
    for item in "${INSTALLED_TOOLS[@]}"; do
        local tool="${item%%:*}"
        local location="${item#*:}"
        printf "  %-15s -> %s\n" "$tool" "$location"
    done
    
    if [[ ${#SKIPPED_TOOLS[@]} -gt 0 ]]; then
        echo ""
        echo "SKIPPED (${#SKIPPED_TOOLS[@]}):"
        echo "-----------------------------------"
        for item in "${SKIPPED_TOOLS[@]}"; do
            local tool="${item%%:*}"
            local reason="${item#*:}"
            printf "  %-15s (%s)\n" "$tool" "$reason"
        done
    fi
    
    if [[ ${#FAILED_TOOLS[@]} -gt 0 ]]; then
        echo ""
        echo "FAILED (${#FAILED_TOOLS[@]}):"
        echo "-----------------------------------"
        for item in "${FAILED_TOOLS[@]}"; do
            local tool="${item%%:*}"
            local reason="${item#*:}"
            printf "  %-15s - %s\n" "$tool" "$reason"
        done
    fi
    
    echo ""
    echo "Log file: ${LOG_FILE}"
    echo ""
}

main() {
    # Clear/initialize log file
    echo "Installation started at $(date)" > "$LOG_FILE"
    echo ""
    
    log_section "Starting Installation"
    log_info "Log file: ${LOG_FILE}"
    log_info "Local bin directory: ${LOCAL_BIN}"
    log_info "Applications directory: ${APPLICATIONS_DIR}"
    
    # Setup
    ensure_local_bin
    check_path
    
    # Prerequisites
    install_prerequisites
    
    # Shell installer tools
    log_section "Shell Installer Tools"
    install_fzf
    install_zoxide
    install_lazydocker
    install_opencode
    install_beads
    
    # Binary download tools
    log_section "Binary Download Tools"
    install_lazygit
    install_sesh
    install_eza
    install_obsidian
    
    # APT packages
    install_apt_packages
    
    # External APT repositories
    log_section "External APT Repositories"
    install_gh
    install_obs_studio
    
    # Summary
    print_summary
    
    # Return appropriate exit code
    if [[ ${#FAILED_TOOLS[@]} -gt 0 ]]; then
        exit 1
    fi
    exit 0
}

# Run main function
main "$@"
