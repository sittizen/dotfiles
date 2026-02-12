# Enable Powerlevel10k instant prompt. Should stay close to the top of ~/.zshrc.
# Initialization code that may require console input (password prompts, [y/n]
# confirmations, etc.) must go above this block; everything else may go below.
if [[ -r "${XDG_CACHE_HOME:-$HOME/.cache}/p10k-instant-prompt-${(%):-%n}.zsh" ]]; then
  source "${XDG_CACHE_HOME:-$HOME/.cache}/p10k-instant-prompt-${(%):-%n}.zsh"
fi

ZINIT_HOME="${XDG_DATA_HOME:-${HOME}/.local/share}/zinit/zinit.git"

if [ ! -d "$ZINIT_HOME" ]; then
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

# To customize prompt, run `p10k configure` or edit ~/.p10k.zsh.
[[ ! -f ~/.p10k.zsh ]] || source ~/.p10k.zsh

bindkey -v

HISTSIZE=2000
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

alias l='exa -1 -l --classify --icons --color-scale --group-directories-first --no-permissions --no-user --no-time'
alias lt='exa -1 -l --classify --icons --color-scale --tree --no-permissions --no-user'
alias la='exa -1 -l --classify --icons --color-scale --all'
alias cat="batcat -p"
alias vim='nvim'
alias vi='nvim'
alias n='nvim .'
alias y='yazi'
alias c='z'
alias vv="vault token renew $VAULT_TOKEN"
alias vu="nmcli connection up 'gate_v6'"
alias vd="nmcli connection down 'gate_v6'"
alias git-prune="git branch --merged | egrep -v '(^\*|master|dev|production|test)' | xargs git branch -d" 
alias tma="timew start"
alias tmo="timew stop"
alias tms="timew summary"
alias oc="opencode ."
alias rt="ralph-tui"

export CHROME_DEVEL_SANDBOX=/usr/local/sbin/chrome_sandbox
export OPENCODE_EXPERIMENTAL_LSP_TOOL=true
export EDITOR=nvim

# vault
v() {
  if [[ "$(hostname)" == "leona" ]]; then
    export VAULT_ADDR=https://127.0.0.1:8200
    export VAULT_SKIP_VERIFY=true
    export VAULT_TOKEN=$(sed -n '2p' ~/workspace/.uk)
  else
    export VAULT_ADDR=https://vault.pycc.gmolapps.lcl
    export VAULT_TOKEN=$(vault login -method=oidc -token-only 2>/dev/null)
  fi
}


gms() {
  if [[ "$(hostname)" == "leona" ]]; then
    export CONTEXT7_API_KEY=$(vault kv get -format=json kv/leona/zsh 2>/dev/null | jq -r .data.data.ctx7)
  else
    PYPI_VALS=(`vault read -format json kv/prd/gitlab | jq -r '.data.pypi_install_user, .data.pypi_install_secret'`)
    export UV_INDEX_PYPIMOL_GITLAB_USERNAME=${PYPI_VALS[1]}
    export UV_INDEX_PYPIMOL_GITLAB_PASSWORD=${PYPI_VALS[2]}
    export CONTEXT7_API_KEY=$(vault read -format=json kv/loc/simone.cittadini/zsh 2>/dev/null | jq -r .data.ctx7)
    export GITLAB_TOKEN=$(vault read -format=json kv/loc/simone.cittadini/zsh 2>/dev/null | jq -r .data.glam)
    export GITLAB_URL=https://gitlab.gruppomol.lcl/
    export GITLAB_PROJECTS=231,239
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

# fuzzy finder
eval "$(fzf --zsh)"
eval "$(zoxide init zsh)"


# opencode
export PATH=/home/simone.cittadini@gruppomol.lcl/.opencode/bin:$PATH
