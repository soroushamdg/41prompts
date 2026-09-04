#!/usr/bin/env bash
# Idempotent bootstrap for a fresh Ubuntu 24.04 Lightsail instance. Run once, from Soroush's
# terminal, over SSH: `ssh -i <key> ubuntu@<ip> 'bash -s' < infra/bootstrap.sh`. Safe to
# re-run — every step checks whether it already happened before changing anything.
#
# Hardens the existing `ubuntu` user (key-only SSH, sudo) rather than creating a separate
# `deploy` user: one less user/key/permission set to get wrong, and Lightsail's default
# Ubuntu image is already provisioned around `ubuntu` having sudo and the launch SSH key.
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "run this as root (e.g. via 'sudo bash -s' or as root over ssh)" >&2
  exit 1
fi

echo "== apt update/upgrade =="
apt-get update -y
apt-get upgrade -y

echo "== unattended-upgrades =="
if ! dpkg -s unattended-upgrades >/dev/null 2>&1; then
  apt-get install -y unattended-upgrades
fi
dpkg-reconfigure -f noninteractive unattended-upgrades

echo "== harden ubuntu user: key-only SSH, no root login =="
sshd_hardening_file=/etc/ssh/sshd_config.d/99-41prompts-hardening.conf
cat > "$sshd_hardening_file" <<'EOF'
PasswordAuthentication no
PermitRootLogin no
KbdInteractiveAuthentication no
EOF
if command -v sshd >/dev/null 2>&1; then
  mkdir -p /run/sshd
  sshd -t
fi
systemctl reload ssh

echo "== ufw: 22/80/443 only =="
if ! command -v ufw >/dev/null 2>&1; then
  apt-get install -y ufw
fi
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "== fail2ban =="
if ! dpkg -s fail2ban >/dev/null 2>&1; then
  apt-get install -y fail2ban
fi
systemctl enable --now fail2ban

echo "== 2G swap file =="
if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
else
  echo "swapfile already exists, skipping"
fi

echo "== Docker =="
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
else
  echo "docker already installed, skipping"
fi
if ! id -nG ubuntu | grep -qw docker; then
  usermod -aG docker ubuntu
fi

echo "== Coolify =="
# /data/coolify is Coolify's own default data directory for a self-hosted install — used
# here as the "already installed" check. Coolify's installer is documented as safe to
# re-run (it's also how Coolify upgrades itself), so this guard is a minor optimization,
# not a correctness requirement; confirm the directory name against the real installer
# output during the first real run and adjust this check if it differs.
if [ ! -d /data/coolify ]; then
  curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
else
  echo "coolify already installed, skipping (re-running the installer is also safe)"
fi

echo "== done =="
echo "Coolify UI: http://localhost:8000 (reach it via 'ssh -L 8000:localhost:8000 ubuntu@<ip>', see infra/README.md)"
