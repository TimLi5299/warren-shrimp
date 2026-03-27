#!/bin/bash

# 网站完整性检查通用框架
# 用途：验证网站的关键页面是否都能正确访问
# 用法：./site-integrity-check.sh <配置文件> <网站根目录>

set -e

# 参数检查
if [ $# -lt 2 ]; then
    echo "🔍 网站完整性检查工具"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "用法：$0 <配置文件> <网站根目录>"
    echo ""
    echo "参数："
    echo "  配置文件  - YAML 格式的页面配置（参考 docs/site-config-example.yaml）"
    echo "  网站根目录 - 网站文件的根目录"
    echo ""
    echo "示例："
    echo "  $0 cases.yaml /home/admin/.openclaw/workspace"
    echo "  $0 pages.yaml /var/www/my-site"
    echo ""
    exit 1
fi

CONFIG_FILE="$1"
SITE_ROOT="$2"

# 检查文件是否存在
if [ ! -f "$CONFIG_FILE" ]; then
    echo "❌ 错误：配置文件不存在 - $CONFIG_FILE"
    exit 1
fi

if [ ! -d "$SITE_ROOT" ]; then
    echo "❌ 错误：网站根目录不存在 - $SITE_ROOT"
    exit 1
fi

echo "🔍 网站完整性检查"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📁 配置文件：$CONFIG_FILE"
echo "📂 网站根目录：$SITE_ROOT"
echo ""

# 统计
total_count=0
published_count=0
file_ok_count=0
declare -a broken_files

# 解析配置
current_name=""
current_file=""
current_status="published"

while IFS= read -r line; do
    # 检测新条目开始
    if [[ "$line" =~ ^[[:space:]]*-[[:space:]]*(id:|name:) ]]; then
        # 处理前一个条目
        if [ -n "$current_name" ] && [ -n "$current_file" ] && [ "$current_status" = "published" ]; then
            published_count=$((published_count + 1))
            total_count=$((total_count + 1))
            
            if [ -f "$SITE_ROOT/$current_file" ]; then
                printf "  ✅ %-20s 文件：✅\n" "$current_name"
                file_ok_count=$((file_ok_count + 1))
            else
                printf "  ❌ %-20s 文件：❌\n" "$current_name"
                broken_files+=("$current_name ($current_file)")
            fi
        fi
        
        # 重置
        current_name=""
        current_file=""
        current_status="published"
        continue
    fi
    
    # 解析 name
    if [[ "$line" =~ name:.*\"(.+)\" ]]; then
        current_name="${BASH_REMATCH[1]}"
    fi
    
    # 解析 file (排除 md_file) - 注意顺序：先检查 md_file，再匹配 file
    if [[ ! "$line" =~ md_file ]] && [[ "$line" =~ file:.*\"(.+)\" ]]; then
        current_file="${BASH_REMATCH[1]}"
    fi
    
    # 解析 status
    if [[ "$line" =~ status:.*\"(published|pending|draft)\" ]]; then
        current_status="${BASH_REMATCH[1]}"
    fi
done < "$CONFIG_FILE"

# 处理最后一个条目
if [ -n "$current_name" ] && [ -n "$current_file" ] && [ "$current_status" = "published" ]; then
    published_count=$((published_count + 1))
    total_count=$((total_count + 1))
    
    if [ -f "$SITE_ROOT/$current_file" ]; then
        printf "  ✅ %-20s 文件：✅\n" "$current_name"
        file_ok_count=$((file_ok_count + 1))
    else
        printf "  ❌ %-20s 文件：❌\n" "$current_name"
        broken_files+=("$current_name ($current_file)")
    fi
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📈 统计结果："
echo "  - 总条目数：$total_count 个"
echo "  - Published 页面：$published_count 个"
echo "  - 文件正常：$file_ok_count 个"
echo "  - 文件缺失：${#broken_files[@]} 个"

# 报告问题
if [ ${#broken_files[@]} -gt 0 ]; then
    echo ""
    echo "⚠️  文件缺失的页面："
    for item in "${broken_files[@]}"; do
        echo "  - $item"
    done
    echo ""
    exit 1
fi

echo ""
echo "✅ 所有 published 页面都正常！"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
exit 0
