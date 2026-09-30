# Initialization code that may require console input (password prompts, [y/n]
# confirmations, etc.) must go above this block; everything else may go below.
if [[ -r "${XDG_CACHE_HOME:-$HOME/.cache}/p10k-instant-prompt-${(%):-%n}.zsh" ]]; then
  source "${XDG_CACHE_HOME:-$HOME/.cache}/p10k-instant-prompt-${(%):-%n}.zsh"
fi

ZINIT_HOME="${XDG_DATA_HOME:-${HOME}/.local/share}/zinit/zinit.git"

if [ ! -d "$ZINIT_HOME" ]; then
  echo "cloning zinit"
  mkdir -p "$(dirname $ZINIT_HOME)"
  git clone https://github.com/zdharma-continuum/zinit.git "$ZINIT_HOME"
fi
source "${ZINIT_HOME}/zinit.zsh"

zinit ice depth=1; zinit light romkatv/powerlevel10k
zinit light zsh-users/zsh-syntax-highlighting
zinit light zsh-users/zsh-completions
zinit light zsh-users/zsh-autosuggestions
zinit light Aloxaf/fzf-tab
# Git completions (load before compinit)
zinit ice wait lucid as"completion" blockf
zinit snippet https://github.com/git/git/raw/master/contrib/completion/git-completion.zsh
fpath=(~/.szh/completions $fpath)

autoload -U compinit && compinit
autoload -U ass-zsh-hook

# Let `git worktree` subcommands that take a worktree path (remove/lock/
# unlock/move) complete real directories, including `~` expansion, like
# `git checkout` does.  The stock zsh completion only offers registered
# worktree names as absolute paths, so a `~/...` prefix can never match them.
# The guard in _git (`(( $+functions[_git-worktree] )) || ...`) keeps this
# definition when the git completion file is loaded on the first `git <TAB>`.
_git-worktree() {
  local curcontext="$curcontext" state line ret=1
  declare -A opt_args

  _arguments -C \
    ': :->command' \
    '*::: := ->option-or-argument' && ret=0

  case $state in
    (command)
      local -a commands=(
        add:'create a new working tree'
        prune:'prune working tree information'
        list:'list details of each worktree'
        lock:'prevent a working tree from being pruned'
        move:'move a working tree to a new location'
        remove:'remove a working tree'
        unlock:'allow working tree to be pruned, moved or deleted'
      )
      _describe -t commands command commands && ret=0
      ;;
    (option-or-argument)
      curcontext=${curcontext%:*}-$line[1]:
      case $line[1] in
        (add)
          local -a args
          if (( $words[(I)--detach] )); then
            args=( ':branch:__git_branch_names' )
          else
            args=( ':commit:__git_commits' )
          fi
          _arguments -S $endopt \
            '(-f --force)'{-f,--force}'[checkout branch even if already checked out in another worktree]' \
            '(-B --detach)-b+[create a new branch]: :__git_branch_names' \
            '(-b --detach)-B+[create or reset a branch]: :__git_branch_names' \
            '(-b -B)--detach[detach HEAD at named commit]' \
            '--no-checkout[suppress file checkout in new worktree]' \
            '--lock[keep working tree locked after creation]' \
            ':path:_directories' $args && ret=0
          ;;
        (prune)
          _arguments -S $endopt \
            '(-n --dry-run)'{-n,--dry-run}"[don't remove, show only]" \
            '(-v --verbose)'{-v,--verbose}'[report pruned objects]' \
            '--expire[expire objects older than specified time]:time' && ret=0
          ;;
        (list)
          _arguments -S $endopt '--porcelain[machine-readable output]' && ret=0
          ;;
        (lock)
          _arguments -C -S $endopt \
            '--reason=[specify reason for locking]:reason' \
            ':worktree:_path_files -/' && ret=0
          ;;
        (move)
          _arguments -C -S $endopt \
            ':worktree:_path_files -/' \
            ':location:_directories' && ret=0
          ;;
        (remove)
          _arguments -C -S $endopt \
            '--force[remove working trees that are not clean or that have submodules]' \
            ':worktree:_path_files -/' && ret=0
          ;;
        (unlock)
          _arguments -C -S $endopt ':worktree:_path_files -/' && ret=0
          ;;
      esac
      ;;
  esac
  return ret
}

# To customize prompt, run `p10k configure` or edit ~/.p10k.zsh.
[[ ! -f ~/.p10k.zsh ]] || source ~/.p10k.zsh

bindkey -v

HISTSIZE=800
HISTFILE=~/.zsh_history
SAVEHIST=$HISTSIZE
HISTDUP=erase
setopt appendhistory
# setopt sharehistory
setopt hist_ignore_space
setopt hist_ignore_all_dups
setopt hist_save_no_dups
setopt hist_ignore_dups
setopt hist_find_no_dups

zstyle ':completion:*' matcher-list 'm:{a-z}={A-Za-z}'
zstyle ':completion:*:descriptions' format '[%d]'
zstyle ':completion:*:git-checkout:*' sort false
zstyle ':completion:*' list-colors "${(s.:.)LS_COLORS}" 
zstyle ':completion:*' menu no
zstyle ':fzf-tab:*' fzf-bindings 'tab:accept'
zstyle ':fzf-tab:*' switch-group '<' '>'
zstyle ':fzf-tab:complete:cd:*' fzf-preview 'ls --color $realpath'
zstyle ':fzf-tab:complete:__zoxide_z:*' fzf-preview 'ls --color $realpath'

# env vals
export SHELL=/bin/zsh
export EDITOR=~/.local/share/mise/shims/nvim
export OPENCODE_EXPERIMENTAL_LSP_TOOL=true
export CHROME_DEVEL_SANDBOX=/usr/local/sbin/chrome_sandbox

if [[ "$(hostname)" == "leona" ]]; then
    export VAULT_ADDR=http://127.0.0.1:8200
    export VAULT_SKIP_VERIFY=true
else
    export VAULT_ADDR=https://vault.pycc.gmolapps.lcl
    export ARGO_SERVER_URL=https://argo.pycc.gmolapps.lcl
fi

# aliases
alias l='exa -1 -l --classify --icons --color-scale --group-directories-first --no-permissions --no-user --no-time'
alias lt='exa -1 -l --classify --icons --color-scale --tree --no-permissions --no-user'
alias la='exa -1 -l --classify --icons --color-scale --all'
alias lta='exa -1 -l --classify --icons --color-scale --all --tree --no-permissions --no-user'
alias cat="bat -p"
alias vim='nvim'
alias vi='nvim'
alias n='nvim .'
alias c='z'
alias vv="vault token renew $VAULT_TOKEN"
#alias vu='date >> ~/workspace/testing/shitty_vpn/shitty_vpn.log && nmcli connection up "gate_v6"'
alias vd="nmcli connection down 'gate_v6'"
alias git-prune="git branch --merged | egrep -v '(^\*|master|dev|production|test)' | xargs git branch -d" 
alias tma="timew start"
alias tmo="timew stop"
alias tms="timew summary"
alias oc="opencode"
alias oca="opencode attach http://locahost:9998"
alias am="alsamixer"
alias lit="/mnt/media/data/home/sc/node_modules/.bin/lit"
alias zt="zathura"
alias ce="clear"

# functions
v() { # retrieves vault token
  if [[ "$(hostname)" == "leona" ]]; then
    export VAULT_TOKEN=$(cat ~/workspace/.uk)
  else
    export VAULT_TOKEN=$(vault login -method=oidc -token-only 2>/dev/null)
  fi
}

if [[ -z "$VAULT_TOKEN" ]] && [[ -o interactive ]]; then
  v
fi

# Split DNS keeps intranet names off Fritz DNS; public DNS must still resolve
# the VPN endpoint. Refresh its IP, changing only vpn.data's remote key so
# NetworkManager's auth and certificate settings remain intact.
vu() {
  date >> ~/workspace/testing/shitty_vpn/shitty_vpn.log

  nmcli connection modify gate_v6 \
    ipv4.dns-priority 50 \
    ipv4.dns "" \
    ipv4.dns-search "~gruppomol.lcl" || return
  nmcli connection modify gate_v6 \
    +ipv4.dns-search "~pycc.gmolapps.lcl" || return
  nmcli connection modify gate_v6 \
    +ipv4.dns-search "~aiml.gmolapps.lcl" || return

  local ip
  ip=$(getent ahostsv4 gate.gruppomol.it | awk 'NR == 1 {print $1}')
  if [[ -z $ip ]]; then
    print -u2 'vu: cannot resolve gate.gruppomol.it; not updating endpoint or bringing up VPN'
    return 1
  fi

  nmcli connection modify gate_v6 -vpn.data remote || return
  nmcli connection modify gate_v6 +vpn.data "remote=$ip:443" || return
  nmcli connection up gate_v6
}

pp() { # purge unused packages
  dpkg -l | awk '/^rc/ {print $2}' | xargs -r sudo dpkg --purge
}

rs() { # retrieves auths from vault
  if [[ "$(hostname)" == "leona" ]]; then
    export CONTEXT7_API_KEY=$(vault kv get -format=json kv/leona/zsh 2>/dev/null | jq -r .data.data.ctx7)

  else
    export GITLAB_URL=https://gitlab.gruppomol.lcl/
    PYPI_VALS=(`vault read -format json kv/prd/gitlab | jq -r '.data.pypi_install_user, .data.pypi_install_secret'`)
    export UV_INDEX_PYPIMOL_GITLAB_USERNAME=${PYPI_VALS[1]}
    export UV_INDEX_PYPIMOL_USERNAME=${PYPI_VALS[1]}
    export UV_INDEX_PYPIMOL_GITLAB_PASSWORD=${PYPI_VALS[2]}
    export UV_INDEX_PYPIMOL_PASSWORD=${PYPI_VALS[2]}

    ACCTS_VALS=(`vault read -format=json kv/loc/simone.cittadini/zsh | jq -r '.data.ctx7, .data.glam'`)
    export CONTEXT7_API_KEY=${ACCTS_VALS[1]}
    export GITLAB_TOKEN=${ACCTS_VALS[2]}
  fi
}

..() {
  cd ..
}

...() {
  cd .. && cd ..
}

....() {
  cd .. && cd .. && cd ..
}

eval "$(mise activate zsh)"
eval "$(fzf --zsh)"
eval "$(zoxide init zsh)"
[ -f ~/.herdr_completion ] && source ~/.herdr_completion 2>/dev/null

# pytc in_container script (added by ./run.sh)
export PATH="$HOME/.local/bin:$PATH"

# opencode
export PATH=/home/simone.cittadini@gruppomol.lcl/.opencode/bin:$PATH
