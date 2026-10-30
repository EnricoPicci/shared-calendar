#!/usr/bin/env bash
# Creates the cost guard-rail of a deployed stack (architecture 9.2): a monthly COST budget
# <stack>-monthly of 1 USD that e-mails the stack's AlertEmail when the actual or the forecast
# spend of the account exceeds it. Not part of template.yaml: CloudFormation does not offer
# AWS::Budgets::Budget in every region (not in eu-north-1).
#
#   npm run budget <stack-name>                creates the budget if it does not exist yet
#   npm run budget <stack-name> -- --dry-run   only shows what it would create
#
# Idempotent: an existing budget of that name is reported and left unchanged. Budgets are
# account-wide and live in us-east-1 whatever the stack's region. There is no local target:
# no emulator offers Budgets.
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/target.sh

[[ $# -ge 1 && $# -le 2 && "$1" != local && "$1" != -* ]] ||
  die "usage: npm run budget <stack-name> [-- --dry-run]"
dry_run=false
if [[ $# -eq 2 ]]; then
  [[ "$2" == --dry-run ]] || die "usage: npm run budget <stack-name> [-- --dry-run]"
  dry_run=true
fi

stack=$1
load_target "$stack"
budget_name="$stack-monthly"

# Read-only: the e-mail address given at deploy time, and the account the login points at.
# shellcheck disable=SC2016 # the backticks are JMESPath string literals, not shell
alert_email=$(aws cloudformation describe-stacks --stack-name "$stack" --output text \
  --query 'Stacks[0].Parameters[?ParameterKey==`AlertEmail`].ParameterValue | [0]') ||
  die "cannot read the AlertEmail parameter of stack $stack."
[[ -n "$alert_email" && "$alert_email" != None ]] || die "stack $stack has no AlertEmail parameter."
account=$(aws sts get-caller-identity --query Account --output text) || die "cannot read the AWS account (AWS login?)."

budgets() { aws budgets --region us-east-1 "$@"; }

if answer=$(budgets describe-budget --account-id "$account" --budget-name "$budget_name" \
  --query 'Budget.[BudgetLimit.Amount, BudgetLimit.Unit, TimeUnit]' --output text 2>&1); then
  echo "Budget $budget_name already exists in account $account ($answer). Nothing was changed."
  exit 0
fi
[[ "$answer" == *NotFoundException* ]] || die "cannot read budget $budget_name: $answer"

# The request, built with node so that no character of the address can break the JSON.
budget_json=$(node -e 'console.log(JSON.stringify({ BudgetName: process.argv[1], BudgetType: "COST",
  TimeUnit: "MONTHLY", BudgetLimit: { Amount: "1", Unit: "USD" } }))' "$budget_name")
notifications_json=$(node -e 'console.log(JSON.stringify(["ACTUAL", "FORECASTED"].map((type) => ({
  Notification: { NotificationType: type, ComparisonOperator: "GREATER_THAN", Threshold: 100,
    ThresholdType: "PERCENTAGE" },
  Subscribers: [{ SubscriptionType: "EMAIL", Address: process.argv[1] }] }))))' "$alert_email")

echo "Budget $budget_name: 1 USD per month for account $account; e-mail to $alert_email when the"
echo "actual or the forecast spend exceeds 100 %."
if $dry_run; then
  echo "Dry run: nothing was created. Run without --dry-run to create it."
  exit 0
fi
budgets create-budget --account-id "$account" --budget "$budget_json" \
  --notifications-with-subscribers "$notifications_json" ||
  die "AWS refused (message above). The budget was not created."
echo "Created. Check it in the console: Billing and Cost Management, Budgets."
