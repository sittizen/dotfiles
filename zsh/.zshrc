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
zstyle ':completion:*' list-colors "${(s.:.)LS_COLORS}" 
zstyle ':completion:*' menu no
zstyle ':fzf-tab:complete:cd:*' fzf-preview 'ls --color $realpath'
zstyle ':fzf-tab:complete:__zoxide_z:*' fzf-preview 'ls --color $realpath'

alias l='exa -1 -l --classify --icons --color-scale'
alias lt='exa -1 -l --classify --icons --color-scale --tree'
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

export VAULT_ADDR=https://vault.pycc.gmolapps.lcl
v() { export VAULT_TOKEN=$(vault login -method=oidc -token-only 2>/dev/null) }

..() {
  cd ..
}

eval "$(fzf --zsh)"
eval "$(zoxide init zsh)"

# fuzzy finder
[ -f ~/.fzf.zsh ] && source ~/.fzf.zsh

# sesh 
fpath=(~/.szh/completions $fpath)

# opencode
export PATH=/home/simone.cittadini@gruppomol.lcl/.opencode/bin:$PATH
