#!/usr/bin/env bash
# Executa um comando avulso com a imagem e os segredos do ambiente (o banco fica em rede privada).
#
#   infra/scripts/ecs-run.sh <staging|production> <comando...>
#
# Exemplos:
#   MASTER_EMAIL=voce@empresa.com.br MASTER_PASSWORD='senha-forte' infra/scripts/ecs-run.sh production node server/scripts/seed.js
#   NEW_PASSWORD='nova-senha' infra/scripts/ecs-run.sh production node server/scripts/set-password.js voce@empresa.com.br
#
# As variáveis MASTER_EMAIL, MASTER_PASSWORD, NEW_PASSWORD e DEMO_PASSWORD, se definidas, são repassadas
# ao container. Elas ficam visíveis nos detalhes da tarefa no console da AWS: troque a senha no
# primeiro acesso ao sistema.
set -euo pipefail

env_name="${1:?Informe o ambiente: staging ou production}"
shift
[ $# -gt 0 ] || { echo "Informe o comando a executar" >&2; exit 1; }

dir="$(cd "$(dirname "$0")/../envs/$env_name" && pwd)"
out() { terraform -chdir="$dir" output -raw "$1"; }

cluster="$(out ecs_cluster)"
service="$(out ecs_service)"
container="$(out container_name)"
subnets="$(terraform -chdir="$dir" output -json private_subnet_ids | tr -d '[]" \n')"
sg="$(out app_security_group_id)"
# Mesma versão (imagem e configuração) que está no ar
task_def="$(aws ecs describe-services --cluster "$cluster" --services "$service" --query 'services[0].taskDefinition' --output text)"

overrides="$(python3 - "$container" "$@" <<'PY'
import json, os, sys
container, cmd = sys.argv[1], sys.argv[2:]
env = [{"name": k, "value": os.environ[k]} for k in ("MASTER_EMAIL", "MASTER_PASSWORD", "NEW_PASSWORD", "DEMO_PASSWORD") if os.environ.get(k)]
env.append({"name": "RUN_MIGRATIONS", "value": "true"})
print(json.dumps({"containerOverrides": [{"name": container, "command": cmd, "environment": env}]}))
PY
)"

task_arn="$(aws ecs run-task --cluster "$cluster" --task-definition "$task_def" --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[$subnets],securityGroups=[$sg],assignPublicIp=DISABLED}" \
  --overrides "$overrides" --query 'tasks[0].taskArn' --output text)"
echo "Tarefa iniciada: $task_arn"
echo "Aguardando terminar..."
aws ecs wait tasks-stopped --cluster "$cluster" --tasks "$task_arn"

code="$(aws ecs describe-tasks --cluster "$cluster" --tasks "$task_arn" --query 'tasks[0].containers[0].exitCode' --output text)"
log_group="$(out log_group)"
echo "--- Saída (CloudWatch Logs: $log_group) ---"
aws logs get-log-events --log-group-name "$log_group" --log-stream-name "app/$container/${task_arn##*/}" \
  --query 'events[].message' --output text 2>/dev/null | tr '\t' '\n' || echo "(sem logs)"
echo "Código de saída: $code"
[ "$code" = "0" ]
