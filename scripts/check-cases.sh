#!/bin/bash

# 沃伦巴菲虾 - 案例完整性检查脚本
# 用途：验证所有 published 案例是否都能在主页找到链接

set -e

WORKSPACE="/home/admin/.openclaw/workspace"
CASES_YAML="$WORKSPACE/cases.yaml"
INDEX_HTML="$WORKSPACE/index.html"

echo "🦞 沃伦巴菲虾 - 案例完整性检查"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 检查配置文件是否存在
if [ ! -f "$CASES_YAML" ]; then
    echo "❌ 错误：cases.yaml 不存在"
    exit 1
fi

# 检查主页是否存在
if [ ! -f "$INDEX_HTML" ]; then
    echo "❌ 错误：index.html 不存在"
    exit 1
fi

published_count=0
linked_count=0
missing_links=()
broken_links=()

echo "📊 检查 published 案例的链接状态..."
echo ""

# 解析 YAML - 按 case 分组处理
current_id=""
current_name=""
current_html_file=""
current_status=""
in_case=false

while IFS= read -r line; do
    # 检测新的 case 开始
    if [[ $line =~ ^[[:space:]]*-[[:space:]]*id:.*\"([0-9]+)\" ]]; then
        # 处理前一个 case（如果有）
        if [ "$in_case" = true ] && [ "$current_status" = "published" ]; then
            published_count=$((published_count + 1))
            
            # 检查 HTML 文件是否存在
            if [ -f "$WORKSPACE/$current_html_file" ]; then
                file_status="✅"
            else
                file_status="❌"
                broken_links+=("$current_name ($current_html_file) - 文件不存在")
            fi
            
            # 检查主页中是否有此链接
            if grep -q "href=\"$current_html_file\"" "$INDEX_HTML"; then
                link_status="✅"
                linked_count=$((linked_count + 1))
            else
                link_status="❌"
                missing_links+=("$current_name ($current_html_file) - 主页无链接")
            fi
            
            printf "  %s CASE #%s %-15s 文件：%s  链接：%s\n" "$file_status" "$current_id" "$current_name" "$file_status" "$link_status"
        fi
        
        # 重置为新 case
        current_id="${BASH_REMATCH[1]}"
        current_name=""
        current_html_file=""
        current_status=""
        in_case=true
        continue
    fi
    
    # 解析字段
    if [[ $line =~ name:.*\"(.+)\" ]]; then
        current_name="${BASH_REMATCH[1]}"
    fi
    
    if [[ ! $line =~ md_file ]] && [[ $line =~ ^[[:space:]]+file:.*\"(.+)\" ]]; then
        current_html_file="${BASH_REMATCH[1]}"
    fi
    
    if [[ $line =~ status:.*\"(published|pending)\" ]]; then
        current_status="${BASH_REMATCH[1]}"
    fi
done < "$CASES_YAML"

# 处理最后一个 case
if [ "$in_case" = true ] && [ "$current_status" = "published" ]; then
    published_count=$((published_count + 1))
    
    if [ -f "$WORKSPACE/$current_html_file" ]; then
        file_status="✅"
    else
        file_status="❌"
        broken_links+=("$current_name ($current_html_file) - 文件不存在")
    fi
    
    if grep -q "href=\"$current_html_file\"" "$INDEX_HTML"; then
        link_status="✅"
        linked_count=$((linked_count + 1))
    else
        link_status="❌"
        missing_links+=("$current_name ($current_html_file) - 主页无链接")
    fi
    
    printf "  %s CASE #%s %-15s 文件：%s  链接：%s\n" "$file_status" "$current_id" "$current_name" "$file_status" "$link_status"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📈 统计结果："
echo "  - Published 案例：$published_count 个"
echo "  - 已正确链接：$linked_count 个"
echo "  - 缺失链接：${#missing_links[@]} 个"
echo "  - 文件缺失：${#broken_links[@]} 个"

# 报告问题
if [ ${#missing_links[@]} -gt 0 ]; then
    echo ""
    echo "⚠️  缺失链接的案例："
    for link in "${missing_links[@]}"; do
        echo "  - $link"
    done
    echo ""
    echo "💡 建议运行：./scripts/update-index.sh 自动修复"
    exit 1
fi

if [ ${#broken_links[@]} -gt 0 ]; then
    echo ""
    echo "⚠️  文件缺失的案例："
    for link in "${broken_links[@]}"; do
        echo "  - $link"
    done
    echo ""
    echo "💡 建议运行：./scripts/buffett-case-study.sh 生成缺失文件"
    exit 1
fi

echo ""
echo "✅ 所有 published 案例都已正确链接！"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
exit 0
