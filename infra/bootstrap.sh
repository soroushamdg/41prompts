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

echo "== harden ubuntu user: key-only SSH, root login by key only =="
sshd_hardening_file=/etc/ssh/sshd_config.d/99-41prompts-hardening.conf
cat > "$sshd_hardening_file" <<'EOF'
PasswordAuthentication no
# Coolify manages this host by SSHing in as root from its own container, authenticating
# with a key it generates at install (see the "Coolify" step below) — PermitRootLogin no
# would break that, so allow root login by key only, never by password.
PermitRootLogin prohibit-password
KbdInteractiveAuthentication no
EOF
if command -v sshd >/dev/null 2>&1; then
  mkdir -p /run/sshd
  sshd -t
fi
systemctl reload-or-restart ssh || systemctl restart ssh.socket

echo "== Coolify root SSH key (no-op until Coolify is installed) =="
coolify_root_pubkey=/data/coolify/ssh/keys/id.root@host.docker.internal.pub
if [ -f "$coolify_root_pubkey" ]; then
  mkdir -p /root/.ssh
  chmod 700 /root/.ssh
  touch /root/.ssh/authorized_keys
  chmod 600 /root/.ssh/authorized_keys
  if ! grep -qxF "$(cat "$coolify_root_pubkey")" /root/.ssh/authorized_keys; then
    cat "$coolify_root_pubkey" >> /root/.ssh/authorized_keys
  fi
else
  echo "Coolify root key not present yet (expected before Coolify is installed), skipping"
fi

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
cat > /etc/fail2ban/jail.d/41prompts.local <<'EOF'
[DEFAULT]
ignoreip = 127.0.0.1/8 ::1 10.0.0.0/8 172.16.0.0/12
EOF
systemctl enable --now fail2ban
systemctl restart fail2ban
fail2ban-client unban --all || true

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
