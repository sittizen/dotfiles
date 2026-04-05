# enable a simple KV v1 backend at path "leona"
vault secrets enable -path=leona kv

# store one secret entry containing my pc confs
vault kv put leona/config \
  hostname="leona" \
  git_name="Simone Cittadini" \
  git_email="simone.cittadini@protonmail.com"

