#!/bin/bash

# OpenClaw 安全快速检查脚本
# 用途：快速扫描常见安全问题
# 使用：./security-check.sh

set -e

WORKSPACE="/home/admin/.openclaw/workspace"
OPENCLAW_DIR="/home/admin/.openclaw"

echo "🔐 OpenClaw 安全快速检查"
echo "=========================="
echo "时间：$(date)"
echo ""

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 检查结果计数
PASS=0
WARN=0
FAIL=0

# 检查函数
check_pass() {
    echo -e "${GREEN}✓${NC} $1"
    ((PASS++))
}

check_warn() {
    echo -e "${YELLOW}⚠${NC} $1"
    ((WARN++))
}

check_fail() {
    echo -e "${RED}✗${NC} $1"
    ((FAIL++))
}

# 1. 检查敏感文件
echo "📁 检查敏感文件..."
cd "$WORKSPACE"

SENSITIVE_FILES=$(find . -maxdepth 3 \( -name "*.key" -o -name "*.pem" -o -name "*.crt" -o -name "id_rsa" -o -name "id_ed25519" \) 2>/dev/null | wc -l)
if [ "$SENSITIVE_FILES" -eq 0 ]; then
    check_pass "未发现敏感密钥文件"
else
    check_fail "发现 $SENSITIVE_FILES 个敏感文件："
    find . -maxdepth 3 \( -name "*.key" -o -name "*.pem" -o -name "*.crt" -o -name "id_rsa" -o -name "id_ed25519" \) 2>/dev/null
fi

# 2. 检查 .env 文件
ENV_FILES=$(find . -maxdepth 3 -name ".env*" -type f 2>/dev/null | wc -l)
if [ "$ENV_FILES" -eq 0 ]; then
    check_pass "未发现 .env 文件"
else
    check_warn "发现 $ENV_FILES 个 .env 文件："
    find . -maxdepth 3 -name ".env*" -type f 2>/dev/null
fi

# 3. 检查 .gitignore
echo -e "\n📝 检查 .gitignore..."
if [ -f ".gitignore" ]; then
    if grep -q "\.github_token" .gitignore && grep -q "\.env" .gitignore; then
        check_pass ".gitignore 配置完整"
    else
        check_warn ".gitignore 可能缺少敏感文件规则"
    fi
else
    check_fail "缺少 .gitignore 文件"
fi

# 4. 检查 Git 历史中的敏感信息（快速扫描）
echo -e "\n🔍 检查 Git 历史中的敏感模式..."
cd "$WORKSPACE"

# GitHub Token
GHP_TOKENS=$(git log --all --oneline 2>/dev/null | wc -l)
if git log --all -p 2>/dev/null | grep -qE "ghp_[a-zA-Z0-9]{36}"; then
    check_fail "Git 历史中可能包含 GitHub Token"
else
    check_pass "Git 历史中未发现 GitHub Token"
fi

# 通用密钥模式
if git log --all -p 2>/dev/null | grep -qE "password\s*[=:]\s*['\"][^'\"]{8,}['\"]"; then
    check_warn "Git 历史中可能包含密码"
else
    check_pass "Git 历史中未发现明显密码"
fi

# 5. 检查凭证目录权限
echo -e "\n🔑 检查凭证目录权限..."
if [ -d "$OPENCLAW_DIR/credentials" ]; then
    CRED_PERMS=$(stat -c %a "$OPENCLAW_DIR/credentials" 2>/dev/null || stat -f %Lp "$OPENCLAW_DIR/credentials" 2>/dev/null)
    if [ "$CRED_PERMS" -le 700 ]; then
        check_pass "凭证目录权限安全 ($CRED_PERMS)"
    else
        check_fail "凭证目录权限过松 ($CRED_PERMS)，应该是 700 或更严格"
    fi
else
    check_warn "未找到凭证目录"
fi

# 6. 检查记忆文件中的敏感信息
echo -e "\n📖 检查记忆文件..."
if [ -d "$WORKSPACE/memory" ]; then
    MEMORY_SECRETS=$(grep -rE "ghp_|sk_|password|secret|token" "$WORKSPACE/memory/" 2>/dev/null | wc -l)
    if [ "$MEMORY_SECRETS" -eq 0 ]; then
        check_pass "记忆文件中未发现明显敏感信息"
    else
        check_fail "记忆文件中发现 $MEMORY_SECRETS 处敏感信息："
        grep -rE "ghp_|sk_|password|secret|token" "$WORKSPACE/memory/" 2>/dev/null | head -5
    fi
fi

# 7. 检查 MEMORY.md
echo -e "\n📕 检查 MEMORY.md..."
if [ -f "$WORKSPACE/MEMORY.md" ]; then
    if grep -qE "ghp_|sk_|password|secret" "$WORKSPACE/MEMORY.md" 2>/dev/null; then
        check_fail "MEMORY.md 中包含敏感信息"
    else
        check_pass "MEMORY.md 未发现明显敏感信息"
    fi
else
    check_warn "MEMORY.md 不存在"
fi

# 8. 检查监听端口
echo -e "\n🌐 检查监听端口..."
if command -v ss &> /dev/null; then
    OPENCLAW_PORTS=$(ss -ltnup 2>/dev/null | grep -E "node|npm|openclaw" | wc -l)
    if [ "$OPENCLAW_PORTS" -eq 0 ]; then
        check_pass "未发现 OpenClaw 相关监听端口"
    else
        check_warn "发现 $OPENCLAW_PORTS 个 OpenClaw 相关端口："
        ss -ltnup 2>/dev/null | grep -E "node|npm|openclaw" | head -5
    fi
elif command -v netstat &> /dev/null; then
    OPENCLAW_PORTS=$(netstat -ltnup 2>/dev/null | grep -E "node|npm|openclaw" | wc -l)
    if [ "$OPENCLAW_PORTS" -eq 0 ]; then
        check_pass "未发现 OpenClaw 相关监听端口"
    else
        check_warn "发现 $OPENCLAW_PORTS 个 OpenClaw 相关端口："
        netstat -ltnup 2>/dev/null | grep -E "node|npm|openclaw" | head -5
    fi
else
    check_warn "无法检查端口（缺少 ss/netstat 命令）"
fi

# 9. 检查 .git 目录嵌套
echo -e "\n🗂️ 检查嵌套 Git 仓库..."
NESTED_GITS=$(find "$WORKSPACE" -maxdepth 3 -name ".git" -type d 2>/dev/null | wc -l)
if [ "$NESTED_GITS" -le 1 ]; then
    check_pass "未发现嵌套 Git 仓库"
else
    check_fail "发现嵌套 Git 仓库（可能导致部署失败）："
    find "$WORKSPACE" -maxdepth 3 -name ".git" -type d 2>/dev/null
fi

# 10. 检查 index.html
echo -e "\n📄 检查主页入口文件..."
if [ -f "$WORKSPACE/index.html" ]; then
    check_pass "index.html 存在"
else
    check_fail "缺少 index.html（GitHub Pages 将无法访问）"
fi

# 总结
echo -e "\n=========================="
echo "检查结果汇总："
echo -e "  ${GREEN}通过：$PASS${NC}"
echo -e "  ${YELLOW}警告：$WARN${NC}"
echo -e "  ${RED}失败：$FAIL${NC}"
echo ""

if [ "$FAIL" -gt 0 ]; then
    echo -e "${RED}⚠ 发现 $FAIL 个严重问题，建议立即修复！${NC}"
    echo ""
    echo "修复建议："
    echo "1. 移除或加密敏感文件"
    echo "2. 更新 .gitignore"
    echo "3. 如敏感信息已提交，使用 git filter-branch 清理历史"
    echo "4. 轮换可能泄露的凭证"
    exit 1
elif [ "$WARN" -gt 0 ]; then
    echo -e "${YELLOW}⚠ 发现 $WARN 个警告，建议审查${NC}"
    exit 0
else
    echo -e "${GREEN}✅ 安全检查通过！${NC}"
    exit 0
fi
