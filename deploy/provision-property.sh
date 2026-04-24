#!/bin/bash
# ============================================================================
# Provision a New Property EC2 Instance
# Uses AWS CLI v2.  Run from your local machine (needs configured credentials).
#
# Usage:
#   ./provision-property.sh \
#       --property-id 3 \
#       --slug        globex \
#       --domain      globex.optima.sclera.com \
#       --name        "Globex Corporation"
#
# Prerequisites:
#   aws configure   (or set AWS_PROFILE / AWS_REGION)
#   jq installed    (brew install jq / apt install jq)
#
# What it does:
#   1. Creates an EC2 t3.small (Ubuntu 22.04)
#   2. Attaches a 20 GB EBS volume (gp3) for the database
#   3. Allocates an Elastic IP
#   4. Creates a Route53 A record: SLUG.DOMAIN → Elastic IP
#   5. Injects ec2-setup.sh as user-data (auto-runs at first boot)
#   6. Prints SSH command and dashboard URL
# ============================================================================

set -euo pipefail

# ── Parse args ────────────────────────────────────────────────────────────────
PROPERTY_ID=""
PROPERTY_SLUG=""
PROPERTY_DOMAIN_FULL=""
PROPERTY_NAME=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --property-id) PROPERTY_ID="$2"; shift 2 ;;
        --slug)        PROPERTY_SLUG="$2"; shift 2 ;;
        --domain)      PROPERTY_DOMAIN_FULL="$2"; shift 2 ;;
        --name)        PROPERTY_NAME="$2"; shift 2 ;;
        *) echo "Unknown arg: $1"; exit 1 ;;
    esac
done

# ── Config (edit these for your AWS account) ──────────────────────────────────
AWS_REGION="${AWS_REGION:-us-east-1}"
AMI_ID="${AMI_ID:-ami-0c7217cdde317cfec}"    # Ubuntu 22.04 LTS us-east-1 (update per region)
INSTANCE_TYPE="${INSTANCE_TYPE:-t3.small}"    # 2 vCPU, 2 GB RAM — fine for 10K assets
KEY_NAME="${KEY_NAME:-optima-ec2-key}"        # Your EC2 key pair name
SECURITY_GROUP="${SECURITY_GROUP:-}"          # Created below if empty
VPC_ID="${VPC_ID:-}"                          # Default VPC if empty
HOSTED_ZONE_ID="${HOSTED_ZONE_ID:-}"          # Route53 hosted zone for your domain
GIT_REPO="${GIT_REPO:-https://github.com/YOUR_ORG/optima.git}"
BASE_DOMAIN="${BASE_DOMAIN:-optima.sclera.com}"

if [[ -z "$PROPERTY_ID" || -z "$PROPERTY_SLUG" || -z "$PROPERTY_DOMAIN_FULL" ]]; then
    echo "Usage: $0 --property-id N --slug SLUG --domain SLUG.optima.sclera.com [--name 'Name']"
    exit 1
fi
PROPERTY_NAME="${PROPERTY_NAME:-$PROPERTY_SLUG}"
JWT_SECRET=$(openssl rand -hex 32)

echo "============================================="
echo "  Provisioning Property EC2"
echo "  ID     : ${PROPERTY_ID}"
echo "  Slug   : ${PROPERTY_SLUG}"
echo "  Domain : ${PROPERTY_DOMAIN_FULL}"
echo "  Region : ${AWS_REGION}"
echo "  Type   : ${INSTANCE_TYPE}"
echo "============================================="

# ── Security group (create once, reuse) ──────────────────────────────────────
if [[ -z "$SECURITY_GROUP" ]]; then
    echo "[SG] Creating security group..."
    SECURITY_GROUP=$(aws ec2 create-security-group \
        --group-name "optima-${PROPERTY_SLUG}-sg" \
        --description "Optima property ${PROPERTY_SLUG}" \
        --region "${AWS_REGION}" \
        --query 'GroupId' --output text 2>/dev/null || \
        aws ec2 describe-security-groups \
            --filters "Name=group-name,Values=optima-${PROPERTY_SLUG}-sg" \
            --region "${AWS_REGION}" \
            --query 'SecurityGroups[0].GroupId' --output text)

    aws ec2 authorize-security-group-ingress \
        --group-id "${SECURITY_GROUP}" \
        --ip-permissions \
        'IpProtocol=tcp,FromPort=22,ToPort=22,IpRanges=[{CidrIp=0.0.0.0/0,Description=SSH}]' \
        'IpProtocol=tcp,FromPort=80,ToPort=80,IpRanges=[{CidrIp=0.0.0.0/0,Description=HTTP}]' \
        'IpProtocol=tcp,FromPort=443,ToPort=443,IpRanges=[{CidrIp=0.0.0.0/0,Description=HTTPS}]' \
        --region "${AWS_REGION}" 2>/dev/null || true
fi
echo "  Security Group: ${SECURITY_GROUP}"

# ── User-data (runs ec2-setup.sh at first boot) ───────────────────────────────
USERDATA=$(cat <<USERDATA_EOF
#!/bin/bash
set -euo pipefail
export PROPERTY_ID="${PROPERTY_ID}"
export PROPERTY_SLUG="${PROPERTY_SLUG}"
export PROPERTY_DOMAIN="${PROPERTY_DOMAIN_FULL}"
export GIT_REPO="${GIT_REPO}"
export GIT_BRANCH="main"
export JWT_SECRET="${JWT_SECRET}"

# Download and run setup script
curl -fsSL "https://raw.githubusercontent.com/YOUR_ORG/optima/main/deploy/ec2-setup.sh" | bash \
    >> /var/log/optima-setup.log 2>&1
USERDATA_EOF
)

# ── Launch EC2 instance ───────────────────────────────────────────────────────
echo "[EC2] Launching instance..."
INSTANCE_ID=$(aws ec2 run-instances \
    --image-id "${AMI_ID}" \
    --instance-type "${INSTANCE_TYPE}" \
    --key-name "${KEY_NAME}" \
    --security-group-ids "${SECURITY_GROUP}" \
    --user-data "${USERDATA}" \
    --block-device-mappings '[{"DeviceName":"/dev/sda1","Ebs":{"VolumeSize":20,"VolumeType":"gp3","DeleteOnTermination":true}}]' \
    --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=optima-${PROPERTY_SLUG}},{Key=optima-property,Value=${PROPERTY_SLUG}},{Key=optima-property-id,Value=${PROPERTY_ID}}]" \
    --metadata-options 'HttpTokens=required' \
    --region "${AWS_REGION}" \
    --query 'Instances[0].InstanceId' \
    --output text)
echo "  Instance: ${INSTANCE_ID}"

# ── Attach EBS data volume ────────────────────────────────────────────────────
echo "[EBS] Creating 20 GB gp3 data volume..."
VOLUME_ID=$(aws ec2 create-volume \
    --size 20 \
    --volume-type gp3 \
    --availability-zone "$(aws ec2 describe-instances --instance-ids "${INSTANCE_ID}" --region "${AWS_REGION}" --query 'Reservations[0].Instances[0].Placement.AvailabilityZone' --output text)" \
    --encrypted \
    --tag-specifications "ResourceType=volume,Tags=[{Key=Name,Value=optima-${PROPERTY_SLUG}-data},{Key=optima-property,Value=${PROPERTY_SLUG}}]" \
    --region "${AWS_REGION}" \
    --query 'VolumeId' --output text)

echo "  Volume: ${VOLUME_ID} — waiting for available..."
aws ec2 wait volume-available --volume-ids "${VOLUME_ID}" --region "${AWS_REGION}"

echo "  Attaching volume as /dev/xvdb..."
aws ec2 wait instance-running --instance-ids "${INSTANCE_ID}" --region "${AWS_REGION}"
aws ec2 attach-volume \
    --volume-id "${VOLUME_ID}" \
    --instance-id "${INSTANCE_ID}" \
    --device /dev/xvdb \
    --region "${AWS_REGION}" > /dev/null

# ── Elastic IP ────────────────────────────────────────────────────────────────
echo "[EIP] Allocating Elastic IP..."
ALLOCATION_ID=$(aws ec2 allocate-address \
    --domain vpc \
    --tag-specifications "ResourceType=elastic-ip,Tags=[{Key=Name,Value=optima-${PROPERTY_SLUG}-eip}]" \
    --region "${AWS_REGION}" \
    --query 'AllocationId' --output text)

PUBLIC_IP=$(aws ec2 describe-addresses \
    --allocation-ids "${ALLOCATION_ID}" \
    --region "${AWS_REGION}" \
    --query 'Addresses[0].PublicIp' --output text)

aws ec2 associate-address \
    --instance-id "${INSTANCE_ID}" \
    --allocation-id "${ALLOCATION_ID}" \
    --region "${AWS_REGION}" > /dev/null
echo "  Elastic IP: ${PUBLIC_IP}"

# ── Route53 DNS record ────────────────────────────────────────────────────────
if [[ -n "$HOSTED_ZONE_ID" ]]; then
    echo "[DNS] Creating Route53 A record: ${PROPERTY_DOMAIN_FULL} → ${PUBLIC_IP}..."
    aws route53 change-resource-record-sets \
        --hosted-zone-id "${HOSTED_ZONE_ID}" \
        --change-batch "{
            \"Changes\": [{
                \"Action\": \"UPSERT\",
                \"ResourceRecordSet\": {
                    \"Name\": \"${PROPERTY_DOMAIN_FULL}\",
                    \"Type\": \"A\",
                    \"TTL\": 300,
                    \"ResourceRecords\": [{\"Value\": \"${PUBLIC_IP}\"}]
                }
            }]
        }" > /dev/null
    echo "  DNS record created (TTL 300s)"
else
    echo "  [DNS] Skipped — set HOSTED_ZONE_ID to auto-create DNS"
fi

# ── Save property record file ─────────────────────────────────────────────────
RECORD_FILE="./provisioned-${PROPERTY_SLUG}.json"
cat > "${RECORD_FILE}" <<EOF
{
  "property_id":   ${PROPERTY_ID},
  "property_slug": "${PROPERTY_SLUG}",
  "property_name": "${PROPERTY_NAME}",
  "domain":        "${PROPERTY_DOMAIN_FULL}",
  "instance_id":   "${INSTANCE_ID}",
  "volume_id":     "${VOLUME_ID}",
  "allocation_id": "${ALLOCATION_ID}",
  "public_ip":     "${PUBLIC_IP}",
  "region":        "${AWS_REGION}",
  "instance_type": "${INSTANCE_TYPE}",
  "provisioned_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
echo "  Record saved: ${RECORD_FILE}"

echo ""
echo "============================================="
echo "  ✅  Property EC2 provisioned!"
echo ""
echo "  Public IP  : ${PUBLIC_IP}"
echo "  Instance   : ${INSTANCE_ID}"
echo "  Domain     : https://${PROPERTY_DOMAIN_FULL}"
echo ""
echo "  SSH Access:"
echo "    ssh -i ~/.ssh/${KEY_NAME}.pem ubuntu@${PUBLIC_IP}"
echo ""
echo "  Setup log (after 3-5 min):"
echo "    ssh ubuntu@${PUBLIC_IP} 'sudo tail -f /var/log/optima-setup.log'"
echo ""
echo "  Health check (after setup):"
echo "    curl https://${PROPERTY_DOMAIN_FULL}/health"
echo ""
echo "  Seed 10,000 assets:"
echo "    ssh ubuntu@${PUBLIC_IP} 'node /opt/optima/optima/backend/seed_mass.js ${PROPERTY_ID} 10000'"
echo "============================================="
